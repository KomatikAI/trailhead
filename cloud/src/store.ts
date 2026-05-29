import type {
  ApiKeyRecord,
  CloudStore,
  DeployEventPayload,
  EvaluationPayload,
  ManagedApiKey,
  OrgRecord,
  OrgSettings,
  QuotaSnapshot,
  RepoRecord,
  StoredEvaluation,
} from "./types.js";
import type { DetectorFeedbackRecord } from "./feedback-core.js";
import { canIngestEvaluation, generateApiKey, maskApiKey, monthKey } from "./billing.js";
import type { PlanTier } from "./billing.js";

export function createMemoryStore(seedKeys: ApiKeyRecord[] = []): CloudStore {
  const keys = new Map<string, ApiKeyRecord>();
  const managedKeys = new Map<string, ManagedApiKey>();
  for (const record of seedKeys) {
    keys.set(record.key, record);
    managedKeys.set(record.keyId, {
      id: record.keyId,
      orgId: record.orgId,
      key: record.key,
      label: record.label ?? "Seed key",
      keyPreview: maskApiKey(record.key),
      createdAt: new Date().toISOString(),
      revokedAt: null,
    });
  }

  const orgs = new Map<string, OrgRecord>();
  const orgSettings = new Map<string, OrgSettings>();
  const repos = new Map<string, RepoRecord>();
  const evaluations = new Map<string, StoredEvaluation>();
  const idempotency = new Map<string, string>();
  const deployEvents: Array<{ orgId: string; payload: DeployEventPayload }> = [];
  const feedback: DetectorFeedbackRecord[] = [];
  const usageByOrgMonth = new Map<string, number>();
  const detectorDowngrades = new Map<
    string,
    Map<string, import("./tuning-digest.js").DetectorDowngradeRecord>
  >();

  function ensureOrg(orgId: string, orgName: string): OrgRecord {
    const existing = orgs.get(orgId);
    if (existing) return existing;
    const org: OrgRecord = {
      id: orgId,
      name: orgName,
      createdAt: new Date().toISOString(),
    };
    orgs.set(orgId, org);
    if (!orgSettings.has(orgId)) {
      orgSettings.set(orgId, {
        plan: seedKeys.some((k) => k.orgId === orgId) ? "pro" : "free",
        seats: 3,
        seatsUsed: 1,
      });
    }
    return org;
  }

  function getSettings(orgId: string): OrgSettings {
    return orgSettings.get(orgId) ?? { plan: "free", seats: 1, seatsUsed: 1 };
  }

  function usageKey(orgId: string, month = monthKey()): string {
    return `${orgId}:${month}`;
  }

  function getUsage(orgId: string): number {
    return usageByOrgMonth.get(usageKey(orgId)) ?? 0;
  }

  function incrementUsage(orgId: string): number {
    const key = usageKey(orgId);
    const next = (usageByOrgMonth.get(key) ?? 0) + 1;
    usageByOrgMonth.set(key, next);
    return next;
  }

  function repoKey(orgId: string, fullName: string): string {
    return `${orgId}:${fullName}`;
  }

  return {
    getOrgForKey(apiKey: string): ApiKeyRecord | null {
      const record = keys.get(apiKey);
      if (!record) return null;
      const managed = managedKeys.get(record.keyId);
      if (managed?.revokedAt) return null;
      return record;
    },

    getOrgSettings(orgId: string): OrgSettings {
      ensureOrg(orgId, orgId);
      return getSettings(orgId);
    },

    updateOrgSettings(orgId: string, patch: Partial<OrgSettings>): OrgSettings {
      ensureOrg(orgId, orgId);
      const current = getSettings(orgId);
      const next: OrgSettings = {
        ...current,
        ...patch,
        digest: patch.digest ? { ...current.digest, ...patch.digest } : current.digest,
        sso: patch.sso ? { ...current.sso, ...patch.sso } : current.sso,
      };
      orgSettings.set(orgId, next);
      return next;
    },

    getQuota(orgId: string): QuotaSnapshot {
      const settings = getSettings(orgId);
      const used = getUsage(orgId);
      const limit = settings.plan === "free" ? 0 : settings.plan === "pro" ? 5000 : 50000;
      return {
        plan: settings.plan,
        limit,
        used,
        remaining: Math.max(0, limit - used),
      };
    },

    ingestEvaluation(
      orgId: string,
      payload: EvaluationPayload,
      idempotencyKey?: string,
    ): { created: boolean; evaluation: StoredEvaluation; quotaExceeded?: boolean } {
      const keyRecord = [...keys.values()].find((k) => k.orgId === orgId);
      ensureOrg(orgId, keyRecord?.orgName ?? orgId);
      const settings = getSettings(orgId);

      const idem = idempotencyKey ?? payload.id;
      const existingId = idempotency.get(`${orgId}:${idem}`);
      if (existingId) {
        const existing = evaluations.get(existingId);
        if (existing) {
          return { created: false, evaluation: existing };
        }
      }

      const used = getUsage(orgId);
      if (!canIngestEvaluation(settings.plan, used)) {
        return {
          created: false,
          evaluation: payload as StoredEvaluation,
          quotaExceeded: true,
        };
      }

      const receivedAt = new Date().toISOString();
      const agentFromPayload =
        typeof payload.agentProvenanceId === "string"
          ? payload.agentProvenanceId
          : typeof (payload as Record<string, unknown>).agent_provenance_id === "string"
            ? ((payload as Record<string, unknown>).agent_provenance_id as string)
            : undefined;
      const stored: StoredEvaluation = {
        ...payload,
        orgId,
        receivedAt,
        agentProvenanceId: agentFromPayload,
      };
      evaluations.set(stored.id, stored);
      idempotency.set(`${orgId}:${idem}`, stored.id);
      incrementUsage(orgId);

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

    recordFeedback(record: DetectorFeedbackRecord): DetectorFeedbackRecord {
      feedback.push(record);
      return record;
    },

    listFeedback(orgId: string, repoId?: string): DetectorFeedbackRecord[] {
      return feedback.filter(
        (row) => row.orgId === orgId && (!repoId || row.repo === repoId),
      );
    },

    listManagedKeys(orgId: string): ManagedApiKey[] {
      return [...managedKeys.values()]
        .filter((k) => k.orgId === orgId && !k.revokedAt)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    createApiKey(orgId: string, label?: string): { key: ManagedApiKey; secret: string } {
      const settings = getSettings(orgId);
      if (!settings.plan || settings.plan === "free") {
        throw new Error("API key provisioning requires Pro or Team plan");
      }
      const secret = generateApiKey();
      const id = `key_${crypto.randomUUID()}`;
      const managed: ManagedApiKey = {
        id,
        orgId,
        key: secret,
        label: label ?? "API key",
        keyPreview: maskApiKey(secret),
        createdAt: new Date().toISOString(),
        revokedAt: null,
      };
      managedKeys.set(id, managed);
      keys.set(secret, {
        keyId: id,
        key: secret,
        orgId,
        orgName: orgs.get(orgId)?.name ?? orgId,
        label: managed.label,
      });
      return { key: managed, secret };
    },

    revokeApiKey(orgId: string, keyId: string): boolean {
      const managed = managedKeys.get(keyId);
      if (!managed || managed.orgId !== orgId || managed.revokedAt) return false;
      managed.revokedAt = new Date().toISOString();
      keys.delete(managed.key);
      return true;
    },

    listOrgs(): OrgRecord[] {
      return [...orgs.values()].sort((a, b) => a.name.localeCompare(b.name));
    },

    listRepos(orgId: string): RepoRecord[] {
      return [...repos.values()]
        .filter((r) => r.orgId === orgId)
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
    },

    listEvaluations(
      orgId: string,
      repoId?: string,
      limit = 100,
      prNumber?: number,
    ): StoredEvaluation[] {
      let rows = [...evaluations.values()].filter((e) => e.orgId === orgId);
      if (repoId) {
        rows = rows.filter((e) => e.repoId === repoId);
      }
      if (prNumber !== undefined) {
        rows = rows.filter((e) => e.prNumber === prNumber);
      }
      rows.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
      return rows.slice(0, limit);
    },

    getEvaluation(orgId: string, id: string): StoredEvaluation | null {
      const row = evaluations.get(id);
      if (!row || row.orgId !== orgId) return null;
      return row;
    },

    listAllEvaluations(orgId: string): StoredEvaluation[] {
      return [...evaluations.values()]
        .filter((e) => e.orgId === orgId)
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    },

    listDeployEvents(
      orgId: string,
    ): Array<{ orgId: string; payload: DeployEventPayload }> {
      return deployEvents.filter((e) => e.orgId === orgId);
    },

    listDetectorDowngrades(orgId: string) {
      const rows = detectorDowngrades.get(orgId);
      return rows ? [...rows.values()] : [];
    },

    recordDetectorDowngrade(orgId, record) {
      let orgRows = detectorDowngrades.get(orgId);
      if (!orgRows) {
        orgRows = new Map();
        detectorDowngrades.set(orgId, orgRows);
      }
      orgRows.set(record.detectorCode, record);
      return record;
    },

    revertDetectorDowngrade(orgId, detectorCode, revertedBy) {
      const orgRows = detectorDowngrades.get(orgId);
      const existing = orgRows?.get(detectorCode);
      if (!existing || existing.revertedAt) return null;
      const next = {
        ...existing,
        revertedAt: new Date().toISOString(),
        revertedBy,
      };
      orgRows!.set(detectorCode, next);
      return next;
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
    return [
      {
        orgId,
        orgName: orgName ?? orgId,
        key,
        keyId: `seed_${orgId}`,
        label: "Seed key",
      },
    ];
  });
}
