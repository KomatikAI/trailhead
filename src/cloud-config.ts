/** Default Trailhead Cloud API base URL (override with TRAILHEAD_CLOUD_API_BASE). */
export const DEFAULT_CLOUD_API_BASE = "https://api.trailhead.dev";

export function resolveCloudApiBase(): string {
  const fromEnv = process.env.TRAILHEAD_CLOUD_API_BASE?.trim();
  return (fromEnv || DEFAULT_CLOUD_API_BASE).replace(/\/$/, "");
}

export interface EvaluationStoreUrlOptions {
  trailheadApiKey?: string;
  evaluationStoreUrl?: string;
}

/** Resolve evaluation store URL — explicit URL wins; otherwise derive from trailhead-api-key. */
export function resolveEvaluationStoreUrl(
  options: EvaluationStoreUrlOptions,
): string | undefined {
  const explicit = options.evaluationStoreUrl?.trim();
  if (explicit) return explicit;

  const apiKey = options.trailheadApiKey?.trim();
  if (apiKey) {
    return `${resolveCloudApiBase()}/v1/evaluations`;
  }

  return undefined;
}

/** Map evaluation ingest URL to deploy-events endpoint (cloud or legacy BYOS). */
export function resolveDeployEventsUrl(evaluationStoreUrl: string): string {
  if (evaluationStoreUrl.includes("/v1/evaluations")) {
    return evaluationStoreUrl.replace(/\/v1\/evaluations\/?$/, "/v1/deploy-events");
  }
  return evaluationStoreUrl.replace(/\/store\/?$/, "/deploy-event");
}
