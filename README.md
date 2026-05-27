# Trailhead

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Trailhead-green?logo=github)](https://github.com/marketplace/actions/trailhead)
[![CI](https://github.com/KomatikAI/trailhead/actions/workflows/ci.yml/badge.svg)](https://github.com/KomatikAI/trailhead/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Release readiness gate for GitHub PRs.** Trailhead waits for required CI checks, scores code risk, checks production health, integrates security signals, and produces a single **Release Ready** decision — one check, one ruleset, one merge gate.

## Quick Start

**Option A — Interactive setup (recommended for v4):**

```bash
npx @komatikai/trailhead init
```

The wizard generates a v2 `.trailhead.yml` with `gate.mode: release-ready`, branch-aware contexts, and a workflow pinned to `@v4`.

**Option B — Manual setup:**

Create `.github/workflows/trailhead.yml` in your repo:

```yaml
name: Trailhead
on:
  pull_request:

permissions:
  contents: read
  checks: write
  pull-requests: write
  security-events: read

jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: KomatikAI/trailhead@v4
        with:
          gate-mode: release-ready
          wait-for-checks: "true"
          risk-threshold: "70"
```

Configure required CI checks in `.trailhead.yml`:

```yaml
schema_version: 2
gate:
  mode: release-ready
contexts:
  - name: main
    match:
      base_branch: [main]
    ci:
      required_checks: [CI, Build, Playwright]
```

Open a pull request. Trailhead polls GitHub Checks, scores risk, and posts a composite **Trailhead — Release Ready** check.

No API key. No secrets. That's it.

### Trailhead Cloud (optional)

For hosted evaluation storage, analytics, and org dashboards, use a **Trailhead Cloud** API key instead of configuring a store URL:

```yaml
- uses: KomatikAI/trailhead@v4
  with:
    gate-mode: release-ready
    trailhead-api-key: ${{ secrets.TRAILHEAD_API_KEY }}
```

| Tier | Cloud store | Dashboard        | Quota                    |
| ---- | ----------- | ---------------- | ------------------------ |
| Free | —           | —                | Risk-only gate (local)   |
| Pro  | Yes         | Yes              | 5,000 evals/month        |
| Team | Yes         | Yes + org rollup | 50,000 evals/month + SSO |

See [docs/evaluation-storage.md](docs/evaluation-storage.md) and [docs/marketplace-tiers.md](docs/marketplace-tiers.md). Run the Cloud API locally with `cd cloud && npm run dev` → http://localhost:3101/dashboard.

Bring-your-own-store (`evaluation-store-url` + secret) remains supported for self-hosted deployments.

### Gate modes

| Mode            | Behavior                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `release-ready` | **Default for v2 configs.** Blocks merge when CI fails, risk exceeds threshold, freeze is active, or health checks fail. |
| `advisory`      | Runs full evaluation but never blocks — useful for rollout and shadow mode.                                              |
| `risk-only`     | **v3 compatibility.** Risk score only; ignores CI orchestration. Default for v1 configs.                                 |

Override via workflow input: `gate-mode: release-ready | advisory | risk-only`.

See [docs/migration-v3-to-v4.md](docs/migration-v3-to-v4.md) for upgrading from `@v3`.

---

## How It Works

Trailhead analyzes every pull request and produces a **risk score** (0-100) based on 17 weighted factors:

| Factor                  | Weight | What it measures                                                                                                 |
| ----------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| `security_alerts`       | 4      | Open code scanning alerts (critical=30pt, high=15pt, medium=5pt each)                                            |
| `workflow_security`     | 4      | Dangerous workflow patterns (`write-all`, unpinned actions, untrusted shell interpolation)                       |
| `prompt_injection_risk` | 4      | Unsanitized untrusted input flowing into LLM prompts or command execution paths                                  |
| `code_churn`            | 3      | Lines changed, weighted by file sensitivity (auth 3x, infra 2x, config 0.5x, test 0.3x)                          |
| `sensitive_files`       | 3      | Whether the PR touches auth, migrations, payments, CI, or secrets                                                |
| `ci_integrity`          | 3      | CI confidence downgrades (shell bypass patterns, `continue-on-error`, heavy test deletion, coverage relaxations) |
| `supply_chain`          | 3      | Dependency introduction, major version jumps, and critical-vulnerability markers in diffs                        |
| `file_count`            | 2      | Number of files changed (logarithmic scale)                                                                      |
| `test_coverage`         | 2      | Ratio of test files to source files in the PR                                                                    |
| `dependency_changes`    | 2      | Whether dependency manifests or lockfiles were modified                                                          |
| `deployment_history`    | 2      | Recent deployment failures in the target environment                                                             |
| `canary_status`         | 2      | Deploy outcome signals from canary/progressive rollouts                                                          |
| `pr_scope`              | 2      | Scope pressure from oversized PRs (file/change thresholds and plan requirements)                                 |
| `cross_repo_impact`     | 2      | Contract-surface changes that affect declared downstream services/repos                                          |
| `author_history`        | 1      | How familiar the author is with the repo (90-day commit count)                                                   |
| `pr_age`                | 1      | How long the PR has been open (stale PRs carry more risk)                                                        |
| `duplicate_logic`       | 1      | Newly added utility/helper logic that appears to duplicate existing code patterns                                |

The weighted average determines the decision:

- **allow** — risk below `warn-threshold` (default: 55)
- **warn** — risk between warn and block thresholds
- **block** — risk above `risk-threshold` (default: 70), fails the check

### Agent Governance Signals

Beyond the scalar risk score, Trailhead now emits governance context in `evaluation-json`:

- PR provenance classification (`human`, `dependabot`, `copilot`, `codex`, `claude`, `custom-bot`, `unknown`)
- Agent-policy findings (approval requirements, sensitive-path gates, strict unknown handling)
- Session-correlation burst signals
- Trust profile strictness (`baseline`, `elevated`, `strict`)
- Escalation status metadata and SLA fields

## Inputs

| Input                       | Required | Default               | Description                                                                            |
| --------------------------- | -------- | --------------------- | -------------------------------------------------------------------------------------- |
| `github-token`              | No       | `${{ github.token }}` | GitHub token for PR analysis and comments                                              |
| `risk-threshold`            | No       | `70`                  | Block the PR above this risk score (0-100)                                             |
| `warn-threshold`            | No       | risk - 15             | Warn above this risk score (0-100)                                                     |
| `health-check-urls`         | No       | —                     | Comma-separated URLs to health-check before scoring                                    |
| `fail-mode`                 | No       | env-aware             | Error policy: explicit `open`/`closed`, or auto (`production`=`closed`, others=`open`) |
| `override-fail-mode`        | No       | —                     | Governed temporary override for fail mode (requires override metadata)                 |
| `override-risk-threshold`   | No       | —                     | Governed temporary risk threshold override (0-100)                                     |
| `override-warn-threshold`   | No       | —                     | Governed temporary warn threshold override (0-100)                                     |
| `override-reason`           | No       | —                     | Required when any override is set                                                      |
| `override-owner`            | No       | —                     | Required when any override is set                                                      |
| `override-ticket`           | No       | —                     | Required when any override is set                                                      |
| `override-expires-at`       | No       | —                     | Required when any override is set (ISO-8601)                                           |
| `self-heal`                 | No       | `false`               | Auto-repair failing tests (needs `TRAILHEAD_TEST_FAILURES` env)                        |
| `add-risk-labels`           | No       | `true`                | Add `trailhead:low-risk` / `warn` / `high-risk` labels to the PR                       |
| `reviewers-on-risk`         | No       | —                     | Comma-separated usernames to request review on warn/block                              |
| `webhook-url`               | No       | —                     | URL to POST results to (Slack, Discord, custom)                                        |
| `webhook-events`            | No       | `warn,block`          | Which decisions trigger the webhook                                                    |
| `trailhead-api-key`         | No       | —                     | Trailhead Cloud API key — auto-configures store URL + auth (v4.1)                      |
| `evaluation-store-url`      | No       | —                     | URL to POST evaluations for trend dashboards (BYOS; omit if using `trailhead-api-key`) |
| `evaluation-store-secret`   | No       | —                     | Bearer token for `evaluation-store-url`                                                |
| `evaluation-store-retries`  | No       | `3`                   | Retry attempts for transient evaluation store failures                                 |
| `dora-metrics`              | No       | `false`               | Compute DORA-5 metrics alongside the gate evaluation                                   |
| `dora-environment`          | No       | —                     | Filter DORA metrics to a specific deployment environment                               |
| `environment`               | No       | —                     | Target deployment environment (for per-env threshold overrides)                        |
| `gate-mode`                 | No       | from `.trailhead.yml` | `release-ready`, `advisory`, or `risk-only` (overrides config)                         |
| `wait-for-checks`           | No       | auto in release-ready | Poll GitHub Checks until required checks complete or timeout                           |
| `wait-timeout-minutes`      | No       | `30`                  | Max minutes to wait for required CI checks                                             |
| `ci-manifest-path`          | No       | —                     | Path to `ci-manifest.json` for path-filter skip semantics (v4.2)                       |
| `ci-external-status-url`    | No       | —                     | URL to fetch external CI JSON (supports `{sha}`); see `docs/ci-external-webhook.md`    |
| `ci-external-status-secret` | No       | —                     | Bearer token for `ci-external-status-url`                                              |
| `gitlab-api-url`            | No       | GitLab.com API v4     | GitLab API base URL (with `gitlab-token` + `gitlab-project-id`)                        |
| `gitlab-token`              | No       | —                     | GitLab token for pipeline job polling (E17.1)                                          |
| `gitlab-project-id`         | No       | —                     | GitLab project ID or URL-encoded path                                                  |
| `circleci-token`            | No       | —                     | CircleCI API token for workflow polling (E17.2)                                        |
| `circleci-project-slug`     | No       | —                     | CircleCI project slug (e.g. `gh/org/repo`)                                             |
| `check-name`                | No       | auto by gate mode     | GitHub check run name (`Trailhead — Release Ready` or `Trailhead`)                     |
| `security-gate`             | No       | `true`                | Enable Code Scanning alerts as a risk factor                                           |
| `canary-webhook-secret`     | No       | —                     | HMAC secret for deploy outcome webhooks                                                |
| `otel-endpoint`             | No       | —                     | OTLP HTTP endpoint for exporting evaluation spans                                      |
| `otel-headers`              | No       | —                     | Auth headers for the OTLP endpoint (key=value, comma-separated)                        |
| `api-key`                   | No       | —                     | API key for remote enrichment (omit for local-only)                                    |

## Outputs

| Output                      | Description                                                                      |
| --------------------------- | -------------------------------------------------------------------------------- |
| `risk-score`                | Code risk score (0-100)                                                          |
| `health-score`              | Infrastructure health score (0-100, always 100 when no health checks configured) |
| `gate-decision`             | `allow`, `warn`, or `block`                                                      |
| `release-ready`             | Composite release readiness (`true`/`false`) in release-ready mode               |
| `evaluation-json`           | Full evaluation as JSON for downstream steps                                     |
| `rollout-readiness-json`    | Rollout recommendation payload (`go`, `review`, `hold`) with readiness score     |
| `report-url`                | Report URL (only when using remote API)                                          |
| `security-alerts-json`      | Code scanning alert summary as JSON (when alerts exist)                          |
| `environment`               | Deployment environment used for this evaluation                                  |
| `dora-deployment-frequency` | Deployment frequency (e.g. "4.2 per week")                                       |
| `dora-change-failure-rate`  | Change failure rate (e.g. "8.3%")                                                |
| `dora-lead-time`            | Lead time to change (e.g. "2.1 hours")                                           |
| `dora-fdrt`                 | Failed deployment recovery time                                                  |
| `dora-rework-rate`          | Change rework rate percentage                                                    |
| `dora-rating`               | Overall DORA-5 rating: ELITE, HIGH, MEDIUM, or LOW                               |
| `dora-json`                 | Full DORA-5 metrics as JSON                                                      |

---

## Security Gate

Trailhead integrates with GitHub Code Scanning to include security alerts as a risk factor. When Code Scanning (CodeQL, Semgrep, etc.) is configured, open alerts automatically increase the risk score.

Configure thresholds in `.trailhead.yml`:

```yaml
security:
  severity_threshold: warning # minimum severity to consider
  block_on_critical: true # force score ≥ 90 on critical alerts
  ignore_rules:
    - "js/unused-variable" # suppress specific rules
```

---

## DORA-5 Metrics

Enable built-in DORA-5 metrics to track deployment health:

```yaml
- uses: KomatikAI/trailhead@v4
  with:
    dora-metrics: "true"
    dora-environment: "Production"
```

**Workflow permissions:** add `actions: read` (deployment frequency) and `deployments: read` (FDRT) to the job or workflow. If those APIs are unavailable, Trailhead can fall back to `trailhead_evaluations.deploy_outcome` when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set (same as the evaluation store direct-insert path).

Trailhead computes all five DORA metrics from your GitHub data:

- **Deployment Frequency** — successful workflow runs or deployments per week
- **Change Failure Rate** — ratio of reverts/hotfixes to total merged PRs
- **Lead Time to Change** — median time from first commit to PR merge
- **Failed Deployment Recovery Time** — median recovery time after failed deployments
- **Change Rework Rate** — PRs that modify the same files as recently merged PRs

Results appear as shield badges in the Job Summary and are available as action outputs.

---

## Per-Repo Configuration

Create `.trailhead.yml` in your repo root:

```yaml
schema_version: 1

sensitivity:
  high:
    - "src/auth/**"
    - "src/billing/**"
  medium:
    - "src/api/**"

thresholds:
  risk: 80
  warn: 60

# Per-environment threshold overrides
environments:
  production:
    risk: 50
    warn: 35
    require_security_clear: true
  staging:
    risk: 80
    warn: 60

# Monorepo service boundaries
services:
  api:
    paths: ["src/api/**", "src/models/**"]
    environment: production
    contracts: ["src/api/contracts/**"]
    consumers: ["web", "worker"]
  web:
    paths: ["src/components/**", "src/pages/**"]
    environment: preview

# Security alert configuration
security:
  severity_threshold: warning
  block_on_critical: true

# Canary / deploy outcome tracking
canary:
  webhook_type: vercel

escalation:
  targets: ["slack:#release-ops", "email:oncall@example.com"]
  acknowledge_sla_minutes: 30
  resolve_sla_minutes: 240

policies:
  agent_prs:
    enabled: true
    risk_threshold: 60
    required_approvals: 2
    require_code_owner_approval: true
    code_owner_reviewers: ["platform-owner"]
    sensitive_paths: ["src/auth/**", "src/billing/**", ".github/workflows/**"]
    strict_on_unknown_provenance: true
  session_correlation:
    enabled: true
    threshold: 3
    window_minutes: 60
    mode: warn
  ci_integrity:
    enabled: true
    mode: block
  workflow_security:
    enabled: true
    mode: block
    allow_unpinned_actions: []
  prompt_injection:
    enabled: true
    mode: block
  supply_chain:
    enabled: true
    mode: warn
    force_score_on_critical: 80
  pr_scope:
    enabled: true
    max_files: 50
    max_changes: 2000
    mode: warn
    require_plan_for_agent_prs: true
  duplicate_logic:
    enabled: true
    mode: warn
  cross_repo_impact:
    enabled: true
    mode: warn

# Release freeze windows
freeze:
  - days: ["friday", "saturday"]
    afterHour: 15
    message: "No deploys after 3pm Friday through Saturday"

ignore:
  - "*.generated.ts"
  - "package-lock.json"
```

Trailhead first loads `.trailhead.yml` from the checked-out workspace, then falls back to
the GitHub Contents API. Existing repositories can keep using the legacy v1 config filename;
Trailhead will read it when `.trailhead.yml` is not present.

This repository's own `.trailhead.yml` ignores generated MCP copy/artifact paths
(`mcp/src/adapters/**`, `mcp/dist/adapters/**`, and `mcp/dist/risk-engine.*`) so the gate
scores canonical source changes rather than prebuild output.

---

## Compatibility

Trailhead is the canonical product name.
Compatibility remains for shipped surfaces:

- Legacy v1 config filenames are still accepted as a fallback.
- Legacy v1 environment variable aliases are still read where those aliases were
  previously supported.
- Legacy pre-rebrand risk labels are removed when Trailhead applies the new
  `trailhead:*` risk label.

## Policy Profiles and Overrides

Trailhead now supports environment-aware defaults out of the box:

- `production` defaults to fail-closed when `fail-mode` is not set.
- `staging`, `dev`, and other environments default to fail-open with warning visibility.

Temporary overrides are supported but governed. If any override input is set (`override-*`),
Trailhead requires:

- `override-reason`
- `override-owner`
- `override-ticket`
- `override-expires-at` (future ISO-8601 timestamp)

Applied overrides are attached to `evaluation-json`, included in PR reports, and carried through
evaluation storage/webhooks for auditability.

---

## GitHub App

Trailhead also ships as a GitHub App for [deployment protection rules](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment#deployment-protection-rules). When installed, it automatically gates deployments to protected environments based on real-time risk scoring and health checks.

See [`app/README.md`](app/README.md) for setup and configuration details.

---

## OpenTelemetry

Export every gate evaluation as an OTel span. Point `otel-endpoint` at any OTLP-compatible collector:

```yaml
- uses: KomatikAI/trailhead@v3
  with:
    otel-endpoint: "https://otel-collector.example.com:4318/v1/traces"
    otel-headers: "Authorization=Bearer ${{ secrets.OTEL_TOKEN }}"
```

Pre-built dashboards for Grafana and Datadog are available in [`examples/observability/`](examples/observability/).

---

## Full Example

A production-grade setup with all v3 features:

```yaml
name: Trailhead
on:
  pull_request:
    branches: [main, staging]

permissions:
  contents: read
  checks: write
  pull-requests: write
  security-events: read

concurrency:
  group: trailhead-${{ github.ref }}
  cancel-in-progress: true

jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: KomatikAI/trailhead@v4
        id: gate
        with:
          risk-threshold: "75"
          warn-threshold: "55"
          health-check-urls: "https://myapp.com/api/health"
          add-risk-labels: "true"
          reviewers-on-risk: "lead-dev,security-team"
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}
          webhook-events: "warn,block"
          dora-metrics: "true"
          dora-environment: "production"
          environment: "production"
          security-gate: "true"
          otel-endpoint: ${{ secrets.OTEL_ENDPOINT }}
          otel-headers: "Authorization=Bearer ${{ secrets.OTEL_TOKEN }}"
          evaluation-store-url: "https://myapp.com/api/trailhead/store"
          evaluation-store-secret: ${{ secrets.INTERNAL_API_SECRET }}
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}

      - name: Gate results
        run: |
          echo "Decision: ${{ steps.gate.outputs.gate-decision }}"
          echo "Risk:     ${{ steps.gate.outputs.risk-score }}"
          echo "Health:   ${{ steps.gate.outputs.health-score }}"
          echo "DORA:     ${{ steps.gate.outputs.dora-rating }}"
```

---

## CLI

```bash
npx @komatikai/trailhead init
```

Interactive wizard that generates v2 `.trailhead.yml` and a `@v4` workflow with gate modes, contexts, and optional Cloud store configuration. No installation required.

---

## Documentation

| Doc                                                        | Description                               |
| ---------------------------------------------------------- | ----------------------------------------- |
| [docs/README.md](docs/README.md)                           | Architecture, risk factors, configuration |
| [docs/migration-v3-to-v4.md](docs/migration-v3-to-v4.md)   | Upgrade from `@v3`                        |
| [docs/evaluation-storage.md](docs/evaluation-storage.md)   | Cloud vs bring-your-own-store             |
| [docs/marketplace-tiers.md](docs/marketplace-tiers.md)     | Free / Pro / Team plans                   |
| [docs/ci-manifest.md](docs/ci-manifest.md)                 | Path-filter CI manifest (v4.2)            |
| [docs/ci-external-webhook.md](docs/ci-external-webhook.md) | GitLab/CircleCI/webhook CI adapters (E17) |
| [docs/cross-repo-impact.md](docs/cross-repo-impact.md)     | Consumer registry + satellite webhooks    |
| [cloud/README.md](cloud/README.md)                         | Cloud API and local dev                   |

- [Multi-CI templates](examples/) — GitLab CI and CircleCI configurations
- [Observability dashboards](examples/observability/) — Grafana and Datadog dashboard imports
- [Auto-rollback workflow](examples/github-actions/) — automated rollback on deployment failure
- [Policy rollout pack](examples/policy-pack/) — Phase 1 and Phase 2 governance/enforcement templates

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, testing, and PR guidelines.

## Security

See [SECURITY.md](SECURITY.md) for our security policy and how to report vulnerabilities.

## License

[MIT](LICENSE)
