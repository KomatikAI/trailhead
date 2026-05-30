---
name: trailhead
description: "Use before merging PRs, deploying code, or when asked about deployment risk, DORA metrics, deploy safety, health checks, or release timing. Triggers: deploy, merge, PR review, risk score, deployment gate, DORA, change failure rate, deploy timing, freeze window, health check, rollback, canary, release, submission gate, agent trust, autofix."
metadata:
  author: komatik
  version: "4.4.4-dev"
---

# Trailhead

Trailhead is a **release readiness gate** that waits for required CI checks, scores code risk, checks production health, integrates security signals, and blocks merges that are not release-ready.

## Core Principles

**1. Never merge without release readiness.**
Before approving or merging any PR, run `get-pr-release-status` or `evaluate-policy` with `gate.mode: release-ready`. If `releaseReady` is false, do not merge — explain the blockers (failed CI, high risk, freeze window, etc.).

**2. Verify health after every deploy.**
After any deployment completes, run `check-http-health` against the production URL. If Vercel or Supabase credentials are configured, also run `check-vercel-health` and `check-supabase-health`. A deploy without verification is incomplete.

**3. Respect freeze windows.**
Before suggesting deploy timing or approving a merge, run `evaluate-policy` to check for active release freeze windows. Never override a freeze window without explicit human approval.

**4. Recover from failures, don't ignore them.**
If a health check returns `degraded` or `down` after deploy, surface it immediately. Run `get-deployment-status` and `explain-risk-factors` to help the developer diagnose. Do not silently continue.

**5. Validate agent submissions before merge (Phase B).**
For agent-authored PRs with suggestion markdown or high-risk diffs, run `validate-submission` on changed files. Gate 1 blocking findings require fix before merge; Phase 0 advisory findings are measurement-only.

## Risk Scoring

Trailhead scores PRs on a 0–100 scale using policy-weighted factors (core + governance + security):

| Factor                  | Weight | What triggers high scores                                               |
| ----------------------- | ------ | ----------------------------------------------------------------------- |
| `security_alerts`       | 4      | Critical/high code scanning alerts                                      |
| `code_churn`            | 3      | Large diffs, especially in sensitive files (auth 3x, infra 2x weight)   |
| `sensitive_files`       | 3      | Changes to auth, migrations, payments, CI, secrets, env files           |
| `file_count`            | 2      | Many files changed (log scale)                                          |
| `test_coverage`         | 2      | Low ratio of test files to source files in the PR                       |
| `dependency_changes`    | 2      | Lock file or manifest changes                                           |
| `deployment_history`    | 2      | Recent deployment failures in target env                                |
| `canary_status`         | 2      | Canary/progressive rollout signals                                      |
| `author_history`        | 1      | Author unfamiliar with the repo (< 90-day commit history)               |
| `pr_age`                | 1      | Stale PRs penalized                                                     |
| `ci_integrity`          | 3      | CI confidence downgrades (bypass patterns, test deletion signals)       |
| `workflow_security`     | 4      | Workflow hardening issues (unpinned actions, risky shell interpolation) |
| `prompt_injection_risk` | 4      | Untrusted input flowing into prompt/command paths                       |
| `supply_chain`          | 3      | New deps, major jumps, critical vuln markers                            |
| `pr_scope`              | 2      | Oversized mixed-scope PRs and missing decomposition plan                |
| `duplicate_logic`       | 1      | Potential helper/utility duplication drift                              |
| `cross_repo_impact`     | 2      | Contract-surface changes affecting declared consumers                   |

Decisions: **allow** (< 55), **warn** (55–70), **block** (> 70).

## Security Checklist

When reviewing PRs or evaluating deploys, always check:

- **Never deploy with unresolved critical security alerts.** Run `get-security-alerts` and block if any critical-severity alerts exist.
- **Sensitive file changes require extra scrutiny.** Files matching auth, migration, payment, secret, or env patterns carry 2-3x weight in risk scoring. Flag these to the developer.
- **Dependency changes need review.** Lock file and manifest changes can introduce supply chain risk. Call out major version bumps or new dependencies.
- **Score > 70 requires human approval.** Do not auto-merge. Explain the risk factors and ask the developer to review.
- **Submission gate:** Run `validate-submission` on agent PRs when `submission-gate` is enabled. Block on Gate 1 `blocking` severities.

## MCP Tools

Use these tools via the Trailhead MCP server (**26 tools**). Tools that don't require environment variables work with zero configuration.

**Cloud-backed feedback:** Set `TRAILHEAD_CLOUD_API_URL` + `TRAILHEAD_API_KEY` to persist feedback, noise charts, and tuning proposals to Trailhead Cloud instead of a local file store.

### Pre-Merge (run on every PR)

- **`compute-risk-score`** — Pass the list of changed files with line counts. Returns score (0–100), factor breakdown, and allow/warn/block decision.
- **`explain-risk-factors`** — Human-readable explanation of why a score is high. Use when score > 55.
- **`evaluate-policy`** — Full policy check: risk + security alerts + DORA signals + freeze windows. Use before approving any merge.
- **`get-security-alerts`** — Fetch open code scanning alerts grouped by severity. Block on criticals.
- **`validate-submission`** — Gate 1 + Phase 0 submission checks on file patches or suggestion content. Returns checks, remediation fixes, blocking flag.

### Agent loop (Phase A + B)

- **`get-remediation`** — Read remediation block from evaluation JSON or Trailhead Cloud.
- **`subscribe-events`** — Poll semantic webhook events until match.
- **`apply-autofix`** — Plan allowlisted autofixes from remediation fixes (dry-run default; no git writes from MCP).
- **`get-trust-score`** — Compute agent trust profile from `trailhead.agent_trust_metrics.v1` (returns null profile on cold start).

Action outputs **`verdict-json`** (`trailhead.verdict.v1`) and **`evaluation-json`** — new integrations should read `verdict.penalty` for pre-merge agent quality, not `riskScore` alone.

### Post-Deploy (run after every deployment)

- **`check-http-health`** — Probe any URL. Pass the production URL to verify deploy succeeded. Can also use `provider` parameter for named adapters (vercel, supabase, aws-ecs, fly-io, cloudflare).
- **`check-vercel-health`** — Vercel-specific: checks latest production deployment status. Requires `VERCEL_TOKEN` + `VERCEL_PROJECT_ID`.
- **`check-supabase-health`** — Pings Supabase REST API. Requires `SUPABASE_URL` + `SUPABASE_ANON_KEY`.
- **`evaluate-deployment`** — Combined health + risk evaluation in one call.

### Metrics & Timing

- **`get-dora-metrics`** — DORA-5 metrics for a repo: deployment frequency, change failure rate, lead time. Use when asked about deployment health or engineering velocity.
- **`compare-risk-history`** — Risk trend across recent merged PRs. Use to identify if risk is trending up.
- **`suggest-deploy-timing`** — Is now safe to deploy? Checks freeze windows and recent failure patterns.
- **`get-deployment-status`** — Current deployment state for a specific environment.

### Governance & Operations

- **`detect-provenance`** — Classify PR origin (`human`, `codex`, `claude`, `dependabot`, etc.).
- **`check-ci-integrity`** — Detect CI bypass and confidence downgrade patterns.
- **`check-supply-chain`** — Detect dependency-introduction and vulnerability signals.
- **`query-overrides`** — Query governed override records by repo/environment/time window.
- **`get-escalation-status`** — Evaluate escalation SLA state (`within_sla` vs `breached`).
- **`record-finding-feedback`** — Capture true/false-positive feedback for detectors. Uses Trailhead Cloud when configured.
- **`get-detector-noise`** — Aggregate detector noise/false-positive rates (Cloud or local store).
- **`recommend-policy-tuning`** — Generate threshold/mode tuning proposals from feedback (Cloud or local store).
- **`recommend-rollback`** — Propose/trigger rollback recommendation from canary + provenance.

## Workflow

The standard Trailhead workflow for any PR:

1. **Score** → `compute-risk-score` with the PR's changed files
2. **If agent PR** → `validate-submission` when submission gate enabled
3. **If score > 55** → `explain-risk-factors` to show the developer what's driving risk
4. **Check policy** → `evaluate-policy` for freeze windows, security alerts, DORA signals
5. **Trust** → `get-trust-score` when `TRAILHEAD_AGENT_TRUST_JSON` / metrics envelope present; **`null` trust = cold start** — do not treat as probation. Respect shadow vs enforce (`TRAILHEAD_TRUST_SHADOW`). Prefer **`verdict.penalty`** over deploy risk for agent quality signals.
6. **If clear** → approve merge
7. **After deploy** → `check-http-health` (and provider-specific checks if configured)
8. **If health fails** → `get-deployment-status` + surface the issue immediately
9. **After decision** → inspect rollout readiness (`rollout-readiness-json`) for go/review/hold guidance

## Configuration

Start from a persona preset — see [docs/getting-started.md](docs/getting-started.md):

| Preset | Command |
| ------ | ------- |
| Solo / small team | `npx @komatikai/trailhead init --preset solo` |
| Platform / eng lead | `init --preset team` |
| AI-authored PRs | `init --preset agent` |
| Ops / production | `init --preset ops` |

`.trailhead.yml` also supports custom thresholds, freeze windows, webhooks, submission gate (`submission.enabled`), and agent policies. Advanced fleet features: [docs/advanced-fleet.md](docs/advanced-fleet.md).

If no config file exists, sensible defaults apply (block at 70, warn at 55).

## GitHub Action

Trailhead runs as a GitHub Action (`KomatikAI/trailhead@v4`). The MCP tools and the Action use the same risk engine and submission engine — scores are identical regardless of interface. Use the MCP tools for interactive agent workflows; use the Action for CI automation.

## Repository Maintenance Notes

- **`dev`** is the default integration branch. Feature PRs target `dev`. **`dev` is ahead of `main`** with epic #252 / PR #261 (agent trust loop, verdict v1, CLI bundle).
- **`staging`** and **`main`** are promotion targets only (`dev` → `staging` → `main`, fast-forward).
- **Released on `main`:** v4.4.4; **`@v4`** tracks latest v4.x after promote. CLI: `npx @komatikai/trailhead@4.4.4` (prebuilt bundle after next tag publish).
- **Komatik agents dogfood:** [PR #206](https://github.com/KomatikAI/agents/pull/206) shadow collector; slim duplicated trust mirrors after merge. See `docs/agent-trust-metrics.md#komatik-fleet-integration`.
- MCP prebuild copies shared modules from `src/` into `mcp/src/` and `app/src/`; `submission-checks/` is copied as a directory.
- If `src/risk-engine.ts` or `src/submission-engine.ts` imports a new local module, update prebuild scripts and committed dist artifacts in the same change.
