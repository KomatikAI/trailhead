# Lodge credit evidence gate

Tracks [#343](https://github.com/KomatikAI/trailhead/issues/343). The standalone
`scripts/check-lodge-evidence.mjs` command validates the commercial evidence needed
for a Lodge production promotion. Node 24 is sufficient; no package install,
provider credentials, database access, or paid requests are needed to run it.

**Delivery status:** the validator and offline tests are implemented. A trusted
Lodge/Komatik collector, consumer workflow, required check configuration and real
canaries are still required. This command is not automatically enabled by the
Trailhead Action, App or MCP. Merging it does not make Lodge launch-ready or close
#343. The closed generic draft #346 is not a prerequisite.

## Invocation and result

Obtain the candidate commit, Vercel deployment ID and complete hosted model
inventory independently from protected release configuration. Do not derive these
expectations from the evidence being checked. Run from a checkout of a reviewed,
immutable Trailhead commit:

```bash
node scripts/check-lodge-evidence.mjs \
  --evidence /runner/collected/lodge-evidence.json \
  --sha "$CANDIDATE_HEAD_SHA" \
  --deployment "$CANDIDATE_DEPLOYMENT_ID" \
  --environment production \
  --stripe-mode live \
  --models "$HOSTED_PROVIDER_MODEL_INVENTORY"
```

`--sha` is the full 40-character head SHA, not the synthetic PR merge commit.
`--models` is a comma-separated list of `provider/model` identifiers, without spaces.
Every argument is required, unique and case-sensitive. Unknown arguments or
invalid expectations exit 1. Production requires Stripe live mode; staging can
exercise test or live mode. Selecting a mode never creates or pays for a checkout.
Test-mode top-ups remain `not_promotable` on staging even if all other evidence
passes; production eligibility always needs a live-mode top-up.

The command writes a JSON report containing exactly eleven condition checks,
remediation for each failure, and non-secret evidence links. It never prints the
full evidence document or opaque user IDs. Production exits 1 unless every check
passes. Staging exits 0 even for missing/invalid evidence, but explicitly reports
`promotable: false`, `outcome: "not_promotable"`. A passing staging job is not a
production approval. Re-run in production mode immediately before promotion.

Missing, unreadable, oversized or malformed evidence becomes eleven actionable
failures. The file must be regular and at most 1,000,000 bytes; the actual read is
bounded even if the file grows after the initial size check. There is no endpoint
fetch, redirect following, remote command execution or credential forwarding.

## Trust boundary and activation

The JSON is a trusted collector's observation record, **not a cryptographic proof**.
The checker validates consistency, freshness and correlation; it cannot establish
that a fabricated JSON record describes real database or provider activity. A
public URL or a boolean assertion alone is not verification.

Before activating this gate:

1. Build a service-owned collector which reads authoritative Vercel deployment
   metadata, Komatik policy/model registry, ledger/usage/refund records, Stripe
   fulfillment records and request traces. It must verify the deployment actually
   serves the expected commit, the domain/project association, and the currently
   active policy. Use read-only service access for collection; schema changes ship
   through the owning repository's reviewed deployment process.
2. Run collector code from a protected, reviewed revision. Deliver its output into
   a protected release job via an authenticated channel. Reject PR-provided files,
   artifacts from untrusted workflow runs, user-submitted timestamps, URLs, IDs or
   `pass` assertions. Do not execute PR code with collector credentials. Cross-run
   artifacts require verified producer identity and run/head/deployment binding.
3. Pin this checker to its reviewed full commit SHA in the release job. Keep
   `--environment production`, expected billing mode, candidate identity and model
   inventory under protected workflow control. An untrusted PR must not be able to
   change the checker, collector, inputs, or command exit handling.
4. Require a dedicated **Lodge production evidence** check for main promotion and
   make deployment depend on its success. Do not use `continue-on-error`, optional
   checks, or a skipped job as approval. If integrated into the composite gate,
   configure this check as blocking with missing checks failing. Protect the
   workflow with mandatory human review/required workflows. Trailhead's normal
   fail-open mode, risk overrides and generic HTTP health do not replace this check.
5. Publish the JSON report as a restricted artifact and its outcome in the job
   summary. Keep staging's `not_promotable` status visible. Recollect/recheck on
   policy changes and immediately before deployment; do not reuse a green check
   indefinitely after evidence expires.

No trusted collector or required consumer check is provisioned by this change.
Until these steps are complete, Lodge's existing green CI remains insufficient.

## Evidence schema v1

The envelope is an object with `schemaVersion: 1`, `repository: "KomatikAI/lodge"`,
`commitSha`, `deploymentId`, `policySnapshotId`, and `generatedAt` (UTC ISO timestamp).
Each observation below repeats `commitSha`, `deploymentId`, `policySnapshotId`,
`observedAt`, and `url`. Every identity must match the envelope and independent
expectations. Every observation and envelope timestamp must be at most 60 minutes
old, with at most 60 seconds future clock skew. Updating `generatedAt` cannot
freshen old observations. The collector must use the time of the actual canary,
not the time an old row was re-read. Provider source verification is also fresh.

All URLs must be HTTPS links without credentials, query strings or fragments.
Use stable authenticated record URLs with opaque path IDs. Never include signed
URLs, access tokens, user emails, source code, prompts or payment details. Links
are report references, never fetched by this checker. Retain access-controlled
evidence behind them, including the two ledger rows for refunds.

| Observation         | Required fields beyond the common binding                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deployment`        | `project: "lodge-web"`, `domain: "lodge.komatik.xyz"`. Collector verifies actual deployment metadata, alias ownership and commit.                                                                                                                                                                                                                                                                                                                                                  |
| `policy`            | `app: "lodge"`, `enforced: true`, `ceilingMonitoringEnabled: true`, `prices` as below.                                                                                                                                                                                                                                                                                                                                                                                             |
| `policy.prices`     | Exactly two entries: `action: "chat_turn"`, `credits: 1`; `action: "activity"`, `credits: 3`. Each has `active: true`, `tier: "explorer"`, `minimumPaidTier: null`, positive finite `maxCogsCents`. Collector includes the complete active pricing set.                                                                                                                                                                                                                            |
| `modelRates[]`      | Exactly one per expected model: `provider`, `model`, `inputUsdPerMillion`, `outputUsdPerMillion`, `sourceInputUsdPerMillion`, `sourceOutputUsdPerMillion`, `sourceUrl`, `sourceCheckedAt`. Registry rates must exactly match the corresponding current provider rates. Collector verifies the official source rather than copying registry values into source fields.                                                                                                              |
| `debits[]`          | Exactly three, with `surface` koda/fireside/flow, corresponding `action` chat_turn/chat_turn/activity and `credits` 1/1/3; `kind: "debit"`, `linkedUser: true`, opaque `subjectId`, distinct `requestId` and `ledgerId`, nonnegative `walletBefore`/`walletAfter` with the exact debit delta.                                                                                                                                                                                      |
| `refund`            | `providerFailed: true`, `linkedUser: true`, `subjectId`, distinct failure `requestId`, `originalDebitId`, `originalDebitUrl`, `refundId`, `refundedDebitId` matching the original, `action`, `debitedCredits` 1 or 3 according to action, equal `refundedCredits`, nonnegative `walletAfterDebit` with the exact original debit delta, and equal nonnegative `walletBefore`/`walletAfter`. Original and refund must be distinct rows, separate from the successful debit canaries. |
| `topup`             | `mode` matching the independent expectation, `linkedUser: true`, `subjectId`, `checkoutSessionId`, `eventId`, distinct `ledgerId`, `paymentStatus: "paid"`, `webhookStatus: "fulfilled"`, matching `fulfilledSessionId`/`fulfilledEventId`, positive `creditedCredits`, wallet before/after with exact credit delta, `refreshedWalletBalance` equal to after, `checkoutUrl`, `eventUrl`.                                                                                           |
| `usage[]`           | Exactly one per successful debit, distinct `usageId`, matching `ledgerId`, `requestId`, `subjectId`; `provider`/`model` from the complete registry set, integer nonnegative `inputTokens`, `outputTokens`, `thinkingTokens` (at least one token in total), positive `durationMs`, finite nonnegative `cogsCents`.                                                                                                                                                                  |
| `health`            | `status: 200`, `endpoint: "https://lodge.komatik.xyz/api/lodge/health"`, `app: "lodge"`, `enforced: true`, matching `ceilingMonitoringEnabled`, `chatTurnCredits`, `activityCredits`, `chatTurnMaxCogsCents`, `activityMaxCogsCents`. Common `policySnapshotId` must be the policy the health endpoint actually reports.                                                                                                                                                           |
| `failureCanaries[]` | Exactly three, distinct `requestId` separate from successful debit and provider-failure requests, `scenario` insufficient_balance/policy_fault/meter_fault, respective `status` 402/503/503, and `providerInvocations: 0`. Collector must verify invocation traces, not infer zero from HTTP status.                                                                                                                                                                               |

Token accounting in v1 uses **output tokens excluding thinking tokens**. Normalize
provider responses that include thinking in their output total, so it is counted
exactly once. COGS in cents is
`(inputTokens * inputUsdPerMillion + (outputTokens + thinkingTokens) * outputUsdPerMillion) / 10000`,
within 1e-8 cents of the recorded value. This schema covers standard uncached text
token rates. If a hosted model uses cached-input discounts, context-tier pricing,
batch discounts, media or other charges, extend the reviewed schema/calculation
before allowing it; do not silently squeeze those costs into these fields.

The executable synthetic fixture in `scripts/check-lodge-evidence.test.mjs`
documents a complete object. Its `fixture/model`, prices and IDs are fabricated;
it must never be submitted as production evidence. Run the offline suite with:

```bash
node --test scripts/check-lodge-evidence.test.mjs
```

The normal root Vitest/CI suite also executes these contracts. No live canary,
policy enforcement change, Stripe purchase or provider invocation happens in tests.
