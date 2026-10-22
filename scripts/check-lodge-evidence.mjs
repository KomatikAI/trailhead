#!/usr/bin/env node
/** Independent, fail-closed Lodge promotion check. See docs/lodge-evidence-gate.md. */
import { open } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const MAX_EVIDENCE_BYTES = 1_000_000;
const MAX_AGE_MS = 60 * 60 * 1000;
const FUTURE_SKEW_MS = 60 * 1000;
const SHA = /^[a-f0-9]{40}$/;
const nonempty = (v) => typeof v === "string" && v.length > 0 && v.length <= 500;
const number = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const count = (v) => number(v) && Number.isSafeInteger(v);
const list = (v) => (Array.isArray(v) ? v : []);
const unique = (v) => new Set(v).size === v.length;
const https = (v) => {
  try {
    const url = new URL(v);
    return (
      typeof v === "string" &&
      v.length <= 2048 &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
};
const key = (v) => `${v?.provider}/${v?.model}`;
const fresh = (v, now) => {
  if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT.*Z$/.test(v)) return false;
  const age = now - Date.parse(v);
  return Number.isFinite(age) && age >= -FUTURE_SKEW_MS && age <= MAX_AGE_MS;
};

/** Expectations MUST come from protected release configuration, not the evidence. */
export function evaluateLodgeEvidence(document, expected, now = Date.now()) {
  if (
    !expected ||
    !SHA.test(expected.commitSha ?? "") ||
    !nonempty(expected.deploymentId) ||
    !["production", "staging"].includes(expected.environment) ||
    !["live", "test"].includes(expected.stripeMode) ||
    (expected.environment === "production" && expected.stripeMode !== "live") ||
    !Array.isArray(expected.models) ||
    expected.models.length === 0 ||
    !expected.models.every((v) => typeof v === "string" && /^[^/\s]+\/[^\s]+$/.test(v)) ||
    !unique(expected.models) ||
    !Number.isFinite(now)
  ) {
    throw new Error(
      "Supply a full commit SHA, deployment ID, environment, Stripe mode and complete hosted provider/model inventory from trusted release configuration.",
    );
  }
  const d = document && typeof document === "object" ? document : {};
  const envelope =
    d.schemaVersion === 1 &&
    d.repository === "KomatikAI/lodge" &&
    d.commitSha === expected.commitSha &&
    d.deploymentId === expected.deploymentId &&
    nonempty(d.policySnapshotId) &&
    fresh(d.generatedAt, now);
  // Every observation is independently fresh and bound to the same release and
  // policy. Refreshing only generatedAt must never freshen an old canary.
  const proof = (v) =>
    envelope &&
    v?.commitSha === expected.commitSha &&
    v?.deploymentId === expected.deploymentId &&
    v?.policySnapshotId === d.policySnapshotId &&
    fresh(v?.observedAt, now) &&
    https(v?.url);
  const checks = [];
  const check = (id, passed, remediation, observations = []) => {
    checks.push({
      id,
      status: passed ? "pass" : "fail",
      remediation: passed ? null : remediation,
      evidenceUrls: [
        ...new Set(
          observations
            .filter(proof)
            .flatMap((v) =>
              [v.url, v.originalDebitUrl, v.checkoutUrl, v.eventUrl, v.sourceUrl].filter(
                https,
              ),
            ),
        ),
      ],
    });
  };
  const p = d.policy;
  const prices = list(p?.prices);
  const price = (action) => prices.find((v) => v?.action === action);
  const pricing = (action, credits) => {
    const v = price(action);
    return (
      v?.active === true &&
      v?.tier === "explorer" &&
      v?.credits === credits &&
      v?.minimumPaidTier === null
    );
  };
  check(
    "deployment",
    proof(d.deployment) &&
      d.deployment.project === "lodge-web" &&
      d.deployment.domain === "lodge.komatik.xyz",
    "Collect fresh evidence for this exact Lodge commit/deployment in lodge-web at lodge.komatik.xyz.",
    [d.deployment],
  );
  check(
    "enforcement",
    proof(p) && p.app === "lodge" && p.enforced === true,
    "Enable Lodge credit enforcement and collect the resulting policy snapshot; shadow policy is not promotable.",
    [p],
  );
  check(
    "prices",
    proof(p) && prices.length === 2 && pricing("chat_turn", 1) && pricing("activity", 3),
    "Prove exactly two active Explorer prices: chat_turn=1 and activity=3, with minimumPaidTier=null.",
    [p],
  );
  const rates = list(d.modelRates);
  const ratesValid =
    rates.length === expected.models.length &&
    unique(rates.map(key)) &&
    rates.every(
      (v) =>
        proof(v) &&
        expected.models.includes(key(v)) &&
        https(v.sourceUrl) &&
        fresh(v.sourceCheckedAt, now) &&
        number(v.inputUsdPerMillion) &&
        number(v.outputUsdPerMillion) &&
        v.inputUsdPerMillion === v.sourceInputUsdPerMillion &&
        v.outputUsdPerMillion === v.sourceOutputUsdPerMillion,
    );
  check(
    "model_rates",
    ratesValid,
    "Reconcile every hosted provider/model against its current provider pricing source; include fresh source verification and matching registry rates.",
    rates,
  );
  check(
    "ceilings",
    proof(p) &&
      p.ceilingMonitoringEnabled === true &&
      prices.length === 2 &&
      ["chat_turn", "activity"].every(
        (action) => number(price(action)?.maxCogsCents) && price(action).maxCogsCents > 0,
      ),
    "Configure a positive maxCogsCents for both actions and enable ceiling monitoring.",
    [p],
  );
  const debits = list(d.debits);
  const debitValid = (v, surface, action, credits) =>
    proof(v) &&
    v.surface === surface &&
    v.action === action &&
    v.credits === credits &&
    v.kind === "debit" &&
    v.linkedUser === true &&
    nonempty(v.subjectId) &&
    nonempty(v.requestId) &&
    nonempty(v.ledgerId) &&
    number(v.walletBefore) &&
    number(v.walletAfter) &&
    v.walletBefore - v.walletAfter === credits;
  const debitsValid =
    debits.length === 3 &&
    unique(debits.map((v) => v?.ledgerId)) &&
    unique(debits.map((v) => v?.requestId)) &&
    [
      ["koda", "chat_turn", 1],
      ["fireside", "chat_turn", 1],
      ["flow", "activity", 3],
    ].every(([surface, action, credits]) =>
      debits.some((v) => debitValid(v, surface, action, credits)),
    );
  check(
    "debits",
    debitsValid,
    "Run linked-user Koda, Fireside and Flow canaries; link three distinct ledger debits and wallet deltas of 1, 1 and 3 credits.",
    debits,
  );
  const r = d.refund;
  check(
    "refund",
    proof(r) &&
      r.providerFailed === true &&
      r.linkedUser === true &&
      nonempty(r.subjectId) &&
      nonempty(r.originalDebitId) &&
      nonempty(r.refundId) &&
      r.originalDebitId !== r.refundId &&
      !debits.some(
        (v) => v?.ledgerId === r.originalDebitId || v?.ledgerId === r.refundId,
      ) &&
      nonempty(r.requestId) &&
      !debits.some((v) => v?.requestId === r.requestId) &&
      https(r.originalDebitUrl) &&
      r.refundedDebitId === r.originalDebitId &&
      ["chat_turn", "activity"].includes(r.action) &&
      r.debitedCredits === (r.action === "chat_turn" ? 1 : 3) &&
      r.refundedCredits === r.debitedCredits &&
      number(r.walletBefore) &&
      number(r.walletAfterDebit) &&
      r.walletBefore - r.walletAfterDebit === r.debitedCredits &&
      r.walletAfter === r.walletBefore,
    "Force a provider failure and link the original debit to an equal compensating refund and restored wallet.",
    [r],
  );
  const t = d.topup;
  check(
    "topup",
    proof(t) &&
      t.mode === expected.stripeMode &&
      t.linkedUser === true &&
      nonempty(t.subjectId) &&
      nonempty(t.checkoutSessionId) &&
      nonempty(t.eventId) &&
      nonempty(t.ledgerId) &&
      !debits.some((v) => v?.ledgerId === t.ledgerId) &&
      t.ledgerId !== r?.refundId &&
      t.ledgerId !== r?.originalDebitId &&
      t.paymentStatus === "paid" &&
      t.webhookStatus === "fulfilled" &&
      t.fulfilledSessionId === t.checkoutSessionId &&
      t.fulfilledEventId === t.eventId &&
      number(t.creditedCredits) &&
      t.creditedCredits > 0 &&
      number(t.walletBefore) &&
      number(t.walletAfter) &&
      t.walletAfter - t.walletBefore === t.creditedCredits &&
      t.refreshedWalletBalance === t.walletAfter &&
      https(t.checkoutUrl) &&
      https(t.eventUrl),
    "Complete a Stripe top-up in the configured mode; correlate paid checkout, fulfilled webhook, ledger credit and refreshed wallet.",
    [t],
  );
  const usage = list(d.usage);
  const usageValid =
    debitsValid &&
    ratesValid &&
    usage.length === 3 &&
    unique(usage.map((v) => v?.usageId)) &&
    debits.every((debit) => {
      const matches = usage.filter(
        (v) => v?.ledgerId === debit.ledgerId && v?.requestId === debit.requestId,
      );
      if (matches.length !== 1) return false;
      const u = matches[0];
      const rate = rates.find((v) => key(v) === key(u));
      if (
        !proof(u) ||
        !rate ||
        !nonempty(u.usageId) ||
        u.subjectId !== debit.subjectId ||
        !count(u.inputTokens) ||
        !count(u.outputTokens) ||
        !count(u.thinkingTokens) ||
        u.inputTokens + u.outputTokens + u.thinkingTokens === 0 ||
        !number(u.durationMs) ||
        u.durationMs <= 0 ||
        !number(u.cogsCents)
      )
        return false;
      const derived =
        (u.inputTokens * rate.inputUsdPerMillion +
          (u.outputTokens + u.thinkingTokens) * rate.outputUsdPerMillion) /
        10_000;
      return Math.abs(u.cogsCents - derived) <= 1e-8;
    });
  check(
    "runtime_usage",
    usageValid,
    "Link each canary debit/request/user to a distinct usage row with model/provider, tokens, duration and correctly derived COGS (output excludes thinking tokens).",
    usage,
  );
  const h = d.health;
  check(
    "health",
    proof(h) &&
      proof(p) &&
      h.status === 200 &&
      h.endpoint === "https://lodge.komatik.xyz/api/lodge/health" &&
      h.app === "lodge" &&
      h.enforced === true &&
      h.ceilingMonitoringEnabled === p.ceilingMonitoringEnabled &&
      h.chatTurnCredits === price("chat_turn")?.credits &&
      h.activityCredits === price("activity")?.credits &&
      h.chatTurnMaxCogsCents === price("chat_turn")?.maxCogsCents &&
      h.activityMaxCogsCents === price("activity")?.maxCogsCents,
    "Probe /api/lodge/health for HTTP 200 and the exact enforced policy snapshot, prices and ceilings; generic healthy=true is insufficient.",
    [h],
  );
  const failures = list(d.failureCanaries);
  check(
    "failure_boundaries",
    failures.length === 3 &&
      unique(failures.map((v) => v?.requestId)) &&
      failures.every(
        (v) =>
          v?.requestId !== r?.requestId &&
          !debits.some((debit) => debit?.requestId === v?.requestId),
      ) &&
      [
        ["insufficient_balance", 402],
        ["policy_fault", 503],
        ["meter_fault", 503],
      ].every(([scenario, status]) =>
        failures.some(
          (v) =>
            proof(v) &&
            v.scenario === scenario &&
            v.status === status &&
            v.providerInvocations === 0 &&
            nonempty(v.requestId),
        ),
      ),
    "Run insufficient-balance (402), policy-fault (503) and meter-fault (503) canaries; prove zero provider invocations for each.",
    failures,
  );
  const promotable = checks.every((v) => v.status === "pass");
  return {
    schemaVersion: 1,
    repository: "KomatikAI/lodge",
    commitSha: expected.commitSha,
    deploymentId: expected.deploymentId,
    environment: expected.environment,
    promotable,
    outcome: promotable ? "promotable" : "not_promotable",
    shouldBlock: expected.environment === "production" && !promotable,
    checks,
  };
}

export async function readEvidence(path) {
  const file = await open(path, "r");
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_EVIDENCE_BYTES)
      throw new Error("Evidence must be a regular file of at most 1,000,000 bytes.");
    // Bound the actual read too: the file can grow after stat().
    const buffer = Buffer.alloc(MAX_EVIDENCE_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const result = await file.read(buffer, size, buffer.length - size, null);
      if (result.bytesRead === 0) break;
      size += result.bytesRead;
    }
    if (size > MAX_EVIDENCE_BYTES) throw new Error("Evidence exceeds 1,000,000 bytes.");
    return JSON.parse(buffer.subarray(0, size).toString("utf8"));
  } finally {
    await file.close();
  }
}

export async function runCli(args) {
  const flags = new Map();
  const allowed = [
    "--evidence",
    "--sha",
    "--deployment",
    "--environment",
    "--stripe-mode",
    "--models",
  ];
  for (let i = 0; i < args.length; i += 2) {
    if (
      !allowed.includes(args[i]) ||
      flags.has(args[i]) ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      throw new Error("Supply each required option exactly once: " + allowed.join(", "));
    flags.set(args[i], args[i + 1]);
  }
  if (flags.size !== allowed.length)
    throw new Error(
      "Missing required options: " + allowed.filter((v) => !flags.has(v)).join(", "),
    );
  const expected = {
    commitSha: flags.get("--sha"),
    deploymentId: flags.get("--deployment"),
    environment: flags.get("--environment"),
    stripeMode: flags.get("--stripe-mode"),
    models: flags.get("--models").split(","),
  };
  // Validate expectations even when the document cannot be read.
  evaluateLodgeEvidence(null, expected);
  let document;
  try {
    document = await readEvidence(flags.get("--evidence"));
  } catch {
    // No raw payload, filesystem path or exception text in public check output.
    document = null;
  }
  const result = evaluateLodgeEvidence(document, expected);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return result.shouldBlock ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      process.stderr.write(
        "Lodge evidence gate could not evaluate: check the required options and trusted release configuration.\n",
      );
      process.exitCode = 1;
    });
}
