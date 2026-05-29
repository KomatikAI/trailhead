// Komatik prepaid-credit metering for Trailhead deliverables (deploy_check).
// Calls credit-meter-ingest over HTTPS — fail-open; never throws to callers.

import type { GateEvaluation } from "./types.js";

const METER_TIMEOUT_MS = 10_000;
const APP_SLUG = "trailhead";
const ACTION_SLUG = "deploy_check";

export interface CreditMeterConfig {
  enabled: boolean;
  url?: string;
  secret?: string;
  /** When true, record would-charge without debiting (Phase 0 default). */
  shadow: boolean;
  /** When true and ingest returns allowed:false, surface a blocking warning (opt-in). */
  enforce: boolean;
}

export interface CreditMeterUser {
  userId?: string;
  email?: string;
}

export interface CreditMeterResult {
  metered: boolean;
  skipped?: boolean;
  reason?: string;
  shadow?: boolean;
  would_charge?: number;
  charged?: number;
  balance?: number;
  allowed?: boolean;
  ok?: boolean;
}

export interface ResolveCreditMeterConfigOptions {
  url?: string;
  secret?: string;
  shadow?: boolean;
  enforce?: boolean;
}

export function resolveCreditMeterConfig(
  options: ResolveCreditMeterConfigOptions,
): CreditMeterConfig {
  const url = options.url?.trim();
  const secret = options.secret?.trim();
  const enabled = Boolean(url && secret);
  return {
    enabled,
    url,
    secret,
    shadow: options.shadow !== false,
    enforce: options.enforce === true,
  };
}

export function resolveCreditMeterUserFromEnv(): CreditMeterUser | null {
  const userId = process.env.TRAILHEAD_CREDIT_USER_ID?.trim();
  const email = process.env.TRAILHEAD_CREDIT_USER_EMAIL?.trim();
  if (userId) return { userId, email: email || undefined };
  if (email) return { email };
  return null;
}

function parseIngestResponse(body: unknown): CreditMeterResult {
  const r = (body ?? {}) as Record<string, unknown>;
  if (r.skipped === true) {
    return {
      metered: false,
      skipped: true,
      reason: typeof r.reason === "string" ? r.reason : "skipped",
      ok: r.ok === true,
    };
  }

  const allowed = r.allowed;
  const shadow = r.shadow === true;
  const wouldCharge =
    typeof r.would_charge === "number"
      ? r.would_charge
      : typeof r.wouldCharge === "number"
        ? r.wouldCharge
        : undefined;
  const charged = typeof r.charged === "number" ? r.charged : undefined;

  return {
    metered: true,
    ok: r.ok !== false,
    skipped: false,
    shadow,
    would_charge: wouldCharge ?? charged,
    charged,
    balance: typeof r.balance === "number" ? r.balance : undefined,
    allowed: allowed === undefined ? true : allowed === true,
    reason: typeof r.reason === "string" ? r.reason : undefined,
  };
}

/** Record one deploy_check against the member's Komatik credit wallet. */
export async function meterDeployCheck(
  evaluation: GateEvaluation,
  config: CreditMeterConfig,
  user: CreditMeterUser | null,
): Promise<CreditMeterResult> {
  if (!config.enabled || !config.url || !config.secret) {
    return { metered: false, skipped: true, reason: "not_configured" };
  }

  if (!user?.userId && !user?.email) {
    return { metered: false, skipped: true, reason: "no_member_identity" };
  }

  const idempotencyKey = `deploy-check:${evaluation.id}`;
  const payload: Record<string, unknown> = {
    appSlug: APP_SLUG,
    actionSlug: ACTION_SLUG,
    idempotencyKey,
    shadow: config.shadow,
    costCents: null,
    metadata: {
      evaluation_id: evaluation.id,
      repo_id: evaluation.repoId,
      commit_sha: evaluation.commitSha,
      pr_number: evaluation.prNumber ?? null,
      gate_decision: evaluation.gateDecision,
      release_ready: evaluation.releaseReady ?? null,
      gate_mode: evaluation.gateMode ?? null,
    },
  };

  if (user.userId) payload.userId = user.userId;
  else if (user.email) payload.email = user.email;

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-komatik-meter-secret": config.secret,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(METER_TIMEOUT_MS),
    });

    const text = await response.text();
    let parsed: unknown = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { error: text };
    }

    if (!response.ok) {
      return {
        metered: false,
        skipped: true,
        reason: `http_${response.status}`,
        ok: false,
      };
    }

    return parseIngestResponse(parsed);
  } catch {
    return { metered: false, skipped: true, reason: "request_failed", ok: false };
  }
}
