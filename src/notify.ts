import * as core from "@actions/core";
import * as github from "@actions/github";
import type { GateEvaluation } from "./types.js";
import {
  resolveWebhookDeliveries,
  type ResolveTrailheadEventsOptions,
  type TrailheadEventType,
  type WebhookDelivery,
} from "./trailhead-events.js";

const WEBHOOK_TIMEOUT_MS = 10_000;
const STORE_TIMEOUT_MS = 10_000;
const STORE_RETRY_BACKOFF_MS = [1_000, 4_000, 16_000];
const STORE_RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    error.name === "AbortError" ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("enotfound")
  );
}

function buildPrUrl(evaluation: GateEvaluation): string | undefined {
  const { owner, repo } = github.context.repo;
  return evaluation.prNumber
    ? `https://github.com/${owner}/${repo}/pull/${evaluation.prNumber}`
    : undefined;
}

function slackTextForEvaluation(
  evaluation: GateEvaluation,
  prUrl: string | undefined,
  eventLabel?: string,
): string {
  const decisionEmoji: Record<string, string> = {
    allow: "✅",
    warn: "⚠️",
    block: "🚫",
  };
  const emoji = decisionEmoji[evaluation.gateDecision] ?? "";
  const prefix = eventLabel ? `[${eventLabel}] ` : "";
  return (
    `${prefix}${emoji} Trailhead *${evaluation.gateDecision.toUpperCase()}* — ` +
    `risk ${evaluation.riskScore}/100` +
    (prUrl
      ? ` | <${prUrl}|PR #${evaluation.prNumber}>`
      : ` | ${evaluation.commitSha.substring(0, 7)}`) +
    ` on \`${evaluation.repoId}\``
  );
}

function buildLegacyWebhookPayload(
  evaluation: GateEvaluation,
  prUrl: string | undefined,
): Record<string, unknown> {
  return {
    text: slackTextForEvaluation(evaluation, prUrl),
    decision: evaluation.gateDecision,
    riskScore: evaluation.riskScore,
    healthScore: evaluation.healthScore,
    repoId: evaluation.repoId,
    prNumber: evaluation.prNumber,
    prUrl,
    commitSha: evaluation.commitSha,
    riskFactors: evaluation.riskFactors,
    healthChecks: evaluation.healthChecks,
    reportUrl: evaluation.reportUrl,
    timestamp: new Date().toISOString(),
  };
}

function buildTrailheadEventPayload(
  evaluation: GateEvaluation,
  event: TrailheadEventType,
  prUrl: string | undefined,
): Record<string, unknown> {
  return {
    schema: "trailhead.webhook.v1",
    event,
    text: slackTextForEvaluation(evaluation, prUrl, event),
    evaluationId: evaluation.id,
    decision: evaluation.gateDecision,
    releaseReady: evaluation.releaseReady,
    riskScore: evaluation.riskScore,
    healthScore: evaluation.healthScore,
    repoId: evaluation.repoId,
    prNumber: evaluation.prNumber,
    prUrl,
    headRef: evaluation.pr?.headRef,
    commitSha: evaluation.commitSha,
    remediation: evaluation.remediation,
    agentBriefMode: evaluation.agentBriefMode,
    provenance: evaluation.pr?.provenance,
    trustProfile: evaluation.trust_profile,
    nextAction: evaluation.remediation?.next_action,
    loopRound: evaluation.remediation?.loop_round,
    maxLoopRounds: evaluation.remediation?.max_loop_rounds,
    timestamp: new Date().toISOString(),
  };
}

async function postWebhookPayload(
  url: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });

    if (!response.ok) {
      core.debug(
        `Webhook returned ${response.status} — notification may not have been delivered`,
      );
    }
  } catch (error) {
    core.debug(`Webhook delivery failed: ${error}`);
  }
}

export async function sendWebhook(
  url: string,
  evaluation: GateEvaluation,
): Promise<void> {
  const prUrl = buildPrUrl(evaluation);
  await postWebhookPayload(url, buildLegacyWebhookPayload(evaluation, prUrl));
}

export async function deliverWebhookEvent(
  url: string,
  evaluation: GateEvaluation,
  delivery: WebhookDelivery,
): Promise<void> {
  const prUrl = buildPrUrl(evaluation);
  const payload =
    delivery.kind === "legacy"
      ? buildLegacyWebhookPayload(evaluation, prUrl)
      : buildTrailheadEventPayload(
          evaluation,
          delivery.event as TrailheadEventType,
          prUrl,
        );
  await postWebhookPayload(url, payload);
}

export async function deliverWebhooks(
  url: string,
  evaluation: GateEvaluation,
  subscribedEvents: Iterable<string>,
  options: ResolveTrailheadEventsOptions = {},
): Promise<void> {
  const subscribed =
    subscribedEvents instanceof Set ? subscribedEvents : new Set(subscribedEvents);
  const deliveries = resolveWebhookDeliveries(evaluation, subscribed, options);
  for (const delivery of deliveries) {
    await deliverWebhookEvent(url, evaluation, delivery);
  }
}

async function storeViaApiOnce(
  url: string,
  evaluation: GateEvaluation,
): Promise<{
  ok: boolean;
  retryable: boolean;
}> {
  const storeSecret = process.env.EVALUATION_STORE_SECRET;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (storeSecret) {
    headers["Authorization"] = `Bearer ${storeSecret}`;
  }
  headers["Idempotency-Key"] = evaluation.id;

  const vercelBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (vercelBypass) {
    headers["x-vercel-protection-bypass"] = vercelBypass;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(evaluation),
    signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
  });

  const contentType = response.headers.get("content-type") ?? "";

  if (response.ok && contentType.includes("application/json")) {
    core.info(`Evaluation stored successfully at ${url}`);
    return { ok: true, retryable: false };
  }

  const nonRetryableClientErrors = new Set([400, 401, 403]);
  if (nonRetryableClientErrors.has(response.status)) {
    core.warning(`Evaluation store returned HTTP ${response.status} — not retrying`);
    return { ok: false, retryable: false };
  }

  if (!contentType.includes("application/json")) {
    core.warning(
      `Evaluation store at ${url} returned HTML instead of JSON (HTTP ${response.status}). ` +
        `Vercel bot protection is likely blocking the request.`,
    );
  } else {
    core.warning(
      `Evaluation store returned HTTP ${response.status} — data may not be persisted`,
    );
  }

  return {
    ok: false,
    retryable: STORE_RETRYABLE_STATUSES.has(response.status),
  };
}

async function storeViaApi(
  url: string,
  evaluation: GateEvaluation,
  maxRetries = 3,
): Promise<boolean> {
  const maxAttempts = maxRetries + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await storeViaApiOnce(url, evaluation);
      if (result.ok) return true;
      if (!result.retryable || attempt >= maxAttempts - 1) return false;

      const delayMs = STORE_RETRY_BACKOFF_MS[attempt] ?? 16_000;
      core.warning(
        `Evaluation store attempt ${attempt + 1}/${maxAttempts} failed — retrying in ${delayMs}ms`,
      );
      await sleep(delayMs);
    } catch (error) {
      if (!isRetryableNetworkError(error) || attempt >= maxAttempts - 1) {
        throw error;
      }
      const delayMs = STORE_RETRY_BACKOFF_MS[attempt] ?? 16_000;
      core.warning(
        `Evaluation store network error on attempt ${attempt + 1}/${maxAttempts} — retrying in ${delayMs}ms`,
      );
      await sleep(delayMs);
    }
  }

  return false;
}

async function storeViaSupabase(evaluation: GateEvaluation): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return false;
  }

  const restUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/trailhead_evaluations`;

  const row = {
    id: evaluation.id,
    repo_id: evaluation.repoId,
    commit_sha: evaluation.commitSha,
    pr_number: evaluation.prNumber ?? null,
    health_score: evaluation.healthScore,
    risk_score: evaluation.riskScore,
    gate_decision: evaluation.gateDecision,
    health_checks: evaluation.healthChecks,
    risk_factors: evaluation.riskFactors,
    files: evaluation.files ?? null,
    evaluation_ms: evaluation.evaluationMs,
    report_url: evaluation.reportUrl ?? null,
  };

  const response = await fetch(restUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
  });

  if (response.ok || response.status === 201) {
    core.info("Evaluation stored via direct Supabase insert");
    return true;
  }

  const body = await response.text().catch(() => "");
  core.warning(`Supabase direct insert failed (HTTP ${response.status}): ${body}`);
  return false;
}

export async function storeEvaluation(
  url: string,
  evaluation: GateEvaluation,
  options: { maxRetries?: number } = {},
): Promise<boolean> {
  const maxRetries = options.maxRetries ?? 3;
  try {
    const stored = await storeViaApi(url, evaluation, maxRetries);
    if (stored) return true;
  } catch (error) {
    core.warning(`Evaluation store API failed: ${error}`);
  }

  try {
    const fallback = await storeViaSupabase(evaluation);
    if (fallback) return true;
  } catch (error) {
    core.warning(`Supabase direct fallback also failed: ${error}`);
  }

  core.warning(
    "Evaluation could not be stored. To fix: either set VERCEL_AUTOMATION_BYPASS_SECRET " +
      "or set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in your workflow env.",
  );
  return false;
}
