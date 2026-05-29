import {
  pickLatestPreviousEvaluation,
  type PreviousEvaluationSnapshot,
} from "./loop-bookkeeping.js";

const LOOKUP_TIMEOUT_MS = 8_000;
const KOMATIK_STORE_PATH = /\/api\/(?:trailhead|deployguard)\/store$/;

export interface FetchPreviousEvaluationParams {
  repoId: string;
  prNumber: number;
  excludeEvaluationId?: string;
  storeUrl?: string;
  apiKey?: string;
  storeSecret?: string;
  vercelBypass?: string;
}

function buildAuthHeaders(params: {
  apiKey?: string;
  storeSecret?: string;
  vercelBypass?: string;
}): Record<string, string> {
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

/** komatik.ai hosted store → loop lookup list endpoint. */
export function resolveKomatikListUrl(storeUrl: string): string | null {
  const trimmed = storeUrl.replace(/\/$/, "");
  if (!KOMATIK_STORE_PATH.test(trimmed)) return null;
  return trimmed.replace(KOMATIK_STORE_PATH, "/api/trailhead/evaluations");
}

function enrichSnapshotFromLoopColumns(
  parsed: PreviousEvaluationSnapshot,
  row: Record<string, unknown>,
): PreviousEvaluationSnapshot {
  if (parsed.remediation || typeof row.loop_round !== "number") {
    return parsed;
  }

  return {
    ...parsed,
    remediation: {
      schema: "trailhead.remediation.v1",
      release_ready: false,
      fixes: [],
      blocking_count: 0,
      warn_count: 0,
      advisory_count: 0,
      autofix_eligible_count: 0,
      loop_round: row.loop_round as number,
      max_loop_rounds: 3,
      fixes_resolved: Array.isArray(row.fixes_resolved)
        ? (row.fixes_resolved as string[])
        : [],
      fixes_introduced: Array.isArray(row.fixes_introduced)
        ? (row.fixes_introduced as string[])
        : [],
      next_action: "fix_and_retry",
    },
  };
}

function pickPreviousFromRows(
  rows: unknown[],
  excludeEvaluationId?: string,
): PreviousEvaluationSnapshot | null {
  for (const row of rows) {
    const parsed = pickLatestPreviousEvaluation([row], excludeEvaluationId);
    if (!parsed) continue;
    if (row && typeof row === "object") {
      return enrichSnapshotFromLoopColumns(parsed, row as Record<string, unknown>);
    }
    return parsed;
  }
  return null;
}

async function fetchEvaluationList(
  listUrl: string,
  params: FetchPreviousEvaluationParams,
): Promise<PreviousEvaluationSnapshot | null> {
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
  return pickPreviousFromRows(body.evaluations, params.excludeEvaluationId);
}

async function fetchFromCloudStore(
  params: FetchPreviousEvaluationParams,
): Promise<PreviousEvaluationSnapshot | null> {
  if (!params.storeUrl) return null;
  const listUrl = resolveCloudListUrl(params.storeUrl);
  if (!listUrl) return null;
  return fetchEvaluationList(listUrl, params);
}

async function fetchFromKomatikStore(
  params: FetchPreviousEvaluationParams,
): Promise<PreviousEvaluationSnapshot | null> {
  if (!params.storeUrl) return null;
  const listUrl = resolveKomatikListUrl(params.storeUrl);
  if (!listUrl) return null;
  return fetchEvaluationList(listUrl, params);
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
  return pickPreviousFromRows(rows, params.excludeEvaluationId);
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
    const fromKomatik = await fetchFromKomatikStore(params);
    if (fromKomatik) return fromKomatik;
  } catch {
    // Fail-open — loop bookkeeping defaults to round 0.
  }

  try {
    return await fetchFromSupabase(params);
  } catch {
    return null;
  }
}

function isLabelOverrideRow(row: Record<string, unknown>): boolean {
  const raw = row.policy_override ?? row.policyOverride;
  if (!raw || typeof raw !== "object") return false;
  const source = (raw as Record<string, unknown>).source;
  return source === "label";
}

function rowCreatedAtMs(row: Record<string, unknown>): number | null {
  const createdAt = row.created_at ?? row.createdAt;
  if (typeof createdAt !== "string") return null;
  const parsed = Date.parse(createdAt);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function countRecentLabelOverrides(params: {
  repoId: string;
  storeUrl?: string;
  apiKey?: string;
  storeSecret?: string;
  vercelBypass?: string;
  windowDays?: number;
}): Promise<number | null> {
  const windowDays = params.windowDays ?? 7;
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - windowMs;

  const listUrls: string[] = [];
  if (params.storeUrl) {
    const cloudUrl = resolveCloudListUrl(params.storeUrl);
    const komatikUrl = resolveKomatikListUrl(params.storeUrl);
    if (cloudUrl) listUrls.push(cloudUrl);
    if (komatikUrl) listUrls.push(komatikUrl);
  }

  for (const listUrl of listUrls) {
    try {
      const url = new URL(listUrl);
      url.searchParams.set("repo_id", params.repoId);
      url.searchParams.set("limit", "100");

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: buildAuthHeaders(params),
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      });
      if (!response.ok) continue;

      const body = (await response.json()) as { evaluations?: unknown[] };
      if (!Array.isArray(body.evaluations)) continue;

      let count = 0;
      for (const row of body.evaluations) {
        if (!row || typeof row !== "object") continue;
        const record = row as Record<string, unknown>;
        if (!isLabelOverrideRow(record)) continue;
        const createdAtMs = rowCreatedAtMs(record);
        if (createdAtMs !== null && createdAtMs < cutoff) continue;
        count += 1;
      }
      return count;
    } catch {
      // Try next store URL.
    }
  }

  return null;
}
