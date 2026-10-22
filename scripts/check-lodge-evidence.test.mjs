import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  evaluateLodgeEvidence,
  readEvidence,
  MAX_EVIDENCE_BYTES,
} from "./check-lodge-evidence.mjs";

const now = Date.parse("2026-10-22T20:00:00Z");
const expected = {
  commitSha: "a".repeat(40),
  deploymentId: "dpl_fixture",
  environment: "production",
  stripeMode: "live",
  models: ["fixture/model"],
};
// Synthetic observations only. These values are not Lodge canary evidence or provider prices.
export function fixture(at = now) {
  const observedAt = new Date(at).toISOString();
  let seq = 0;
  const proof = (data) => ({
    commitSha: expected.commitSha,
    deploymentId: expected.deploymentId,
    policySnapshotId: "policy_fixture",
    observedAt,
    url: `https://evidence.example.test/records/${++seq}`,
    ...data,
  });
  const debits = [
    ["koda", "chat_turn", 1],
    ["fireside", "chat_turn", 1],
    ["flow", "activity", 3],
  ].map(([surface, action, credits]) =>
    proof({
      surface,
      action,
      credits,
      kind: "debit",
      linkedUser: true,
      subjectId: "opaque_user_fixture",
      requestId: `request_${surface}`,
      ledgerId: `ledger_${surface}`,
      walletBefore: 10,
      walletAfter: 10 - credits,
    }),
  );
  return {
    schemaVersion: 1,
    repository: "KomatikAI/lodge",
    commitSha: expected.commitSha,
    deploymentId: expected.deploymentId,
    policySnapshotId: "policy_fixture",
    generatedAt: observedAt,
    deployment: proof({ project: "lodge-web", domain: "lodge.komatik.xyz" }),
    policy: proof({
      app: "lodge",
      enforced: true,
      ceilingMonitoringEnabled: true,
      prices: [
        {
          action: "chat_turn",
          active: true,
          tier: "explorer",
          credits: 1,
          minimumPaidTier: null,
          maxCogsCents: 1,
        },
        {
          action: "activity",
          active: true,
          tier: "explorer",
          credits: 3,
          minimumPaidTier: null,
          maxCogsCents: 2,
        },
      ],
    }),
    modelRates: [
      proof({
        provider: "fixture",
        model: "model",
        sourceUrl: "https://provider.example.test/pricing",
        sourceCheckedAt: observedAt,
        inputUsdPerMillion: 1,
        outputUsdPerMillion: 2,
        sourceInputUsdPerMillion: 1,
        sourceOutputUsdPerMillion: 2,
      }),
    ],
    debits,
    refund: proof({
      providerFailed: true,
      linkedUser: true,
      subjectId: "opaque_user_fixture",
      originalDebitId: "failed_debit",
      refundId: "refund",
      refundedDebitId: "failed_debit",
      requestId: "request_failure",
      originalDebitUrl: "https://evidence.example.test/failed-debit",
      action: "activity",
      debitedCredits: 3,
      refundedCredits: 3,
      walletBefore: 10,
      walletAfterDebit: 7,
      walletAfter: 10,
    }),
    topup: proof({
      mode: "live",
      linkedUser: true,
      subjectId: "opaque_user_fixture",
      checkoutSessionId: "cs_fixture",
      eventId: "evt_fixture",
      ledgerId: "topup",
      paymentStatus: "paid",
      webhookStatus: "fulfilled",
      fulfilledSessionId: "cs_fixture",
      fulfilledEventId: "evt_fixture",
      creditedCredits: 10,
      walletBefore: 0,
      walletAfter: 10,
      refreshedWalletBalance: 10,
      checkoutUrl: "https://evidence.example.test/checkout",
      eventUrl: "https://evidence.example.test/event",
    }),
    usage: debits.map((v) =>
      proof({
        provider: "fixture",
        model: "model",
        ledgerId: v.ledgerId,
        requestId: v.requestId,
        subjectId: v.subjectId,
        usageId: `usage_${v.surface}`,
        inputTokens: 100,
        outputTokens: 20,
        thinkingTokens: 30,
        durationMs: 1000,
        cogsCents: 0.02,
      }),
    ),
    health: proof({
      status: 200,
      endpoint: "https://lodge.komatik.xyz/api/lodge/health",
      app: "lodge",
      enforced: true,
      ceilingMonitoringEnabled: true,
      chatTurnCredits: 1,
      activityCredits: 3,
      chatTurnMaxCogsCents: 1,
      activityMaxCogsCents: 2,
    }),
    failureCanaries: [
      ["insufficient_balance", 402],
      ["policy_fault", 503],
      ["meter_fault", 503],
    ].map(([scenario, status]) =>
      proof({
        scenario,
        status,
        providerInvocations: 0,
        requestId: `failure_${scenario}`,
      }),
    ),
  };
}
const evaluate = (d, e = expected) => evaluateLodgeEvidence(d, e, now);
test("complete linked evidence permits the independently identified deployment", () => {
  const result = evaluate(fixture());
  assert.equal(result.promotable, true);
  assert.equal(result.shouldBlock, false);
  assert.equal(result.checks.length, 11);
  assert.ok(result.checks.every((v) => v.evidenceUrls.length > 0));
  assert.ok(!JSON.stringify(result).includes("opaque_user_fixture"));
});
test("absent evidence yields one actionable failure per condition", () => {
  const result = evaluate(null);
  assert.equal(result.shouldBlock, true);
  assert.equal(result.checks.length, 11);
  assert.ok(result.checks.every((v) => v.status === "fail" && v.remediation));
});
test("staging shadow can deploy but is explicitly not promotable", () => {
  const d = fixture();
  d.policy.enforced = false;
  const result = evaluate(d, { ...expected, environment: "staging" });
  assert.equal(result.promotable, false);
  assert.equal(result.outcome, "not_promotable");
  assert.equal(result.shouldBlock, false);
  assert.equal(evaluate(d).shouldBlock, true);
});
const cases = [
  [
    "wrong project",
    "deployment",
    (d) => {
      d.deployment.project = "lyra-web";
    },
  ],
  [
    "wrong domain",
    "deployment",
    (d) => {
      d.deployment.domain = "preview.vercel.app";
    },
  ],
  [
    "wrong price",
    "prices",
    (d) => {
      d.policy.prices[0].credits = 2;
    },
  ],
  [
    "missing price",
    "prices",
    (d) => {
      d.policy.prices.pop();
    },
  ],
  [
    "duplicate price",
    "prices",
    (d) => {
      d.policy.prices[1] = d.policy.prices[0];
    },
  ],
  [
    "paid tier",
    "prices",
    (d) => {
      d.policy.prices[0].minimumPaidTier = "pro";
    },
  ],
  [
    "inactive price",
    "prices",
    (d) => {
      d.policy.prices[0].active = false;
    },
  ],
  [
    "null ceiling",
    "ceilings",
    (d) => {
      d.policy.prices[0].maxCogsCents = null;
    },
  ],
  [
    "disabled monitoring",
    "ceilings",
    (d) => {
      d.policy.ceilingMonitoringEnabled = false;
    },
  ],
  [
    "stale provider source",
    "model_rates",
    (d) => {
      d.modelRates[0].sourceCheckedAt = "2026-07-21T00:00:00Z";
    },
  ],
  [
    "mismatched model price",
    "model_rates",
    (d) => {
      d.modelRates[0].inputUsdPerMillion = 0.15;
    },
  ],
  [
    "missing model",
    "model_rates",
    (d) => {
      d.modelRates = [];
    },
  ],
  [
    "duplicate model",
    "model_rates",
    (d) => {
      d.modelRates.push(d.modelRates[0]);
    },
  ],
  [
    "wrong debit",
    "debits",
    (d) => {
      d.debits[2].credits = 1;
    },
  ],
  [
    "unlinked user",
    "debits",
    (d) => {
      d.debits[0].linkedUser = false;
    },
  ],
  [
    "wrong wallet delta",
    "debits",
    (d) => {
      d.debits[0].walletAfter = 10;
    },
  ],
  [
    "duplicate debit",
    "debits",
    (d) => {
      d.debits[1].ledgerId = d.debits[0].ledgerId;
    },
  ],
  [
    "stale canary refreshed envelope",
    "debits",
    (d) => {
      d.debits[0].observedAt = "2026-07-21T00:00:00Z";
    },
  ],
  [
    "refund wrong original",
    "refund",
    (d) => {
      d.refund.refundedDebitId = "other";
    },
  ],
  [
    "partial refund",
    "refund",
    (d) => {
      d.refund.refundedCredits = 1;
    },
  ],
  [
    "wrong refund wallet",
    "refund",
    (d) => {
      d.refund.walletAfter = 7;
    },
  ],
  [
    "successful debit used as failure",
    "refund",
    (d) => {
      d.refund.originalDebitId = d.refund.refundedDebitId = d.debits[0].ledgerId;
    },
  ],
  [
    "unpaid topup",
    "topup",
    (d) => {
      d.topup.paymentStatus = "unpaid";
    },
  ],
  [
    "mismatched webhook",
    "topup",
    (d) => {
      d.topup.fulfilledEventId = "other";
    },
  ],
  [
    "wrong billing mode",
    "topup",
    (d) => {
      d.topup.mode = "test";
    },
  ],
  [
    "stale wallet",
    "topup",
    (d) => {
      d.topup.refreshedWalletBalance = 0;
    },
  ],
  [
    "no usage",
    "runtime_usage",
    (d) => {
      d.usage = [];
    },
  ],
  [
    "wrong usage user",
    "runtime_usage",
    (d) => {
      d.usage[0].subjectId = "other";
    },
  ],
  [
    "wrong usage request",
    "runtime_usage",
    (d) => {
      d.usage[0].requestId = "other";
    },
  ],
  [
    "missing thinking tokens",
    "runtime_usage",
    (d) => {
      delete d.usage[0].thinkingTokens;
    },
  ],
  [
    "wrong derived cogs",
    "runtime_usage",
    (d) => {
      d.usage[0].cogsCents = 0.01;
    },
  ],
  [
    "zero work",
    "runtime_usage",
    (d) => {
      d.usage[0].inputTokens = d.usage[0].outputTokens = d.usage[0].thinkingTokens = 0;
    },
  ],
  [
    "generic health",
    "health",
    (d) => {
      d.health = { status: 200, healthy: true };
    },
  ],
  [
    "health wrong policy",
    "health",
    (d) => {
      d.health.policySnapshotId = "old";
    },
  ],
  [
    "health wrong ceiling",
    "health",
    (d) => {
      d.health.activityMaxCogsCents = 1;
    },
  ],
  [
    "fault invokes provider",
    "failure_boundaries",
    (d) => {
      d.failureCanaries[1].providerInvocations = 1;
    },
  ],
  [
    "incorrect failure status",
    "failure_boundaries",
    (d) => {
      d.failureCanaries[0].status = 200;
    },
  ],
  [
    "missing proof link",
    "debits",
    (d) => {
      delete d.debits[0].url;
    },
  ],
  [
    "credential URL",
    "debits",
    (d) => {
      d.debits[0].url = "https://secret:password@example.test";
    },
  ],
];
for (const [name, id, mutate] of cases)
  test(name, () => {
    const d = fixture();
    mutate(d);
    const result = evaluate(d);
    assert.equal(result.shouldBlock, true);
    assert.equal(result.checks.find((v) => v.id === id).status, "fail");
  });
for (const [field, value] of [
  ["repository", "KomatikAI/other"],
  ["schemaVersion", 2],
  ["commitSha", "b".repeat(40)],
  ["deploymentId", "other"],
  ["generatedAt", "2026-10-22T18:59:59Z"],
  ["generatedAt", "2026-10-22T20:01:01Z"],
])
  test(`reject envelope ${field}=${value}`, () => {
    const d = fixture();
    d[field] = value;
    assert.ok(evaluate(d).checks.every((v) => v.status === "fail"));
  });
test("expected model inventory cannot silently omit a hosted model", () => {
  const result = evaluate(fixture(), {
    ...expected,
    models: ["fixture/model", "fixture/second"],
  });
  assert.equal(result.checks.find((v) => v.id === "model_rates").status, "fail");
});
test("invalid observations do not throw or pass", () => {
  for (const value of [null, 1, "pass", true, [], {}]) {
    const d = fixture();
    d.debits = [value];
    d.modelRates = [value];
    d.usage = [value];
    d.failureCanaries = [value];
    d.policy = value;
    assert.equal(evaluate(d).promotable, false);
  }
});
test("invalid or missing trusted expectations throw", () => {
  for (const e of [
    null,
    {},
    { ...expected, models: [] },
    { ...expected, environment: "prodution" },
    { ...expected, commitSha: "abc" },
    { ...expected, stripeMode: "test" },
  ])
    assert.throws(() => evaluate(fixture(), e));
});

test("test billing can be exercised on staging but cannot qualify for production", () => {
  const d = fixture();
  d.topup.mode = "test";
  assert.equal(
    evaluate(d, { ...expected, environment: "staging", stripeMode: "test" }).promotable,
    true,
  );
  assert.equal(evaluate(d).promotable, false);
});

test("generic success and overrides do not replace missing evidence", () => {
  const result = evaluate({
    ...fixture(),
    debits: [],
    build: "success",
    releaseReady: true,
    override: true,
    failMode: "open",
  });
  assert.equal(result.shouldBlock, true);
});

test("refund requires the original wallet debit, not only the final balance", () => {
  const d = fixture();
  d.refund.walletAfterDebit = d.refund.walletBefore;
  assert.equal(evaluate(d).checks.find((v) => v.id === "refund").status, "fail");
});

test("a successful request cannot also prove zero provider invocations", () => {
  const d = fixture();
  d.failureCanaries[0].requestId = d.debits[0].requestId;
  assert.equal(
    evaluate(d).checks.find((v) => v.id === "failure_boundaries").status,
    "fail",
  );
});

test("freshness boundaries and evidence links are retained", () => {
  assert.equal(evaluate(fixture(now - 60 * 60 * 1000)).promotable, true);
  assert.equal(evaluate(fixture(now + 60 * 1000)).promotable, true);
  const result = evaluate(fixture());
  assert.equal(result.checks.find((v) => v.id === "refund").evidenceUrls.length, 2);
  assert.equal(result.checks.find((v) => v.id === "topup").evidenceUrls.length, 3);
});
test("bounded reader rejects oversized, malformed and missing files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lodge-evidence-"));
  try {
    const path = join(dir, "evidence.json");
    await writeFile(path, "x".repeat(MAX_EVIDENCE_BYTES + 1));
    await assert.rejects(readEvidence(path));
    await writeFile(path, "{");
    await assert.rejects(readEvidence(path));
    await assert.rejects(readEvidence(join(dir, "missing")));
    await assert.rejects(readEvidence(dir));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("CLI enforces production failure and reports staging ineligible", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lodge-evidence-cli-"));
  try {
    const path = join(dir, "evidence.json");
    const script = fileURLToPath(new URL("./check-lodge-evidence.mjs", import.meta.url));
    const args = [
      script,
      "--evidence",
      path,
      "--sha",
      expected.commitSha,
      "--deployment",
      expected.deploymentId,
      "--stripe-mode",
      "live",
      "--models",
      "fixture/model",
      "--environment",
    ];
    for (const [environment, status] of [
      ["production", 1],
      ["staging", 0],
    ]) {
      const missing = spawnSync(process.execPath, [...args, environment], {
        encoding: "utf8",
      });
      assert.equal(missing.status, status, missing.stderr);
      assert.equal(JSON.parse(missing.stdout).outcome, "not_promotable");
    }
    await writeFile(path, JSON.stringify(fixture(Date.now())));
    const pass = spawnSync(process.execPath, [...args, "production"], {
      encoding: "utf8",
    });
    assert.equal(pass.status, 0, pass.stderr);
    assert.equal(JSON.parse(pass.stdout).promotable, true);
    const typo = spawnSync(process.execPath, [...args, "prodution"], {
      encoding: "utf8",
    });
    assert.equal(typo.status, 1);
    const duplicate = spawnSync(
      process.execPath,
      [...args, "staging", "--environment", "production"],
      { encoding: "utf8" },
    );
    assert.equal(duplicate.status, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
