# Trailhead readiness audit — 2026-10-22

This audit precedes website design work. It covers the Action, CLI, App, MCP,
Cloud and website. The initial snapshot contained 54 open issues and no open
pull requests; the latest 30 PRs were inspected. This is a triage and regression
audit, not a claim that every historical epic has passed all acceptance criteria.

## Release decision

**Not ready to declare all major issues closed.** This branch repairs confirmed
code defects, but production promotion, live billing verification, the operator
approval workflow, Lodge evidence and promotion calibration remain open.

| Priority | Finding                                                  | Evidence / disposition                                                                                                                                                                                                                                                                          |
| -------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical | Production is behind security fixes                      | Vercel production deployment `dpl_25tCk3M6YBUx92KByxs3MssVUqH8` uses July 21 commit `203bb810fff2ed137531e8b0764e7180960a7d51`. PR #368 security hardening is on dev. Promote reviewed changes through staging to main.                                                                         |
| Critical | Vulnerable dependency graph                              | Site updated to Next 16.4.2; patched root and all five package lockfiles. CI now audits all six lockfiles at high severity.                                                                                                                                                                     |
| High     | Checkout could lose paid provisioning on partial failure | Org, subscription, key and encrypted claim now commit atomically; session lock handles concurrent deliveries; completion ledger is written only after effects succeed. Real PostgreSQL tests cover rollback and retries.                                                                        |
| High     | Delayed Checkout could provision before payment          | Require paid/no-payment-required status; handle async payment success explicitly. Stripe endpoint must subscribe to that event.                                                                                                                                                                 |
| High     | Live billing configuration unverified                    | Stripe connector still returns UNAUTHORIZED after user reauthorization. Required Vercel env names exist, but shared production/preview scope requires mode verification. No secret values were read. Checkout, portal, webhook and reconcile need a real test-mode canary before live sign-off. |
| High     | Gate false blocks on generated source text (#366)        | Import resolution now reads real syntax nodes instead of matching imports inside string templates. Covers aliases, re-exports, dynamic imports and TypeScript runtime extensions.                                                                                                               |
| High     | Promotion approval deadlock (#355)                       | PR #357 preserved sensitive-path approvals. Use a distinct automation author and human reviewer. No identity/credential changes or policy weakening performed.                                                                                                                                  |
| High     | Lodge commercial readiness (#343)                        | Draft #346 was closed unmerged. Live credit enforcement, debit/refund/top-up and deployment-target evidence remain required.                                                                                                                                                                    |
| High     | Enforcement calibration (#350)                           | Latest recorded evidence still includes corrections; three consecutive clean promotions are not demonstrated. Do not flip enforcement on this audit alone.                                                                                                                                      |
| Resolved | Database public API exposure                             | Read-only production queries verify all 13 public tables have RLS enabled, zero public policies as designed, and all applicable plain-Postgres migrations (001, 005_org_preferences, 007) applied. Other migration files explicitly opt out of this schema.                                     |
| Resolved | Private vulnerability reporting disabled                 | Enabled and verified through GitHub.                                                                                                                                                                                                                                                            |
| Resolved | Fly worker deploy gap (#356)                             | Current Komatik master workflow deploys and verifies both process groups, health and release SHA. Recent run [39368346779](https://github.com/KomatikAI/komatik/actions/runs/39368346779) succeeded. Issue closed.                                                                              |
| Resolved | Skipped checks falsely block (#353)                      | Merged #352 implements irrelevant/skipped disposition with regression tests. Issue closed; deployment/adoption is separate.                                                                                                                                                                     |

## Website and Cloud changes

- Restored standalone site lint/type generation/build checks and added them to CI.
- Added PostgreSQL contract tests to CI; previously the database-specific branch
  could be skipped when no test URL was configured.
- Added dashboard billing access with errors and loading state. Suspended customers
  can reach their own Stripe portal to recover billing.
- Corrected the mounted Cloud dashboard redirect and added route/auth smoke tests.
- Removed promises of SSO sign-in, seat administration and paid-only governance
  not supported by the current product. SSO settings remain explicitly a preview.
- Corrected subscription period reads for current Stripe item-level payloads in
  webhooks and reconciliation.
- Updated local setup documentation and regenerated shared App/MCP runtime copies.

## PR #370 review follow-up

- Retain the Checkout session/org receipt after claim expiry, while erasing its
  encrypted secret at reveal or expiry. Deleting the receipt allowed a different
  late event to mint another key for the same Checkout.
- Retrieve current Stripe subscription state for Checkout and lifecycle events.
  A late Checkout for a canceled subscription now creates a suspended key; an
  old active event cannot overwrite a cancellation snapshot. Stripe lookup
  failures remain retryable. Periodic reconcile remains necessary for drift and
  concurrent upstream changes; these tests are not a live billing canary.
- Require the real test, audit and security-guard jobs in the repository's
  release-ready policy on dev, staging and main. Previously the composite check
  could pass while security-guard failed because no required CI names matched.
  CI now also runs on promotion PRs. Tests fail each required job individually
  and remove each job to verify that neither condition produces release-ready.
- Human security review is still required for workflow changes under
  `docs/SECURITY-GUARD.md`; an automated code review does not grant that label.
- The submission auth heuristic initially flags four routes because it expects
  user/session helpers. Manual review verifies the actual boundaries: Stripe
  `constructEvent` signature verification, cron `secretMatches` with a timing-safe
  comparison, the one-time `claimKey` capability, and `createCloudApp`'s mounted
  bearer-key middleware. Signature tampering, invalid cron keys, unknown/expired
  claims and unauthorized ingestion are covered by tests. Interactive submission
  validation supplies those four reviewed helper names; no detector is disabled
  and no repository auth allowlist is broadened.

## Recent PR audit

- **#369:** Marketplace links replaced with Quick Start; no Marketplace listing
  is required for the existing GitHub Action distribution.
- **#368:** fixes self-service plan/seat escalation, plan drift, production memory
  fallback and incorrect Cloud URL. Production promotion remains outstanding.
- **#367:** RLS migration verified in the database.
- **#365:** mock-placeholder false positive fix is present.
- **#364, #362, #361:** live label reads, override liveness and concurrent-trigger
  lineage changes are covered by the current regression suite.
- **#358, #357, #352:** input-relevance waiting, promotion calibration and skipped
  checks are present; #357 deliberately did not bypass sensitive approvals.
- **#351:** release checkout resolves the final retagged source; do not publish
  from a stale pre-release checkout.
- **#346:** incomplete Lodge work is closed unmerged and cannot count as delivered.

The review inspected history and relevant code/tests; it did not independently
re-run every external fleet scenario from these PRs.

## Validation

The engine regression run passes **1,331 tests**. The prior coverage run reports **81.10% statements,
74.74% branches, 90.79% functions and 82.43% lines**, above configured thresholds.
The Cloud suite passes **76 tests**, including a dedicated local PostgreSQL 18
database. The website passes **62 tests**, lint, route type generation and its
production build. All six dependency audits report zero vulnerabilities. Root
lint, formatting, App/MCP builds, CLI typecheck and offline doctor also pass.
Local browser checks verify dashboard
billing error handling; HTTP checks verify public pages, health, dashboard
redirect and unauthorized ingest rejection. No paid canary or production rollout
has been performed.

Read-only database checks found no local subscription/settings plan pairs and no
paid org without a subscription. This is **not evidence of successful billing**.

## Remaining exit checks before design work

1. Merge this fix branch only after its CI and review pass.
2. Reconcile the diverged dev/staging/main histories, preserving release commits;
   promote through staging and verify the actual Vercel production source.
3. Verify separate test/live Stripe configuration, webhook events, products/prices,
   portal settings, payment → claim → ingest, cancellation/reactivation and cron.
4. Resolve #355 with a distinct automation author and human approval.
5. Complete #343's Lodge evidence and #350's real promotion calibration.
6. Audit fleet pins/soak for #229; do not infer fleet adoption from a merged engine fix.

## Issue inventory

Two evidence-backed closures are recorded below. Other historical work remains
open pending acceptance verification; an implementation or a green test suite
alone is not enough to close an epic. Older enhancements are not automatically
website launch blockers.

| Issue                                                     | Title                                                                                                                        | Disposition                                                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [#366](https://github.com/KomatikAI/trailhead/issues/366) | import_resolution detector false-positives on tsconfig path-alias imports (@/...)                                            | Fix in this branch; keep open until merged and released.                                                               |
| [#356](https://github.com/KomatikAI/trailhead/issues/356) | release-ready: deploy-completeness blind spot — master push automates migrations + Edge Functions but not the Fly worker leg | Closed after verifying production worker automation and release evidence.                                              |
| [#355](https://github.com/KomatikAI/trailhead/issues/355) | agent_prs required_approvals is unsatisfiable on operator-token train PRs (author == only eligible approver)                 | Major operational blocker: promotion author must differ from approving human; do not waive sensitive-path approvals.   |
| [#350](https://github.com/KomatikAI/trailhead/issues/350) | ADR-011 Stage 1: Release Brief calibration log (komatik promotions)                                                          | Major enforcement prerequisite: three consecutive zero-correction promotions not evidenced.                            |
| [#353](https://github.com/KomatikAI/trailhead/issues/353) | release-ready: skipped blocking checks block promotion PRs whose diff legitimately path-filters them away                    | Closed: merged PR #352 and regression suite verify skipped-input handling.                                             |
| [#343](https://github.com/KomatikAI/trailhead/issues/343) | Gate Lodge production on verified credit economics and canary evidence                                                       | Major Lodge release blocker: evidence contract and coordinated paid canaries remain unimplemented/unverified.          |
| [#69](https://github.com/KomatikAI/trailhead/issues/69)   | Epic 1.2: Agent Provenance Detection                                                                                         | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#223](https://github.com/KomatikAI/trailhead/issues/223) | [v4.3] Agent autonomy — Coach, Fixer, Autopilot roadmap                                                                      | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#229](https://github.com/KomatikAI/trailhead/issues/229) | [A6] Fleet rollout — 21 repos adopt v4.3 strict-agent preset                                                                 | Fleet adoption work; verify pins and soak before changing enforcement.                                                 |
| [#114](https://github.com/KomatikAI/trailhead/issues/114) | [E17] Epic E17: Multi-platform CI adapters                                                                                   | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#212](https://github.com/KomatikAI/trailhead/issues/212) | [E17.3] Generic webhook CI adapter                                                                                           | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#211](https://github.com/KomatikAI/trailhead/issues/211) | [E17.2] CircleCI workflow adapter                                                                                            | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#181](https://github.com/KomatikAI/trailhead/issues/181) | [E10.8] Deprecation notice: dual-check pattern, risk-only as opt-in                                                          | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#178](https://github.com/KomatikAI/trailhead/issues/178) | [E10.5] Replace roadmap-agent-qa.md with roadmap-v4.md                                                                       | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#173](https://github.com/KomatikAI/trailhead/issues/173) | [E9.6] Latency budget test: orchestrator adds < 15s p95                                                                      | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#167](https://github.com/KomatikAI/trailhead/issues/167) | [E8.6] Document bring-your-own-store vs Trailhead Cloud                                                                      | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#166](https://github.com/KomatikAI/trailhead/issues/166) | [E8.5] Deploy tracker: full SHA match + configurable fallback window                                                         | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#165](https://github.com/KomatikAI/trailhead/issues/165) | [E8.4] Optional artifact upload on store failure                                                                             | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#164](https://github.com/KomatikAI/trailhead/issues/164) | [E8.3] Action input: evaluation-store-retries (default 3)                                                                    | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#161](https://github.com/KomatikAI/trailhead/issues/161) | [E7.6] Update MCP README + tool count in docs                                                                                | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#159](https://github.com/KomatikAI/trailhead/issues/159) | [E7.4] MCP tool: wait-for-ci-checks                                                                                          | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#154](https://github.com/KomatikAI/trailhead/issues/154) | [E6.6] Branch protection setup guide                                                                                         | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#148](https://github.com/KomatikAI/trailhead/issues/148) | [E5.8] Slack/webhook payload includes CI summary                                                                             | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#147](https://github.com/KomatikAI/trailhead/issues/147) | [E5.7] Risk labels: soften in advisory mode                                                                                  | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#145](https://github.com/KomatikAI/trailhead/issues/145) | [E5.5] Store persistence failure annotation on check output                                                                  | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#144](https://github.com/KomatikAI/trailhead/issues/144) | [E5.4] Failed check links to workflow run / job log                                                                          | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#143](https://github.com/KomatikAI/trailhead/issues/143) | [E5.3] Collapsible sections: risk factors, health, DORA, policy findings                                                     | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#140](https://github.com/KomatikAI/trailhead/issues/140) | [E4.7] Override support: waive CI or risk explicitly                                                                         | Policy conflict: ADR-011 keeps mechanical CI checks non-overridable. Reconcile requested behavior with current policy. |
| [#139](https://github.com/KomatikAI/trailhead/issues/139) | [E4.6] Extend rollout-readiness-json to include CI dimension                                                                 | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#133](https://github.com/KomatikAI/trailhead/issues/133) | [E3.7] Status API fallback for legacy commit statuses                                                                        | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#91](https://github.com/KomatikAI/trailhead/issues/91)   | Release summary: Trailhead branding + npm package cutover (v3.0.3)                                                           | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#90](https://github.com/KomatikAI/trailhead/issues/90)   | Epic 5.3: Policy Recommendation Engine                                                                                       | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#89](https://github.com/KomatikAI/trailhead/issues/89)   | Epic 5.2: False Positive Feedback Loop                                                                                       | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#88](https://github.com/KomatikAI/trailhead/issues/88)   | Epic 5.1: Dynamic Trust Profiles                                                                                             | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#87](https://github.com/KomatikAI/trailhead/issues/87)   | Cross-Cutting: MCP Tool Extensions (Step 4)                                                                                  | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#86](https://github.com/KomatikAI/trailhead/issues/86)   | Epic 4.4: Automated Rollback / Revert Workflow                                                                               | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#85](https://github.com/KomatikAI/trailhead/issues/85)   | Epic 4.3: Rollout Dashboard                                                                                                  | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#84](https://github.com/KomatikAI/trailhead/issues/84)   | Epic 4.2: Escalation Workflows                                                                                               | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#83](https://github.com/KomatikAI/trailhead/issues/83)   | Epic 4.1: Override Control Plane                                                                                             | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#82](https://github.com/KomatikAI/trailhead/issues/82)   | Cross-Cutting: Self-Test Validation (Step 3)                                                                                 | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#81](https://github.com/KomatikAI/trailhead/issues/81)   | Epic 3.3: Cross-Repo / Cross-Service Impact Detection                                                                        | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#80](https://github.com/KomatikAI/trailhead/issues/80)   | Epic 3.2: Duplicate Logic / Reuse Drift Detector                                                                             | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#79](https://github.com/KomatikAI/trailhead/issues/79)   | Epic 3.1: PR Scope / Decomposition Gate                                                                                      | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#78](https://github.com/KomatikAI/trailhead/issues/78)   | Cross-Cutting: Self-Test Validation (Step 2)                                                                                 | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#77](https://github.com/KomatikAI/trailhead/issues/77)   | Cross-Cutting: Performance Budget                                                                                            | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#76](https://github.com/KomatikAI/trailhead/issues/76)   | Epic 2.3: Supply Chain Risk Scoring                                                                                          | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#75](https://github.com/KomatikAI/trailhead/issues/75)   | Epic 2.2: Prompt/Command Injection Controls                                                                                  | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#74](https://github.com/KomatikAI/trailhead/issues/74)   | Epic 2.1: Workflow Security Linting                                                                                          | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#73](https://github.com/KomatikAI/trailhead/issues/73)   | Cross-Cutting: Self-Test Validation (Step 1)                                                                                 | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#72](https://github.com/KomatikAI/trailhead/issues/72)   | Epic 1.5: CI Integrity Guard                                                                                                 | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#71](https://github.com/KomatikAI/trailhead/issues/71)   | Epic 1.4: Rapid-Fire Merge / Session Correlation                                                                             | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#70](https://github.com/KomatikAI/trailhead/issues/70)   | Epic 1.3: Agent-Aware Gate Rules                                                                                             | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#68](https://github.com/KomatikAI/trailhead/issues/68)   | Epic 1.1: Config Schema Versioning and Migration                                                                             | Historical feature/documentation backlog; acceptance not fully verified, left open.                                    |
| [#38](https://github.com/KomatikAI/trailhead/issues/38)   | Komatik launch blocker: finish Trailhead/DeployGuard stale reference cleanup                                                 | Cross-repository cleanup; historical issue, current Komatik acceptance not verified.                                   |
