const DEFAULT_CLOUD_BASE = "https://api.trailhead.dev";
function cloudBaseUrl() {
    const url = process.env.TRAILHEAD_CLOUD_API_URL?.trim();
    return url ? url.replace(/\/$/, "") : null;
}
function cloudApiKey() {
    const key = process.env.TRAILHEAD_API_KEY?.trim();
    return key || null;
}
export function isCloudFeedbackEnabled() {
    return Boolean(cloudBaseUrl() && cloudApiKey());
}
export async function postCloudFeedback(payload) {
    const base = cloudBaseUrl();
    const key = cloudApiKey();
    if (!base || !key)
        return null;
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
    if (!response.ok)
        return null;
    const body = (await response.json());
    return { stored: Boolean(body.stored), totalRecords: undefined };
}
export async function fetchCloudDetectorNoise(repo) {
    const base = cloudBaseUrl();
    const key = cloudApiKey();
    if (!base || !key)
        return null;
    const qs = repo ? `?repo_id=${encodeURIComponent(repo)}` : "";
    const response = await fetch(`${base}/v1/feedback/noise${qs}`, {
        headers: {
            Authorization: `Bearer ${key}`,
            Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
        return null;
    return response.json();
}
export async function fetchCloudPolicyTuning(repo, falsePositiveThreshold = 15) {
    const base = cloudBaseUrl();
    const key = cloudApiKey();
    if (!base || !key)
        return null;
    const params = new URLSearchParams();
    if (repo)
        params.set("repo_id", repo);
    params.set("fp_threshold", String(falsePositiveThreshold));
    const response = await fetch(`${base}/v1/feedback/tuning?${params}`, {
        headers: {
            Authorization: `Bearer ${key}`,
            Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
        return null;
    return response.json();
}
export function cloudFeedbackHint() {
    return DEFAULT_CLOUD_BASE;
}
function cloudAuthHeaders() {
    const base = cloudBaseUrl();
    const key = cloudApiKey();
    if (!base || !key)
        return null;
    return {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
    };
}
export async function fetchCloudEvaluations(repoId) {
    const headers = cloudAuthHeaders();
    const base = cloudBaseUrl();
    if (!headers || !base)
        return null;
    const params = new URLSearchParams();
    if (repoId)
        params.set("repo_id", repoId);
    const qs = params.toString();
    const response = await fetch(`${base}/v1/evaluations${qs ? `?${qs}` : ""}`, {
        headers,
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
        return null;
    const body = (await response.json());
    return body.evaluations ?? [];
}
export async function fetchCloudEvaluationById(evaluationId) {
    const headers = cloudAuthHeaders();
    const base = cloudBaseUrl();
    if (!headers || !base)
        return null;
    const response = await fetch(`${base}/v1/evaluations/${encodeURIComponent(evaluationId)}`, {
        headers,
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
        return null;
    return (await response.json());
}
