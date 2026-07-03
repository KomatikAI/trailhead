import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { createMemoryStore } from "./store.js";
import { createPgStore } from "./pg-store.js";
import { runMigrations } from "./migrate.js";
import { hashApiKey, PLANS } from "./billing.js";
import type { CloudStore, EvaluationPayload } from "./types.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

function evalPayload(
  id: string,
  over: Partial<EvaluationPayload> = {},
): EvaluationPayload {
  return {
    id,
    repoId: "acme/repo",
    commitSha: "abc1234",
    healthScore: 100,
    riskScore: 10,
    gateDecision: "allow",
    healthChecks: [],
    riskFactors: [],
    evaluationMs: 5,
    ...over,
  } as EvaluationPayload;
}

interface BackendCtx {
  store: CloudStore;
  /** Force the org's current-month usage to exactly `n`. */
  seedUsage: (orgId: string, n: number) => Promise<void>;
}

interface BackendDef {
  name: string;
  beforeAllHook?: () => Promise<void>;
  afterAllHook?: () => Promise<void>;
  setup: () => Promise<BackendCtx>;
}

const memoryBackend: BackendDef = {
  name: "memory",
  async setup() {
    const store = createMemoryStore();
    return {
      store,
      async seedUsage(orgId, n) {
        let used = (await store.getQuota(orgId)).used;
        for (let i = used; i < n; i += 1) {
          await store.ingestEvaluation(orgId, evalPayload(`seed-${orgId}-${i}`));
        }
        used = (await store.getQuota(orgId)).used;
      },
    };
  },
};

let pool: pg.Pool | undefined;
const pgBackend: BackendDef = {
  name: "pg",
  async beforeAllHook() {
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
    await runMigrations(pool);
  },
  async afterAllHook() {
    await pool?.end();
    pool = undefined;
  },
  async setup() {
    await pool!.query(
      "TRUNCATE orgs, idempotency_keys, stripe_webhook_events RESTART IDENTITY CASCADE",
    );
    const store = createPgStore(pool!);
    const { monthKey } = await import("./billing.js");
    return {
      store,
      async seedUsage(orgId, n) {
        await pool!.query(
          `INSERT INTO usage_counters (org_id, month_key, evals) VALUES ($1, $2, $3)
             ON CONFLICT (org_id, month_key) DO UPDATE SET evals = $3`,
          [orgId, monthKey(), n],
        );
      },
    };
  },
};

const backends: BackendDef[] = [memoryBackend];
if (TEST_DATABASE_URL) {
  backends.push(pgBackend);
} else {
  // eslint-disable-next-line no-console
  console.warn(
    "[store-contract] TEST_DATABASE_URL not set — pg-store covered only by memory parity assertions",
  );
}

describe.each(backends)("CloudStore contract [$name]", (backend) => {
  let store: CloudStore;
  let seedUsage: BackendCtx["seedUsage"];

  beforeAll(async () => {
    await backend.beforeAllHook?.();
  });
  afterAll(async () => {
    await backend.afterAllHook?.();
  });
  beforeEach(async () => {
    const ctx = await backend.setup();
    store = ctx.store;
    seedUsage = ctx.seedUsage;
  });

  async function newProOrg(over: { customer?: string; sub?: string } = {}) {
    return store.createOrgWithSubscription({
      orgName: "Acme Inc",
      plan: "pro",
      stripeCustomerId: over.customer ?? "cus_A",
      stripeSubscriptionId: over.sub ?? "sub_A",
      status: "active",
      currentPeriodEnd: null,
    });
  }

  it("resolves an org by hashed key; plaintext is never the lookup key", async () => {
    const { org, keySecret } = await newProOrg();
    expect(hashApiKey(keySecret)).not.toBe(keySecret);

    const resolved = await store.getOrgForKey(keySecret);
    expect(resolved?.orgId).toBe(org.id);
    expect(resolved?.suspended).toBe(false);

    expect(await store.getOrgForKey("thk_not_a_real_key")).toBeNull();
  });

  it("suspends and unsuspends keys from subscription status transitions", async () => {
    const { org, keySecret } = await newProOrg();

    const affected = await store.updateSubscriptionByStripeId("sub_A", {
      status: "past_due",
    });
    expect(affected).toBe(org.id);
    expect((await store.getOrgForKey(keySecret))?.suspended).toBe(true);

    await store.updateSubscriptionByStripeId("sub_A", { status: "active" });
    expect((await store.getOrgForKey(keySecret))?.suspended).toBe(false);

    expect(
      await store.updateSubscriptionByStripeId("sub_unknown", { status: "active" }),
    ).toBeNull();
  });

  it("setKeysSuspended toggles suspension directly", async () => {
    const { org, keySecret } = await newProOrg();
    await store.setKeysSuspended(org.id, true);
    expect((await store.getOrgForKey(keySecret))?.suspended).toBe(true);
    await store.setKeysSuspended(org.id, false);
    expect((await store.getOrgForKey(keySecret))?.suspended).toBe(false);
  });

  it("updateSubscriptionByStripeId tolerates null→value and syncs plan", async () => {
    const { org } = await newProOrg();
    const periodEnd = "2026-08-01T00:00:00.000Z";
    await store.updateSubscriptionByStripeId("sub_A", {
      plan: "team",
      currentPeriodEnd: periodEnd,
    });
    const sub = await store.getSubscriptionForOrg(org.id);
    expect(sub?.plan).toBe("team");
    expect(sub?.currentPeriodEnd).toBe(periodEnd);
    expect((await store.getOrgSettings(org.id)).plan).toBe("team");
  });

  it("upsertSubscriptionFromStripe creates a minimal org when the webhook was lost", async () => {
    const orgId = await store.upsertSubscriptionFromStripe({
      stripeCustomerId: "cus_lost",
      stripeSubscriptionId: "sub_lost",
      plan: "team",
      status: "active",
      currentPeriodEnd: null,
    });
    expect(orgId).toBeTruthy();
    expect((await store.getOrgSettings(orgId)).plan).toBe("team");
    const sub = await store.getSubscriptionForOrg(orgId);
    expect(sub?.stripeSubscriptionId).toBe("sub_lost");

    // Idempotent: re-running updates in place, no duplicate row.
    const again = await store.upsertSubscriptionFromStripe({
      stripeCustomerId: "cus_lost",
      stripeSubscriptionId: "sub_lost",
      plan: "team",
      status: "past_due",
      currentPeriodEnd: null,
    });
    expect(again).toBe(orgId);
    const forCustomer = (await store.listSubscriptions()).filter(
      (s) => s.stripeCustomerId === "cus_lost",
    );
    expect(forCustomer).toHaveLength(1);
    expect(forCustomer[0].status).toBe("past_due");
  });

  it("upsertSubscriptionFromStripe reuses the org for a known customer", async () => {
    const { org } = await newProOrg({ customer: "cus_reuse", sub: "sub_first" });
    const orgId = await store.upsertSubscriptionFromStripe({
      stripeCustomerId: "cus_reuse",
      stripeSubscriptionId: "sub_second",
      plan: "team",
      status: "active",
      currentPeriodEnd: null,
    });
    expect(orgId).toBe(org.id);
  });

  it("stripe webhook ledger is idempotent, and removeStripeEvent rolls it back", async () => {
    expect(await store.recordStripeEvent("evt_1", "checkout.session.completed", {})).toBe(
      true,
    );
    expect(await store.recordStripeEvent("evt_1", "checkout.session.completed", {})).toBe(
      false,
    );
    await store.removeStripeEvent("evt_1");
    expect(await store.recordStripeEvent("evt_1", "checkout.session.completed", {})).toBe(
      true,
    );
  });

  it("key claims: claim once, then already-claimed / expired / purge", async () => {
    const { org } = await newProOrg();
    const future = new Date(Date.now() + 3_600_000).toISOString();
    await store.createKeyClaim("cs_ok", org.id, "cipher-ok", future);

    expect(await store.claimKey("cs_ok")).toEqual({ ciphertext: "cipher-ok" });
    expect(await store.claimKey("cs_ok")).toEqual({ alreadyClaimed: true });
    expect(await store.claimKey("cs_missing")).toBeNull();

    const past = new Date(Date.now() - 1000).toISOString();
    await store.createKeyClaim("cs_exp", org.id, "cipher-exp", past);
    expect(await store.claimKey("cs_exp")).toEqual({ expired: true });

    const purged = await store.purgeExpiredClaims();
    expect(purged).toBeGreaterThanOrEqual(1);
    expect(await store.claimKey("cs_exp")).toBeNull();
  });

  it("ingest is idempotent by evaluation id", async () => {
    const { org } = await newProOrg();
    const first = await store.ingestEvaluation(org.id, evalPayload("e1"));
    expect(first.created).toBe(true);

    const second = await store.ingestEvaluation(
      org.id,
      evalPayload("e1", { riskScore: 99 }),
    );
    expect(second.created).toBe(false);
    expect(second.evaluation.riskScore).toBe(10);
    expect((await store.getEvaluation(org.id, "e1"))?.riskScore).toBe(10);
  });

  it("ingest stores evaluations, derives repos, and counts usage", async () => {
    const { org } = await newProOrg();
    await store.ingestEvaluation(org.id, evalPayload("e1"));
    await store.ingestEvaluation(org.id, evalPayload("e2"));

    const rows = await store.listEvaluations(org.id);
    expect(rows).toHaveLength(2);
    const repos = await store.listRepos(org.id);
    expect(repos.find((r) => r.fullName === "acme/repo")?.evaluationCount).toBe(2);
    expect((await store.getQuota(org.id)).used).toBe(2);
  });

  it("free plan ingest is blocked (not stored)", async () => {
    const { org } = await newProOrg();
    await store.updateOrgSettings(org.id, { plan: "free" });
    const result = await store.ingestEvaluation(org.id, evalPayload("free-1"));
    expect(result.created).toBe(false);
    expect(result.quotaExceeded).toBe(true);
    expect(result.hardLimited).toBeFalsy();
    expect((await store.getQuota(org.id)).limit).toBe(0);
  });

  it("soft over-quota is stored with a flag; the 3× hard limit rejects", async () => {
    const { org } = await newProOrg();
    const limit = PLANS.pro.evaluationsPerMonth;

    await seedUsage(org.id, limit);
    const soft = await store.ingestEvaluation(org.id, evalPayload("soft-1"));
    expect(soft.created).toBe(true);
    expect(soft.quotaExceeded).toBe(true);
    expect(soft.hardLimited).toBeFalsy();

    await seedUsage(org.id, limit * 3);
    const hard = await store.ingestEvaluation(org.id, evalPayload("hard-1"));
    expect(hard.created).toBe(false);
    expect(hard.hardLimited).toBe(true);
    expect(await store.getEvaluation(org.id, "hard-1")).toBeNull();
  });

  it("concurrent ingests at the hard-cap boundary never overshoot the cap (quota race fix)", async () => {
    const { org } = await newProOrg();
    const limit = PLANS.pro.evaluationsPerMonth;
    const hardCap = limit * 3; // HARD_LIMIT_MULTIPLIER

    // evaluateQuota: store === !hardLimited, and hardLimited === used >= hardCap
    // (usage measured BEFORE this insert). So exactly `margin` more ingests can
    // still be stored (usage climbs hardCap-margin, ..., hardCap-1) before the
    // used-count reaches hardCap and every subsequent ingest is rejected —
    // regardless of how many arrive concurrently at that boundary.
    const margin = 5;
    const burst = 20;
    await seedUsage(org.id, hardCap - margin);

    const results = await Promise.all(
      Array.from({ length: burst }, (_, i) =>
        store.ingestEvaluation(org.id, evalPayload(`race-${org.id}-${i}`)),
      ),
    );

    const storedCount = results.filter((r) => r.created).length;
    const hardLimitedCount = results.filter((r) => r.hardLimited).length;

    // The race (unlocked read-then-increment) would let more than `margin`
    // concurrent requests all observe used < hardCap and all get stored,
    // pushing usage past hardCap. The fix (row lock / atomic JS execution)
    // must cap stored count at exactly `margin`.
    expect(storedCount).toBe(margin);
    expect(hardLimitedCount).toBe(burst - margin);

    const finalUsed = (await store.getQuota(org.id)).used;
    expect(finalUsed).toBe(hardCap);
  });
});
