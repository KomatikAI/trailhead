import {
  pickLatestPreviousEvaluation,
  type PreviousEvaluationSnapshot,
} from "./loop-bookkeeping.js";

const LOOKUP_TIMEOUT_MS = 8_000;

export interface FetchPreviousEvaluationParams {
  repoId: string;
  prNumber: number;
  excludeEvaluationId?: string;
  storeUrl?: string;
  apiKey?: string;
  storeSecret?: string;
  vercelBypass?: string;
}

function buildAuthHeaders(params: FetchPreviousEvaluationParams): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const secret = params.storeSecret ?? process.env.EVALUATION_STORE_SECRET;
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  } else if (params.apiKey) {
    headers.Authorization = `Bearer ${params.apiKey}`;
  }
  if (params.vercelBypass ?? process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] =
      params.vercelBypass ?? process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
  }
  return headers;
}

function resolveCloudListUrl(storeUrl: string): string | null {
  const trimmed = storeUrl.replace(/\/$/, "");
  if (trimmed.includes("/v1/evaluations")) {
    return trimmed.replace(/\/v1\/evaluations\/?$/, "/v1/evaluations");
  }
  return null;
}

async function fetchFromCloudStore(
  params: FetchPreviousEvaluationParams,
): Promise<PreviousEvaluationSnapshot | null> {
  if (!params.storeUrl) return null;
  const listUrl = resolveCloudListUrl(params.storeUrl);
  if (!listUrl) return null;

  const url = new URL(listUrl);
  url.searchParams.set("repo_id", params.repoId);
  url.searchParams.set("pr_number", String(params.prNumber));
  url.searchParams.set("limit", "10");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: buildAuthHeaders(params),
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });

  if (!response.ok) return null;
  const body = (await response.json()) as { evaluations?: unknown[] };
  if (!Array.isArray(body.evaluations)) return null;
  return pickLatestPreviousEvaluation(body.evaluations, params.excludeEvaluationId);
}

async function fetchFromSupabase(
  params: FetchPreviousEvaluationParams,
): Promise<PreviousEvaluationSnapshot | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;

  const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/trailhead_evaluations`);
  url.searchParams.set("repo_id", `eq.${params.repoId}`);
  url.searchParams.set("pr_number", `eq.${params.prNumber}`);
  url.searchParams.set("order", "created_at.desc");
  url.searchParams.set("limit", "10");
  url.searchParams.set(
    "select",
    "id,remediation,loop_round,previous_evaluation_id,fixes_resolved,fixes_introduced,created_at",
  );

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });

  if (!response.ok) return null;
  const rows = (await response.json()) as unknown[];
  if (!Array.isArray(rows)) return null;

  for (const row of rows) {
    const parsed = pickLatestPreviousEvaluation([row], params.excludeEvaluationId);
    if (!parsed) continue;
    if (!parsed.remediation && row && typeof row === "object") {
      const record = row as Record<string, unknown>;
      if (typeof record.loop_round === "number") {
        parsed.remediation = {
          schema: "trailhead.remediation.v1",
          release_ready: false,
          fixes: [],
          blocking_count: 0,
          warn_count: 0,
          advisory_count: 0,
          autofix_eligible_count: 0,
          loop_round: record.loop_round as number,
          max_loop_rounds: 3,
          fixes_resolved: Array.isArray(record.fixes_resolved)
            ? (record.fixes_resolved as string[])
            : [],
          fixes_introduced: Array.isArray(record.fixes_introduced)
            ? (record.fixes_introduced as string[])
            : [],
          next_action: "fix_and_retry",
        };
      }
    }
    return parsed;
  }

  return null;
}

export async function fetchPreviousEvaluationForPr(
  params: FetchPreviousEvaluationParams,
): Promise<PreviousEvaluationSnapshot | null> {
  try {
    const fromCloud = await fetchFromCloudStore(params);
    if (fromCloud) return fromCloud;
  } catch {
    // Fail-open — loop bookkeeping defaults to round 0.
  }

  try {
    return await fetchFromSupabase(params);
  } catch {
    return null;
  }
}
