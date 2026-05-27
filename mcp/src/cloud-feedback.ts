const DEFAULT_CLOUD_BASE = "https://api.trailhead.dev";

function cloudBaseUrl(): string | null {
  const url = process.env.TRAILHEAD_CLOUD_API_URL?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

function cloudApiKey(): string | null {
  const key = process.env.TRAILHEAD_API_KEY?.trim();
  return key || null;
}

export function isCloudFeedbackEnabled(): boolean {
  return Boolean(cloudBaseUrl() && cloudApiKey());
}

export async function postCloudFeedback(payload: {
  detector: string;
  disposition: "false_positive" | "true_positive" | "dismissed";
  repo?: string;
  reason?: string;
  evaluationId?: string;
}): Promise<{ stored: boolean; totalRecords?: number } | null> {
  const base = cloudBaseUrl();
  const key = cloudApiKey();
  if (!base || !key) return null;

  const response = await fetch(`${base}/v1/feedback`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) return null;
  const body = (await response.json()) as { stored?: boolean };
  return { stored: Boolean(body.stored), totalRecords: undefined };
}

export async function fetchCloudDetectorNoise(repo?: string): Promise<unknown | null> {
  const base = cloudBaseUrl();
  const key = cloudApiKey();
  if (!base || !key) return null;

  const qs = repo ? `?repo_id=${encodeURIComponent(repo)}` : "";
  const response = await fetch(`${base}/v1/feedback/noise${qs}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  return response.json();
}

export async function fetchCloudPolicyTuning(
  repo?: string,
  falsePositiveThreshold = 15,
): Promise<unknown | null> {
  const base = cloudBaseUrl();
  const key = cloudApiKey();
  if (!base || !key) return null;

  const params = new URLSearchParams();
  if (repo) params.set("repo_id", repo);
  params.set("fp_threshold", String(falsePositiveThreshold));
  const response = await fetch(`${base}/v1/feedback/tuning?${params}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  return response.json();
}

export function cloudFeedbackHint(): string {
  return DEFAULT_CLOUD_BASE;
}

function cloudAuthHeaders(): Record<string, string> | null {
  const base = cloudBaseUrl();
  const key = cloudApiKey();
  if (!base || !key) return null;
  return {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };
}

export async function fetchCloudEvaluations(
  repoId?: string,
): Promise<Array<Record<string, unknown>> | null> {
  const headers = cloudAuthHeaders();
  const base = cloudBaseUrl();
  if (!headers || !base) return null;

  const params = new URLSearchParams();
  if (repoId) params.set("repo_id", repoId);
  const qs = params.toString();
  const response = await fetch(`${base}/v1/evaluations${qs ? `?${qs}` : ""}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    evaluations?: Array<Record<string, unknown>>;
  };
  return body.evaluations ?? [];
}

export async function fetchCloudEvaluationById(
  evaluationId: string,
): Promise<Record<string, unknown> | null> {
  const headers = cloudAuthHeaders();
  const base = cloudBaseUrl();
  if (!headers || !base) return null;

  const response = await fetch(
    `${base}/v1/evaluations/${encodeURIComponent(evaluationId)}`,
    {
      headers,
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) return null;
  return (await response.json()) as Record<string, unknown>;
}
