# Changelog

All notable changes to Trailhead will be documented in this file.

## Unreleased

## [4.4.0] - 2026-05-29

### Added — Phase B (Fixer / Gate 1 extraction)

- **B1 Gate 1 engine** — `src/submission-engine.ts` + `src/submission-checks/` ports 15 checks from `komatik-agents` (secrets, destructive SQL, RLS, auth routes, syntax validity with optional `@swc/core` or bracket fallback, import resolution, mock placeholders, etc.). Action input `submission-gate: "true"` and `.trailhead.yml` `submission.enabled`. Komatik-only checks gated on `KOMATIK_INSTANCE=true`.
- **B2 Autofix allowlist** — `src/fixer-core.ts` red-lane globs + allowlisted autofix classes; `app/src/fixer.ts` plans one fix per round (dry-run in v4.4.0; git write in follow-up App PR).
- **B3 Trust scoring** — `src/trust-score.ts` computes fast-track / standard / probation profiles; `evaluateGate` reads `TRAILHEAD_AGENT_TRUST_JSON` and extends `trust_profile` with `score`, `profile`, `factors`.
- **B4 dogfood wiring** — `presets/trailhead-strict-agents.yml` enables `submission.enabled`; `examples/agent-submission-fixture/` for external repos. Komatik `komatik-agents` CI flip to enforce mode is a separate PR after FP metrics.

### Changed

- **`scripts/copy-shared-src.mjs`** — copies `fixer-core`, `trust-score`, and `submission-checks/` into `app/` and `mcp/`.

## [4.3.3] - 2026-05-29

### Added — Phase A completion (A5–A8, A7)

- **A5 tuning digest** — Cloud `trailhead.tuning-digest.v1` daily digest, per-agent `GET /v1/agents/:id/recent-evaluations`, auto-downgrade when detector FP rate ≥15%, `agent_provenance_id` on store rows.
- **A7 override** — `trailhead-override` label + reason comment, audit trail, weekly cap.
- **A8 self-test fixtures** — agent failure mode golden fixtures in Self-Test workflow.
- **Lane-aware `next_action`** — red-lane findings → `human_review_required`; routine yellow-lane → `fix_and_retry` for agent PRs.
- **security-guard** — CI backstop for autonomous merge; `security-reviewed` label override.

## [4.3.2] - 2026-05-27

### Fixed

- **CLI npm publish** — sync `cli/package.json` (and `app/`, `mcp/` workspace versions) to match the release tag so the release workflow can publish `@komatikai/trailhead`.

## [4.3.1] - 2026-05-27

### Added — Komatik hosted store read path

- **`fetchPreviousEvaluationForPr()` komatik list API** — when `evaluation-store-url` points at `komatik.ai/api/trailhead/store` (or legacy `/api/deployguard/store`), the action resolves prior evaluations via `GET /api/trailhead/evaluations` so fleet repos can increment `loop_round` without Supabase credentials in the workflow.
- **`resolveKomatikListUrl()`** — exported helper mapping store URL → evaluations list endpoint.

### Documentation

- **`docs/komatik-hosted-store.md`** — fleet store contract, A6 rollout status, retired repos, **PR-only deploy rule** (no MCP `apply_migration` to Komatik prod).
- **AGENTS.md** — updated project state, hard rule #7, batch rollout script scoped to active satellites.

## [4.3.0] - 2026-05-27

### Added — Agent autonomy: Coach (Phase A)

- **Remediation schema (A1, #222)** — typed `Remediation` block on `GateEvaluation` and `evaluation-json`; `buildRemediation()` derives machine-readable, agent-actionable fixes (code, severity, files, suggested action/command) from gate findings.
- **Agent brief (A2, #232)** — collapsed "Agent instructions" `<details>` block in the Release Ready PR comment, gated by `gate.agent_brief: "off" | "collapsed" | "expanded"` (collapsed by default for agent provenance, off for humans).
- **Coordinator event bus + semantic webhooks (A3, #233)** — emits `trailhead.blocked`, `trailhead.warn_high_risk`, `trailhead.ready`, `trailhead.loop_exceeded` (`trailhead.webhook.v1`) carrying the full `Remediation` block and `headRef`; new `webhook-events` types; shared `remediation.ts` / `trailhead-events.ts` copied into `app/` and `mcp/`.
- **Loop bookkeeping (A4, #234)** — per-PR remediation loop tracking: `loop_round`, `previous_evaluation_id`, `fixes_resolved`, `fixes_introduced` persisted via `buildEvaluationStoreRow()`; `fetchPreviousEvaluationForPr()` (Cloud `GET /v1/evaluations?repo_id=&pr_number=` with Supabase fallback) auto-increments the round; `GET /v1/analytics/agent-loop-efficiency` + dashboard panel for rounds-to-ready by agent.

### Database

- **`cloud/migrations/002_loop_bookkeeping.sql`** — loop-bookkeeping columns + `(repo_id, pr_number, created_at)` index on `trailhead_evaluations`. Run on hosted Trailhead Cloud instances.

## [4.2.2] - 2026-05-27

### Fixed — DORA metrics

- **GitHub API failures** — `core.warning()` when Deployments or workflow-run queries fail instead of silently returning empty metrics.
- **Evaluation-store fallback** — FDRT and deployment frequency can derive from `trailhead_evaluations.deploy_outcome` when the GitHub Deployments API is unavailable or empty.
- **Environment alias** — `Production` and `production` deployment environments match interchangeably.

## [4.2.1] - 2026-05-27

### Added — Multi-platform CI (E17)

- **Generic webhook CI adapter (E17.3)** — `POST /webhook/ci-status` and `GET /v1/ci-status/:owner/:repo/:sha` on the Trailhead App; `ci-external-status-url` action input. See [docs/ci-external-webhook.md](docs/ci-external-webhook.md).
- **GitLab pipeline adapter (E17.1)** — `gitlab-token`, `gitlab-project-id`, and `gitlab-api-url` action inputs poll GitLab job status.
- **CircleCI workflow adapter (E17.2)** — `circleci-token` and `circleci-project-slug` action inputs poll CircleCI workflow jobs.
- **`passed` manifest outcome** — external CI jobs that succeed without a GitHub Check run map to release-ready pass.

### Added — CLI

- **`trailhead doctor` (#155)** — Validates `.trailhead.yml` and compares configured CI check names against recent GitHub check runs.

### Changed — v4.0 P1 polish

- **PR comment UX (#143)** — Policy findings, DORA, and security sections collapse into `<details>` blocks.
- **CI check links (#131, #144)** — Failed/missing CI checks link to workflow logs when `detailsUrl` is available.
- **Store persistence warning (#145)** — Check output includes `Evaluation not persisted — dashboard incomplete.` when store POST fails.
- **Rollout readiness (#139)** — `rollout-readiness-json` band cannot be `go` when required CI checks fail.
- **Evaluation store retries (#164)** — New `evaluation-store-retries` action input (default 3).
- **Deploy tracker (#166)** — Exact SHA match with optional time-window fallback via repo variable.
- **Docs (#167, #178)** — BYOS vs Cloud decision guide; roadmap epic links; supersede notice on `roadmap-agent-qa.md`.

### Fixed

- **YAML config parser** — Correctly parses `- name: main` context lists and inline flow arrays like `[Lint]`.

## [4.2.0] - 2026-05-26

### Added

- **CI manifest (E15)** — `ci-manifest.json` schema, `ci-manifest-path` action input, and orchestrator merge so path-filter job skips do not count as missing required checks. See [docs/ci-manifest.md](docs/ci-manifest.md).
- **Cross-repo impact (E16)** — external consumer registry, satellite webhooks on contract changes, and Cross-Repo Impact section in Release Ready comments. See [docs/cross-repo-impact.md](docs/cross-repo-impact.md).

### Changed

- **Version alignment** — `app/` and `mcp/` package versions bumped to match root (4.2.0).
- **Repository branch sync** — `main` is the active/default branch; `dev` and `staging` are mirrors fast-forwarded on release.

## [4.1.0] - 2026-05-23

### Added — Trailhead Cloud (E11–E14)

- **Cloud API (E11)** — Hosted evaluation service under `cloud/` with an OpenAPI contract (`cloud/openapi.yaml`), HTTP app (`cloud/src/app.ts`, `cloud/src/server.ts`), and persistent evaluation store (`cloud/src/store.ts`).
- **Hosted dashboard (E12)** — `cloud/public/dashboard.html` backed by `cloud/src/analytics.ts` for cross-repo gate outcomes and DORA trends.
- **Feedback loop (E13)** — Structured gate / false-positive feedback capture (`src/feedback-core.ts`, `src/notify.ts`) reported to Cloud, plus a new MCP `cloud-feedback` tool (`mcp/src/cloud-feedback.ts`).
- **Marketplace tiers & API-key provisioning (E14)** — Billing tiers (`cloud/src/billing.ts`) and a new `trailhead-api-key` action input that auto-configures the evaluation store URL + auth, replacing manual `evaluation-store-url` + `evaluation-store-secret` for the cloud tier. See `docs/marketplace-tiers.md`.

### Added — Action

- **`trailhead-api-key` input** — single credential for Trailhead Cloud; backward compatible with the existing `evaluation-store-url` / `evaluation-store-secret` inputs.
- **Cloud config resolution** — `src/cloud-config.ts` resolves cloud vs. self-hosted store settings.

### Docs

- New: `docs/evaluation-storage.md`, `docs/marketplace-tiers.md`, `docs/roadmap-v4.md`.

### Notes

- Fully backward compatible. `@v4` consumers without a `trailhead-api-key` keep current behavior; Cloud is opt-in.

## [4.0.0] - 2026-05-23

### Added

- **Release Readiness Gate (v4)** — Composite merge gate combining CI orchestration, risk scoring, freeze windows, and health checks into a single `release-ready` decision (ADR-006).
- **Gate modes** — `release-ready` (default for v2 configs), `advisory` (never blocks), and `risk-only` (v3 compatibility).
- **CI orchestrator** — Polls GitHub Checks API, classifies check conclusions (ADR-009), and evaluates required checks from branch-aware `contexts[]` in `.trailhead.yml`.
- **Context matcher** — First-match `contexts[]` resolution by base branch, head branch, and labels.
- **Schema v2** — `schema_version: 2` in `.trailhead.yml` with `gate`, `contexts`, and per-context CI/threshold overrides.
- **CLI v4 wizard** — `npx trailhead init` generates v2 config and `@v4` workflow with `gate-mode` and `wait-for-checks`.
- **Reusable workflow** — `.github/workflows/release-ready.yml` for consumers.
- **MCP `get-pr-release-status`** — Returns `releaseReady`, CI summary, and risk for agent workflows.
- **Store POST retry** — Evaluation store retries up to 3 times with 1s/4s/16s backoff on 429/502/503/504 and network errors.
- **GitHub App composite gate** — Deployment protection handler uses the same `evaluateDeploymentGate` logic as the Action.
- **Self-test fixtures** — 15 CI check scenarios and 8 context-matcher cases; self-test workflow runs in `release-ready` mode.

### Changed

- **Default check name** — `Trailhead — Release Ready` in release-ready mode; `Trailhead` preserved in risk-only mode.
- **README and marketplace listing** — Repositioned as a one-stop release readiness gate, not a risk sidecar.
- **Migration guide** — See `docs/migration-v3-to-v4.md` for upgrading from `@v3`.
- **Trailhead canonical naming** — Completed the canonical naming migration across action metadata, docs, examples, package metadata, telemetry attributes, risk labels, and persisted evaluation targets.
- **Compatibility preserved** — legacy v1 config/env aliases remain supported as fallbacks.
- **Repository branch sync** — `main` is the active/default branch; `dev` and `staging` are kept in sync with `main`.

### Fixed

- **MCP runtime artifacts** — Committed the generated MCP adapter modules and `mcp/dist/risk-engine.*` so `mcp/dist/server.js` resolves all runtime imports from a fresh checkout.
- **Local config loading** — Trailhead now prefers `.trailhead.yml` from the checked-out workspace before falling back to the GitHub Contents API, which lets PR self-tests evaluate the policy in the revision being tested.
- **Generated artifact policy** — Added `.trailhead.yml` ignores for MCP generated copy/artifact paths so repository self-tests score canonical source changes rather than prebuild output.

### Notes

- v1 `.trailhead.yml` configs continue to default to `risk-only` mode — no breaking change for existing `@v3` consumers until you opt into v2 schema or `gate-mode: release-ready`.
- The legacy supply-chain experiment branch remains unpromoted. Its targeted tests pass, but `app` and `mcp` builds fail until their prebuild scripts copy the new `supply-chain` module alongside `risk-engine.ts`.

## [3.0.2] - 2026-04-16

### Fixed

- **Merge-base drift scoring** — GitHub's `pulls.listFiles` API uses a merge-base diff that can include files from unrelated commits when the base branch diverges from the PR branch point. Trailhead now cross-checks the API file list against the PR's actual commits when >30 files are reported. If the API count exceeds 2x the commit-derived count, the commit-level file list is used instead. This prevents inflated `file_count`, `code_churn`, and `sensitive_files` scores that caused false BLOCK decisions. Applied to all three code paths: Action (`gate.ts`), GitHub App (`handler.ts`), and MCP server (`server.ts`). Fail-open: if commit enumeration fails, the API list is kept.

## [3.0.1] - 2026-04-12

### Security

- **Resolved 5 undici CVEs** by upgrading `@actions/core` 1.11.1 → 2.0.3 and `@actions/github` 6.0.1 → 9.1.0 (moves `undici` from 5.29.0 → 6.24.1).
  - GHSA-g9mf-h72j-4rw9 — unbounded decompression chain (moderate)
  - GHSA-2mjp-6q6p-2qxm — HTTP request/response smuggling (moderate)
  - GHSA-vrm6-8vpv-qv8q — unbounded WebSocket memory consumption (high)
  - GHSA-v9p9-hfj2-hcw8 — unhandled WebSocket exception (high)
  - GHSA-4992-7rv2-5pvq — CRLF injection via upgrade option (moderate)

### Changed

- `tsconfig.json` switched to `moduleResolution: "Bundler"` / `module: "ESNext"` to accommodate `@actions/github@9` ESM-only exports (ncc handles the ESM→CJS conversion at build time).

### Fixed

- CI pipeline failures caused by unformatted source files and stale `dist/index.js`.

## [3.0.0] - 2026-04-10

### Architecture

- **Unified risk engine** (`src/risk-engine.ts`) — pure scoring logic shared across the GitHub Action, MCP server, and GitHub App. Eliminates 3 separate implementations.
- New `RiskConfig` interface for framework-agnostic risk configuration.

### DORA-5 Metrics

- **Failed Deployment Recovery Time (FDRT)** — new metric using GitHub Deployments API.
- **Change Rework Rate** — identifies PRs that modify same files within 7-day windows.
- **Per-environment DORA** — filter metrics by deployment environment using `dora-environment` input.
- **Per-service views** — `.trailhead.yml` `services` map enables monorepo DORA breakdown.
- New outputs: `dora-fdrt`, `dora-rework-rate`.
- Report header changed from "DORA Metrics" to "DORA-5 Metrics" with all 5 metrics.

### Security

- **SARIF / Code Scanning integration** (`src/security.ts`) — fetches GitHub Code Scanning alerts as a risk factor.
- New risk factor type `security_alerts` (weight: 4, highest).
- Configurable via `.trailhead.yml` `security` section: `severity_threshold`, `block_on_critical`, `ignore_rules`.
- New input: `security-gate` (default `"true"`).
- New output: `security-alerts-json`.
- Security alerts section added to gate report.

### Canary / Progressive Deployment

- **Deploy outcome tracking** (`src/canary.ts`) — parse Vercel and generic deployment webhooks.
- New risk factor type `deployment_history` (weight: 2).
- Vercel webhook parser for `deployment.completed` events.
- Generic webhook parser with configurable field mapping via `.trailhead.yml` `canary` section.
- New `POST /webhook/deploy-outcome` endpoint on the GitHub App server.

### MCP Server (v3.0.0)

- **`evaluate-policy`** — full policy evaluation tool for CI agents (risk + security + DORA).
- **`get-security-alerts`** — fetch Code Scanning alerts by severity.
- **`get-deployment-status`** — environment-aware deployment info.
- **`suggest-deploy-timing`** — freeze window + failure-aware timing advice.
- All tools now use shared `risk-engine.ts` for consistent scoring.
- DORA tool supports optional `environment` filter.

### GitHub Integration

- **Environment-aware thresholds** — `.trailhead.yml` `environments` section overrides risk/warn thresholds per environment.
- **Merge queue detection** — skips `author_history` factor for `merge_group` events.
- **App handler improvements** — loads `.trailhead.yml` from repo, applies per-environment thresholds, actually validates webhook signature.
- New input: `environment`.

### CLI (v3.0.0)

- New wizard prompts: environment configuration, service mapping, security gate, canary webhook type.
- Generated workflow uses `@v3` tag.

### Types

- Extended `RiskFactor.type` enum: `security_alerts`, `deployment_history`, `canary_status`.
- New schemas: `EnvironmentConfig`, `ServiceMapping`, `SecurityConfig`, `CanaryConfig`.
- `RepoConfig` extended with `environments`, `services`, `security`, `canary`.
- `GateEvaluation` extended with `environment`, `service`.
- `TrailheadConfig` extended with `environment`, `securityGate`.

## [2.2.0] - 2026-04-10

### Added

- **`formatDeploymentFrequencyForOutput()`** in `src/dora.ts` — clear label when no default-branch deploy workflows were detected in the DORA window (avoids confusing “0 per month” in action outputs and job summary tables).
- **Example workflow** — `examples/github-actions/trailhead-deploy-tracker.yml` patches `deploy_outcome` / `deployed_at` after a production push for dashboard correlation.
- **`npx @komatikai/trailhead init`** — optional prompts for evaluation store URL, store secret name, and Supabase direct-insert fallback env vars; optional “DORA outputs” echo step when DORA is enabled.

### Changed

- DORA job summary table uses the new human-readable deployment frequency string; badges keep a compact `none` / `N/week` form.

## [2.1.0] - 2026-04-10

### Added

- CLI wizard support for trend-store configuration (evaluation store + Supabase fallback) in generated workflows.

## [2.0.1] - 2026-04-10

### Added

- **`evaluation-store-secret`** action input (mirrors `EVALUATION_STORE_SECRET` env).
- **Supabase REST fallback** when the primary `evaluation-store-url` returns non-JSON (e.g. Vercel bot protection): set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- **`VERCEL_AUTOMATION_BYPASS_SECRET`** — sends `x-vercel-protection-bypass` on store POST when set.
- **Documentation** in README for evaluation storage, Vercel bypass, Supabase fallback, and deployment correlation.

### Changed

- Evaluation store failures now emit **`core.warning`** with actionable text instead of silent `core.debug` only.

## [2.0.0] - 2026-04-10

### Added

- **DORA metrics engine** (`src/dora.ts`) — Computes deployment frequency, change failure rate, and lead time to change from GitHub data. Opt in with `dora-metrics: "true"`. Results appear as shield badges in the Job Summary and as action outputs (`dora-deployment-frequency`, `dora-change-failure-rate`, `dora-lead-time`, `dora-rating`, `dora-json`).
- **OpenTelemetry span export** (`src/otel.ts`) — Emits a `trailhead.evaluate` span via OTLP/HTTP with attributes for risk score, health score, decision, risk factors, and DORA metrics. No heavy SDK dependency — constructs the JSON payload directly. Configure with `otel-endpoint` and `otel-headers` inputs.
- **GitHub App for Deployment Protection Rules** (`app/`) — Lightweight Hono webhook server that acts as a native Custom Deployment Protection Rule. Evaluates risk and approves/rejects deployments at the environment level without workflow YAML changes. Includes Dockerfile for self-hosting.
- **MCP server v2** — Upgraded to v2.0.0 with Server Card resource, and three new tools: `get-dora-metrics`, `compare-risk-history`, `explain-risk-factors`. Existing tools remain backward-compatible.
- **Dependency change detection** — New `dependency_changes` risk factor detects modifications to `package.json`, lockfiles, `go.mod`, `requirements.txt`, and other dependency manifests. Carries weight 2.
- **PR age factor** — New `pr_age` risk factor scores PRs higher when they've been open for many days (stale PRs carry more risk from merge conflicts and context loss). Carries weight 1.
- **Release freeze windows** — New `freeze` config in `.trailhead.yml` blocks deployments during specified days/hours (e.g., no deploys after 3pm Friday). Frozen deploys are automatically blocked.
- **Rich Job Summary** — PR reports now include shield.io badges, collapsible risk factor breakdown with ASCII bar charts, health check status icons, and improved sensitive file markers.
- **`npx @komatikai/trailhead init` CLI** (`cli/`) — Interactive setup wizard that generates `.trailhead.yml` and `.github/workflows/trailhead.yml` with guided prompts for thresholds, health checks, DORA, OTel, and freeze windows.

### Changed

- Action now references `@v2`. All workflow examples updated.
- Report format upgraded: decision icons, badges, collapsible sections, factor charts.
- Sensitive file markers changed from `**[!]**` to `**⚠ sensitive**` for clarity.

## [1.0.0] - 2026-04-09

### Added

- **Diff-aware risk scoring** — Churn is weighted by file sensitivity: auth/payment files count 3x, infrastructure 2x, config 0.5x, tests 0.3x.
- **PR split recommendations** — When a PR spans multiple areas (frontend, backend, migrations), the report suggests concrete split boundaries.
- **Custom risk rules** — Drop a `.trailhead.yml` in your repo to define custom sensitivity patterns, factor weights, threshold overrides, and file ignores.
- **Deployment correlation** — Track whether warned/blocked PRs caused post-deploy incidents via the deploy-event API. False positive and negative rates visible in trends.
- **Trend dashboard** — Admin dashboard showing decision distribution, risk trends, top risk factors, and recent evaluations with Recharts visualizations.
- **Slack/webhook notifications** — Configurable `webhook-url` and `webhook-events` inputs for real-time Slack or custom endpoint alerts on warn/block decisions.
- **Evaluation history storage** — `evaluation-store-url` input to persist gate results for historical trend analysis.
- **MCP tool server** — Standalone MCP server exposing health check and risk scoring functions for AI agent consumption.

### Changed

- `health-check-url` input deprecated in favor of `health-check-urls` (comma-separated, multiple URLs).
- Code churn description changed from "Total lines changed" to "Sensitivity-weighted lines changed" for transparency.

## [0.3.0] - 2026-04-09

### Added

- **Multi-URL health checks** — `health-check-urls` input accepts comma-separated URLs, all checked in parallel.
- **Vercel deployment status check** — `checkVercelHealth()` queries the Vercel Deployments API when `VERCEL_TOKEN` and `VERCEL_PROJECT_ID` are set.
- **Supabase REST check** — `checkSupabaseHealth()` pings the Supabase REST API when `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set.
- All health checks (HTTP, Vercel, Supabase, MCP) run in parallel via `Promise.all`.

## [0.2.0] - 2026-04-09

### Added

- **GitHub Check Runs** — Creates a check run with pass/neutral/fail conclusion.
- **PR risk labels** — Auto-applies `trailhead:low-risk`, `trailhead:medium-risk`, or `trailhead:high-risk` labels.
- **Auto-request reviewers** — `reviewers-on-risk` input to request specific reviewers on warn/block.
- **Webhook notifications** — Generic POST webhook with Slack-compatible payload.
- **Actionable guidance** — PR comments include specific guidance based on risk factors.
- **Job summary** — Rich Markdown summary in GitHub Actions job output.
- **Visual score bar** — Risk score visualization in PR comments.
- **Evaluation JSON output** — `evaluation-json` output for downstream workflow steps.

## [0.1.0] - 2026-04-09

### Added

- Initial release with core gate evaluation logic.
- HTTP health checks, MCP gateway health checks.
- Risk scoring: file count (logarithmic), code churn (logarithmic), test file ratio, sensitive file detection, author history.
- Decision logic: allow, warn, block based on configurable thresholds.
- Self-healing test repair (Jest, Playwright, Cypress).
- Fail-open error handling.
- PR comment posting (sticky, idempotent updates).
- Local simulation script (`scripts/simulate.ts`).
- CI, dry-run, and self-test workflows.
