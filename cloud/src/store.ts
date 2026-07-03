import type {
  ApiKeyRecord,
  CloudStore,
  CreateOrgWithSubscriptionInput,
  CreateOrgWithSubscriptionResult,
  DeployEventPayload,
  EvaluationPayload,
  IngestResult,
  KeyClaimResult,
  ManagedApiKey,
  OrgRecord,
  OrgSettings,
  QuotaSnapshot,
  RepoRecord,
  StoredEvaluation,
  SubscriptionPatch,
  SubscriptionRecord,
} from "./types.js";
import type { DetectorFeedbackRecord } from "./feedback-core.js";
import {
  evaluateQuota,
  generateApiKey,
  hashApiKey,
  maskApiKey,
  monthKey,
  PLANS,
} from "./billing.js";
import type { PlanTier } from "./billing.js";

/** Stripe subscription statuses that force key suspension (contract). */
export const SUSPEND_STATUSES = new Set([
  "past_due",
  "unpaid",
  "canceled",
  "incomplete_expired",
]);
/** Statuses that (re)activate an org's keys. */
export const UNSUSPEND_STATUSES = new Set(["active", "trialing"]);

interface KeyClaim {
  sessionId: string;
  orgId: string;
  ciphertext: string;
  claimedAt: string | null;
  expiresAt: string;
}

export function createMemoryStore(seedKeys: ApiKeyRecord[] = []): CloudStore {
  // keyed by sha256(hash) of the plaintext key.
  const keys = new Map<string, ApiKeyRecord>();
  const managedKeys = new Map<string, ManagedApiKey>();

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
  const subscriptions = new Map<string, SubscriptionRecord>(); // by stripeSubscriptionId
  const stripeEvents = new Set<string>();
  const keyClaims = new Map<string, KeyClaim>();

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
        plan: [...keys.values()].some((k) => k.orgId === orgId) ? "pro" : "free",
        seats: 3,
        seatsUsed: 1,
      });
    }
    return org;
  }

  function storeKey(record: ApiKeyRecord): void {
    keys.set(hashApiKey(record.key), record);
  }

  for (const record of seedKeys) {
    const rec: ApiKeyRecord = { ...record, suspended: record.suspended ?? false };
    storeKey(rec);
    managedKeys.set(rec.keyId, {
      id: rec.keyId,
      orgId: rec.orgId,
      key: rec.key,
      label: rec.label ?? "Seed key",
      keyPreview: maskApiKey(rec.key),
      createdAt: new Date().toISOString(),
      revokedAt: null,
    });
    ensureOrg(rec.orgId, rec.orgName);
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

  function setKeySuspension(orgId: string, suspended: boolean): void {
    for (const rec of keys.values()) {
      if (rec.orgId === orgId) rec.suspended = suspended;
    }
  }

  function applyStatusToKeys(orgId: string, status: string): void {
    if (SUSPEND_STATUSES.has(status)) setKeySuspension(orgId, true);
    else if (UNSUSPEND_STATUSES.has(status)) setKeySuspension(orgId, false);
  }

  function quotaFor(orgId: string): QuotaSnapshot {
    const settings = getSettings(orgId);
    const used = getUsage(orgId);
    const limit = PLANS[settings.plan].evaluationsPerMonth;
    return {
      plan: settings.plan,
      limit,
      used,
      remaining: Math.max(0, limit - used),
    };
  }

  return {
    async getOrgForKey(apiKey: string): Promise<ApiKeyRecord | null> {
      const record = keys.get(hashApiKey(apiKey));
      if (!record) return null;
      const managed = managedKeys.get(record.keyId);
      if (managed?.revokedAt) return null;
      return record;
    },

    async getOrgSettings(orgId: string): Promise<OrgSettings> {
      ensureOrg(orgId, orgId);
      return getSettings(orgId);
    },

    async updateOrgSettings(
      orgId: string,
      patch: Partial<OrgSettings>,
    ): Promise<OrgSettings> {
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

    async getQuota(orgId: string): Promise<QuotaSnapshot> {
      return quotaFor(orgId);
    },

    async ingestEvaluation(
      orgId: string,
      payload: EvaluationPayload,
      idempotencyKey?: string,
    ): Promise<IngestResult> {
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

      // NOTE on the pg-store check-then-act race (SELECT ... FOR UPDATE fix
      // there): this in-memory store does not need an equivalent lock. There
      // is no `await` between reading `used` here and calling
      // incrementUsage() below, and this store runs entirely on the single
      // JS event loop (no separate DB round-trip to interleave with), so the
      // read-decide-increment sequence is already atomic.
      const used = getUsage(orgId);
      const quota = evaluateQuota(settings.plan, used);
      if (!quota.store) {
        return {
          created: false,
          evaluation: payload as StoredEvaluation,
          quotaExceeded: quota.overQuota,
          hardLimited: quota.hardLimited,
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

      return { created: true, evaluation: stored, quotaExceeded: quota.overQuota };
    },

    async recordDeployEvent(orgId: string, payload: DeployEventPayload): Promise<void> {
      deployEvents.push({ orgId, payload });
    },

    async recordFeedback(
      record: DetectorFeedbackRecord,
    ): Promise<DetectorFeedbackRecord> {
      feedback.push(record);
      return record;
    },

    async listFeedback(
      orgId: string,
      repoId?: string,
    ): Promise<DetectorFeedbackRecord[]> {
      return feedback.filter(
        (row) => row.orgId === orgId && (!repoId || row.repo === repoId),
      );
    },

    async listManagedKeys(orgId: string): Promise<ManagedApiKey[]> {
      return [...managedKeys.values()]
        .filter((k) => k.orgId === orgId && !k.revokedAt)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async createApiKey(
      orgId: string,
      label?: string,
    ): Promise<{ key: ManagedApiKey; secret: string }> {
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
      storeKey({
        keyId: id,
        key: secret,
        orgId,
        orgName: orgs.get(orgId)?.name ?? orgId,
        label: managed.label,
        suspended: false,
      });
      return { key: managed, secret };
    },

    async revokeApiKey(orgId: string, keyId: string): Promise<boolean> {
      const managed = managedKeys.get(keyId);
      if (!managed || managed.orgId !== orgId || managed.revokedAt) return false;
      managed.revokedAt = new Date().toISOString();
      keys.delete(hashApiKey(managed.key));
      return true;
    },

    async listOrgs(): Promise<OrgRecord[]> {
      return [...orgs.values()].sort((a, b) => a.name.localeCompare(b.name));
    },

    async listRepos(orgId: string): Promise<RepoRecord[]> {
      return [...repos.values()]
        .filter((r) => r.orgId === orgId)
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
    },

    async listEvaluations(
      orgId: string,
      repoId?: string,
      limit = 100,
      prNumber?: number,
    ): Promise<StoredEvaluation[]> {
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

    async getEvaluation(orgId: string, id: string): Promise<StoredEvaluation | null> {
      const row = evaluations.get(id);
      if (!row || row.orgId !== orgId) return null;
      return row;
    },

    async listAllEvaluations(orgId: string): Promise<StoredEvaluation[]> {
      return [...evaluations.values()]
        .filter((e) => e.orgId === orgId)
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    },

    async listDeployEvents(
      orgId: string,
    ): Promise<Array<{ orgId: string; payload: DeployEventPayload }>> {
      return deployEvents.filter((e) => e.orgId === orgId);
    },

    async listDetectorDowngrades(orgId: string) {
      const rows = detectorDowngrades.get(orgId);
      return rows ? [...rows.values()] : [];
    },

    async recordDetectorDowngrade(orgId, record) {
      let orgRows = detectorDowngrades.get(orgId);
      if (!orgRows) {
        orgRows = new Map();
        detectorDowngrades.set(orgId, orgRows);
      }
      orgRows.set(record.detectorCode, record);
      return record;
    },

    async revertDetectorDowngrade(orgId, detectorCode, revertedBy) {
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

    // --- Billing surface ---

    async createOrgWithSubscription(
      input: CreateOrgWithSubscriptionInput,
    ): Promise<CreateOrgWithSubscriptionResult> {
      const orgId = crypto.randomUUID();
      const now = new Date().toISOString();
      const org: OrgRecord = { id: orgId, name: input.orgName, createdAt: now };
      orgs.set(orgId, org);
      orgSettings.set(orgId, {
        plan: input.plan,
        seats: PLANS[input.plan].seatsIncluded,
        seatsUsed: 1,
      });

      const subscription: SubscriptionRecord = {
        id: crypto.randomUUID(),
        orgId,
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        plan: input.plan,
        status: input.status,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
        createdAt: now,
        updatedAt: now,
      };
      subscriptions.set(subscription.stripeSubscriptionId, subscription);

      const secret = generateApiKey();
      const keyId = `key_${crypto.randomUUID()}`;
      const keyRecord: ApiKeyRecord = {
        keyId,
        key: secret,
        orgId,
        orgName: input.orgName,
        label: input.keyLabel ?? "Primary key",
        suspended: false,
      };
      storeKey(keyRecord);
      managedKeys.set(keyId, {
        id: keyId,
        orgId,
        key: secret,
        label: keyRecord.label ?? "Primary key",
        keyPreview: maskApiKey(secret),
        createdAt: now,
        revokedAt: null,
      });

      return { org, keySecret: secret, keyRecord };
    },

    async updateSubscriptionByStripeId(
      stripeSubscriptionId: string,
      patch: SubscriptionPatch,
    ): Promise<string | null> {
      const existing = subscriptions.get(stripeSubscriptionId);
      if (!existing) return null;
      const next: SubscriptionRecord = {
        ...existing,
        plan: patch.plan ?? existing.plan,
        status: patch.status ?? existing.status,
        currentPeriodEnd:
          patch.currentPeriodEnd !== undefined
            ? patch.currentPeriodEnd
            : existing.currentPeriodEnd,
        updatedAt: new Date().toISOString(),
      };
      subscriptions.set(stripeSubscriptionId, next);

      if (patch.plan) {
        const settings = getSettings(existing.orgId);
        orgSettings.set(existing.orgId, { ...settings, plan: patch.plan });
      }
      if (patch.status) {
        applyStatusToKeys(existing.orgId, patch.status);
      }
      return existing.orgId;
    },

    async upsertSubscriptionFromStripe(sub): Promise<string> {
      const now = new Date().toISOString();
      const existing = subscriptions.get(sub.stripeSubscriptionId);
      if (existing) {
        subscriptions.set(sub.stripeSubscriptionId, {
          ...existing,
          plan: sub.plan,
          status: sub.status,
          currentPeriodEnd: sub.currentPeriodEnd ?? null,
          updatedAt: now,
        });
        orgSettings.set(existing.orgId, {
          ...getSettings(existing.orgId),
          plan: sub.plan,
        });
        applyStatusToKeys(existing.orgId, sub.status);
        return existing.orgId;
      }

      let orgId = [...subscriptions.values()].find(
        (s) => s.stripeCustomerId === sub.stripeCustomerId,
      )?.orgId;
      if (!orgId) {
        orgId = crypto.randomUUID();
        orgs.set(orgId, { id: orgId, name: sub.stripeCustomerId, createdAt: now });
        orgSettings.set(orgId, {
          plan: sub.plan,
          seats: PLANS[sub.plan].seatsIncluded,
          seatsUsed: 1,
        });
      } else {
        orgSettings.set(orgId, { ...getSettings(orgId), plan: sub.plan });
      }

      subscriptions.set(sub.stripeSubscriptionId, {
        id: crypto.randomUUID(),
        orgId,
        stripeCustomerId: sub.stripeCustomerId,
        stripeSubscriptionId: sub.stripeSubscriptionId,
        plan: sub.plan,
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd ?? null,
        createdAt: now,
        updatedAt: now,
      });
      applyStatusToKeys(orgId, sub.status);
      return orgId;
    },

    async setKeysSuspended(orgId: string, suspended: boolean): Promise<void> {
      setKeySuspension(orgId, suspended);
    },

    async recordStripeEvent(
      eventId: string,
      _eventType: string,
      _payload: unknown,
    ): Promise<boolean> {
      if (stripeEvents.has(eventId)) return false;
      stripeEvents.add(eventId);
      return true;
    },

    async removeStripeEvent(eventId: string): Promise<void> {
      stripeEvents.delete(eventId);
    },

    async createKeyClaim(
      sessionId: string,
      orgId: string,
      ciphertext: string,
      expiresAt: string,
    ): Promise<void> {
      keyClaims.set(sessionId, {
        sessionId,
        orgId,
        ciphertext,
        claimedAt: null,
        expiresAt,
      });
    },

    async claimKey(sessionId: string): Promise<KeyClaimResult> {
      const claim = keyClaims.get(sessionId);
      if (!claim) return null;
      if (claim.claimedAt) return { alreadyClaimed: true };
      if (new Date(claim.expiresAt).getTime() <= Date.now()) return { expired: true };
      claim.claimedAt = new Date().toISOString();
      return { ciphertext: claim.ciphertext };
    },

    async purgeExpiredClaims(): Promise<number> {
      const now = Date.now();
      let purged = 0;
      for (const [sessionId, claim] of keyClaims) {
        if (!claim.claimedAt && new Date(claim.expiresAt).getTime() <= now) {
          keyClaims.delete(sessionId);
          purged += 1;
        }
      }
      return purged;
    },

    async getSubscriptionForOrg(orgId: string): Promise<SubscriptionRecord | null> {
      const rows = [...subscriptions.values()]
        .filter((s) => s.orgId === orgId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return rows[0] ?? null;
    },

    async listSubscriptions(): Promise<SubscriptionRecord[]> {
      return [...subscriptions.values()];
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
        suspended: false,
      },
    ];
  });
}
