import * as core from "@actions/core";
import * as github from "@actions/github";
import type { GateEvaluation } from "./types.js";
import { resolveAgentProvenanceId } from "./agent-provenance.js";
import { readTrustRuntime } from "./trust-runtime.js";
import { buildGateVerdict } from "./verdict.js";
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
    policyOverride: evaluation.policyOverride,
    verdict: buildGateVerdict(evaluation, {
      trustRuntime: readTrustRuntime(),
      agentId: resolveAgentProvenanceId(evaluation),
    }),
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

interface StoreAttemptResult {
  ok: boolean;
  retryable: boolean;
  /** 200 + X-Trailhead-Quota-Exceeded: true — stored, but over plan quota. */
  quotaExceeded?: boolean;
  /** 402 — org suspended (payment failure); evaluation NOT stored. */
  suspended?: boolean;
  /** 429 with a structured JSON body — hard usage cap; evaluation NOT stored. */
  hardCapped?: boolean;
}

async function storeViaApiOnce(
  url: string,
  evaluation: GateEvaluation,
): Promise<StoreAttemptResult> {
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
  const isJson = contentType.includes("application/json");

  if (response.ok && isJson) {
    core.info(`Evaluation stored successfully at ${url}`);
    const quotaExceeded = response.headers.get("x-trailhead-quota-exceeded") === "true";
    if (quotaExceeded) {
      core.warning(
        "Trailhead Cloud: this evaluation is over your plan's monthly quota. " +
          "It was still stored — upgrade at https://trailhead.komatik.xyz/pricing",
      );
    }
    return { ok: true, retryable: false, quotaExceeded };
  }

  // 402 = org suspended (payment failure). Availability of the paid store must
  // never block a merge — this is informational only, never a gate failure.
  if (response.status === 402) {
    core.warning(
      "Trailhead Cloud: your plan is suspended — this evaluation was NOT stored. " +
        "Reactivate at https://trailhead.komatik.xyz/pricing",
    );
    return { ok: false, retryable: false, suspended: true };
  }

  // A 429 with a structured JSON body can be EITHER the per-org rate limiter
  // (transient — a CI burst on one key — retryable) OR the monthly hard usage
  // cap backstop (permanent for the billing period — not retryable). The
  // Cloud API distinguishes the two via a machine-readable `code` field. A
  // 429 with a non-JSON (HTML) body is most likely Vercel bot protection,
  // which IS worth retrying — handled by the generic path below.
  if (response.status === 429 && isJson) {
    let code: unknown;
    try {
      const parsed = (await response.clone().json()) as { code?: unknown };
      code = parsed?.code;
    } catch {
      code = undefined;
    }

    if (code === "hard_cap_exceeded") {
      core.warning(
        "Trailhead Cloud: you're over this month's hard usage cap — this evaluation was NOT " +
          "stored. Upgrade at https://trailhead.komatik.xyz/pricing",
      );
      return { ok: false, retryable: false, hardCapped: true };
    }

    if (code === "rate_limited") {
      core.warning(
        `Trailhead Cloud: rate limit exceeded on attempt — this evaluation will be retried`,
      );
      return { ok: false, retryable: true, hardCapped: false };
    }

    // Unknown/missing code (e.g. an older Cloud API deployment that hasn't
    // rolled out the `code` field yet) — fail open and treat as retryable
    // rather than risk showing a false "hard cap" message to paying orgs.
    core.warning(
      "Trailhead Cloud: received HTTP 429 without a recognized `code` field — " +
        "treating as retryable",
    );
    return { ok: false, retryable: true, hardCapped: false };
  }

  const nonRetryableClientErrors = new Set([400, 401, 403]);
  if (nonRetryableClientErrors.has(response.status)) {
    core.warning(`Evaluation store returned HTTP ${response.status} — not retrying`);
    return { ok: false, retryable: false };
  }

  if (!isJson) {
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

interface StoreViaApiResult {
  stored: boolean;
  quotaExceeded: boolean;
  suspended: boolean;
  hardCapped: boolean;
}

async function storeViaApi(
  url: string,
  evaluation: GateEvaluation,
  maxRetries = 3,
): Promise<StoreViaApiResult> {
  const maxAttempts = maxRetries + 1;
  const notStored: StoreViaApiResult = {
    stored: false,
    quotaExceeded: false,
    suspended: false,
    hardCapped: false,
  };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await storeViaApiOnce(url, evaluation);
      if (result.ok) {
        return {
          stored: true,
          quotaExceeded: result.quotaExceeded ?? false,
          suspended: false,
          hardCapped: false,
        };
      }
      if (result.suspended || result.hardCapped) {
        return {
          ...notStored,
          suspended: result.suspended ?? false,
          hardCapped: result.hardCapped ?? false,
        };
      }
      if (!result.retryable || attempt >= maxAttempts - 1) return notStored;

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

  return notStored;
}

async function storeViaSupabase(evaluation: GateEvaluation): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return false;
  }

  const restUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/trailhead_evaluations`;

  const row = buildEvaluationStoreRow(evaluation);

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

export function buildEvaluationStoreRow(
  evaluation: GateEvaluation,
): Record<string, unknown> {
  const remediation = evaluation.remediation;
  const agentId = resolveAgentProvenanceId(evaluation);
  const verdict = buildGateVerdict(evaluation, {
    trustRuntime: readTrustRuntime(),
    agentId: agentId ?? undefined,
  });
  return {
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
    release_ready: evaluation.releaseReady ?? null,
    release_ready_reasons: evaluation.releaseReadyReasons ?? null,
    remediation: remediation ?? null,
    loop_round: remediation?.loop_round ?? 0,
    previous_evaluation_id: remediation?.previous_evaluation_id ?? null,
    fixes_resolved: remediation?.fixes_resolved ?? [],
    fixes_introduced: remediation?.fixes_introduced ?? [],
    pr: evaluation.pr ?? null,
    policy_override: evaluation.policyOverride ?? null,
    gate_mode: evaluation.gateMode ?? null,
    submission_checks: evaluation.submissionChecks ?? null,
    policy_findings: evaluation.policyFindings ?? null,
    trust_profile: evaluation.trust_profile ?? null,
    verdict,
    ci: evaluation.ci ?? null,
    context: evaluation.context ?? null,
    agent_provenance_id: agentId,
  };
}

export interface CloudStoreOutcome {
  stored: boolean;
  /** 200 + X-Trailhead-Quota-Exceeded: true — stored, but over plan quota. */
  quotaExceeded: boolean;
  /** 402 — org suspended (payment failure); evaluation NOT stored. */
  suspended: boolean;
  /** 429 hard usage cap (3x plan limit, abuse backstop); evaluation NOT stored. */
  hardCapped: boolean;
}

const NOT_STORED: CloudStoreOutcome = {
  stored: false,
  quotaExceeded: false,
  suspended: false,
  hardCapped: false,
};

/**
 * Store an evaluation and report the Cloud API's billing/quota state so
 * callers can surface it in the check summary. Availability of the paid
 * store — including suspension or a hard usage cap — must never throw or
 * otherwise block the gate; every path here is fail-open.
 */
export async function storeEvaluationDetailed(
  url: string,
  evaluation: GateEvaluation,
  options: { maxRetries?: number } = {},
): Promise<CloudStoreOutcome> {
  const maxRetries = options.maxRetries ?? 3;
  try {
    const result = await storeViaApi(url, evaluation, maxRetries);
    if (result.stored) {
      return { ...NOT_STORED, stored: true, quotaExceeded: result.quotaExceeded };
    }
    // Suspended/hard-capped are deliberate billing-gate outcomes from the
    // Cloud API, not transient failures — don't fall back to the legacy
    // Supabase direct-insert path, just report the state honestly.
    if (result.suspended || result.hardCapped) {
      return {
        ...NOT_STORED,
        suspended: result.suspended,
        hardCapped: result.hardCapped,
      };
    }
  } catch (error) {
    core.warning(`Evaluation store API failed: ${error}`);
  }

  try {
    const fallback = await storeViaSupabase(evaluation);
    if (fallback) return { ...NOT_STORED, stored: true };
  } catch (error) {
    core.warning(`Supabase direct fallback also failed: ${error}`);
  }

  core.warning(
    "Evaluation could not be stored. To fix: either set VERCEL_AUTOMATION_BYPASS_SECRET " +
      "or set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in your workflow env.",
  );
  return NOT_STORED;
}

export async function storeEvaluation(
  url: string,
  evaluation: GateEvaluation,
  options: { maxRetries?: number } = {},
): Promise<boolean> {
  const outcome = await storeEvaluationDetailed(url, evaluation, options);
  return outcome.stored;
}
