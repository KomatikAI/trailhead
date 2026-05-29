import type { CloudStore } from "./types.js";

export interface DigestCronOptions {
  store: CloudStore;
  intervalHours?: number;
  digestDays?: number;
  /** Bearer token used for internal deliver calls when org keys are not iterated. */
  deliverForOrgIds?: string[];
}

async function deliverForOrg(
  store: CloudStore,
  orgId: string,
  days: number,
): Promise<{ repo: string; status: number }[]> {
  const settings = store.getOrgSettings(orgId);
  if (!settings.digest?.enabled || !settings.digest.destination) return [];

  const { buildTuningDigestV1 } = await import("./tuning-digest.js");
  const fpThreshold = (settings.digest.fpThreshold ?? 15) / 100;
  const repos = store.listRepos(orgId);
  const delivered: Array<{ repo: string; status: number }> = [];

  for (const repo of repos) {
    const digest = buildTuningDigestV1({
      repoId: repo.fullName,
      evaluations: store.listAllEvaluations(orgId),
      feedback: store.listFeedback(orgId, repo.fullName),
      downgrades: store.listDetectorDowngrades(orgId),
      days,
      fpThreshold,
    });
    const response = await fetch(settings.digest.destination, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(digest),
      signal: AbortSignal.timeout(10_000),
    });
    delivered.push({ repo: repo.fullName, status: response.status });
  }

  return delivered;
}

export function startDigestCron(options: DigestCronOptions): () => void {
  const intervalHours = options.intervalHours ?? 24;
  const digestDays = options.digestDays ?? 7;
  const orgIds = options.deliverForOrgIds ?? [];

  const tick = async () => {
    for (const orgId of orgIds) {
      try {
        const delivered = await deliverForOrg(options.store, orgId, digestDays);
        console.log(
          JSON.stringify({
            level: "info",
            msg: "digest cron delivered",
            orgId,
            count: delivered.length,
            ts: new Date().toISOString(),
          }),
        );
      } catch (error) {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "digest cron failed",
            orgId,
            error: String(error),
            ts: new Date().toISOString(),
          }),
        );
      }
    }
  };

  const intervalMs = Math.max(intervalHours, 1) * 3_600_000;
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  console.log(
    JSON.stringify({
      level: "info",
      msg: "digest cron started",
      intervalHours,
      orgIds,
      ts: new Date().toISOString(),
    }),
  );

  return () => clearInterval(timer);
}
