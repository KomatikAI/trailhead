import type {
  ApiKeyRecord,
  CloudStore,
  DeployEventPayload,
  EvaluationPayload,
  OrgRecord,
  RepoRecord,
  StoredEvaluation,
} from "./types.js";

export function createMemoryStore(seedKeys: ApiKeyRecord[] = []): CloudStore {
  const keys = new Map<string, ApiKeyRecord>();
  for (const record of seedKeys) {
    keys.set(record.key, record);
  }

  const orgs = new Map<string, OrgRecord>();
  const repos = new Map<string, RepoRecord>();
  const evaluations = new Map<string, StoredEvaluation>();
  const idempotency = new Map<string, string>();
  const deployEvents: Array<{ orgId: string; payload: DeployEventPayload }> = [];

  function ensureOrg(orgId: string, orgName: string): OrgRecord {
    const existing = orgs.get(orgId);
    if (existing) return existing;
    const org: OrgRecord = {
      id: orgId,
      name: orgName,
      createdAt: new Date().toISOString(),
    };
    orgs.set(orgId, org);
    return org;
  }

  function repoKey(orgId: string, fullName: string): string {
    return `${orgId}:${fullName}`;
  }

  return {
    getOrgForKey(apiKey: string): ApiKeyRecord | null {
      return keys.get(apiKey) ?? null;
    },

    ingestEvaluation(
      orgId: string,
      payload: EvaluationPayload,
      idempotencyKey?: string,
    ): { created: boolean; evaluation: StoredEvaluation } {
      const keyRecord = [...keys.values()].find((k) => k.orgId === orgId);
      ensureOrg(orgId, keyRecord?.orgName ?? orgId);

      const idem = idempotencyKey ?? payload.id;
      const existingId = idempotency.get(`${orgId}:${idem}`);
      if (existingId) {
        const existing = evaluations.get(existingId);
        if (existing) {
          return { created: false, evaluation: existing };
        }
      }

      const receivedAt = new Date().toISOString();
      const stored: StoredEvaluation = {
        ...payload,
        orgId,
        receivedAt,
      };
      evaluations.set(stored.id, stored);
      idempotency.set(`${orgId}:${idem}`, stored.id);

      const rKey = repoKey(orgId, payload.repoId);
      const repoExisting = repos.get(rKey);
      if (repoExisting) {
        repos.set(rKey, {
          ...repoExisting,
          lastEvaluationAt: receivedAt,
          evaluationCount: repoExisting.evaluationCount + 1,
        });
      } else {
        repos.set(rKey, {
          id: rKey,
          orgId,
          fullName: payload.repoId,
          firstSeenAt: receivedAt,
          lastEvaluationAt: receivedAt,
          evaluationCount: 1,
        });
      }

      return { created: true, evaluation: stored };
    },

    recordDeployEvent(orgId: string, payload: DeployEventPayload): void {
      deployEvents.push({ orgId, payload });
    },

    listOrgs(): OrgRecord[] {
      return [...orgs.values()].sort((a, b) => a.name.localeCompare(b.name));
    },

    listRepos(orgId: string): RepoRecord[] {
      return [...repos.values()]
        .filter((r) => r.orgId === orgId)
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
    },

    listEvaluations(orgId: string, repoId?: string, limit = 100): StoredEvaluation[] {
      let rows = [...evaluations.values()].filter((e) => e.orgId === orgId);
      if (repoId) {
        rows = rows.filter((e) => e.repoId === repoId);
      }
      rows.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
      return rows.slice(0, limit);
    },
  };
}

export function parseSeedKeys(raw: string | undefined): ApiKeyRecord[] {
  if (!raw?.trim()) return [];
  return raw.split(",").flatMap((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) return [];
    const [orgId, orgName, key] = trimmed.split(":");
    if (!orgId || !key) return [];
    return [{ orgId, orgName: orgName ?? orgId, key }];
  });
}
