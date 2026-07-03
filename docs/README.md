# Trailhead — Documentation

## Architecture Overview

Trailhead is a release readiness gate available in three forms:

1. **GitHub Action** (`@v4`) — the primary distribution. Runs in CI on every PR, waits for required checks, and publishes a composite **Release Ready** check.
2. **GitHub App** (`app/`) — a webhook server that acts as a Custom Deployment Protection Rule with the same composite gate logic.
3. **MCP Server** (`mcp/`) — 26 tools for AI agents via the Model Context Protocol.
4. **Trailhead Cloud** (`cloud/`) — optional hosted evaluation store, analytics dashboard, feedback loop, and org billing tiers (v4.1).

All three runtime interfaces plus Cloud share a single **risk engine** (`src/risk-engine.ts`) and v4 modules (`ci-core.ts`, `release-ready.ts`, `context-matcher.ts`, `deployment-gate.ts`, `feedback-core.ts`) — pure TypeScript with no framework dependencies.

```
┌──────────────────────────────────────────────────────────────────┐
│  Shared modules (pure — no @actions deps)                         │
│  risk-engine · ci-core · release-ready · context-matcher · types  │
│  feedback-core · deployment-gate · config-core · submission-engine │
│  fixer-core · trust-score · trust-runtime · agent-trust-metrics · verdict │
│  agent-trust-feedback · credit-meter                                      │
├──────────────────┬────────────────────┬───────────────────────────┤
│  GitHub Action   │    GitHub App      │       MCP Server          │
│  src/main.ts     │  app/handler.ts    │     mcp/server.ts         │
│  src/gate.ts     │  deployment-gate   │     evaluate-policy       │
│  ci-orchestrator │  config-core       │     get-pr-release-status │
└──────────────────┴────────────────────┴───────────────────────────┘
         │                    │                      │
         └────────── composite release-ready decision ──────────────┘
                                    │
                    optional POST ──┴── Trailhead Cloud (cloud/)
                    evaluations · feedback · analytics dashboard
```

### CLI

`npx @komatikai/trailhead init` — audience-aware wizard (solo / team / agent / ops). Prebuilt bundle, no build step. See [docs/getting-started.md](./getting-started.md) and [cli/README.md](../cli/README.md).

## Risk Scoring

Every evaluation produces a **risk score** (0-100) computed as a weighted average of 17 factors:

| Factor                  | Weight | What it measures                                                             |
| ----------------------- | ------ | ---------------------------------------------------------------------------- |
| `security_alerts`       | 4      | Open code scanning alerts (critical=30, high=15, medium=5 each)              |
| `code_churn`            | 3      | Lines changed, weighted by file sensitivity (auth 3x, infra 2x)              |
| `sensitive_files`       | 3      | Whether the PR touches auth, migrations, payments, CI, or secrets            |
| `file_count`            | 2      | Number of files changed (logarithmic scale)                                  |
| `test_coverage`         | 2      | Ratio of test files to source files in the PR                                |
| `dependency_changes`    | 2      | Whether dependency manifests or lockfiles were modified                      |
| `deployment_history`    | 2      | Recent deployment failures in the target environment                         |
| `canary_status`         | 2      | Deploy outcome signals from canary/progressive rollouts                      |
| `author_history`        | 1      | How familiar the author is with the repo (90-day commit count)               |
| `pr_age`                | 1      | How long the PR has been open (stale PRs carry more risk)                    |
| `ci_integrity`          | 3      | CI confidence downgrades (bypass patterns, test deletion signals)            |
| `workflow_security`     | 4      | Workflow hardening checks (token scope, untrusted shell patterns)            |
| `prompt_injection_risk` | 4      | Unsanitized untrusted input flowing into prompts/command paths               |
| `supply_chain`          | 3      | Dependency introduction/major jumps/vuln markers in diff                     |
| `pr_scope`              | 2      | Oversized PR pressure and plan requirements for agent-authored changes       |
| `duplicate_logic`       | 1      | Newly added helper/utility logic that appears to duplicate existing patterns |
| `cross_repo_impact`     | 2      | Contract changes that impact declared downstream repos/services              |

### Sensitivity Weighting

File changes are not counted equally. The risk engine applies multipliers based on file type:

| File pattern                       | Multiplier | Rationale                     |
| ---------------------------------- | ---------- | ----------------------------- |
| `auth/`, `security/`, `payment/`   | 3x         | Security/financial critical   |
| `migrations/`, `.github/`, `.env`  | 2x         | Infrastructure and CI         |
| Regular source files               | 1x         | Baseline                      |
| Config/docs (`.md`, `.json`, etc.) | 0.5x       | Low impact                    |
| Test files (`.test.ts`, etc.)      | 0.3x       | Tests reduce risk, not add it |

### Gate Decision

The weighted average determines the outcome:

- **allow** — risk below `warn-threshold` and health above 50
- **warn** — risk between warn and block thresholds, or health below 50
- **block** — risk above `risk-threshold`

## Security Gate

Trailhead integrates with GitHub Code Scanning (CodeQL, Semgrep, etc.). Open alerts automatically increase the risk score via the `security_alerts` factor (weight 4 — the highest).

Configure in `.trailhead.yml`:

```yaml
security:
  severity_threshold: warning
  block_on_critical: true
  ignore_rules:
    - "js/unused-variable"
```

When `block_on_critical: true`, any critical alert forces the security factor score to 90+.

## Canary / Deploy Outcome Tracking

Trailhead can track deployment outcomes from Vercel webhooks or a generic webhook format. This feeds the `canary_status` and `deployment_history` risk factors.

Configure in `.trailhead.yml`:

```yaml
canary:
  webhook_type: vercel # or "generic"
  field_map: # only for generic type
    status: "$.deployment.state"
    environment: "$.deployment.environment"
```

The GitHub App exposes a `/webhook/deploy-outcome` endpoint for receiving these signals.

## DORA-5 Metrics

Trailhead computes all five DORA metrics from GitHub data:

1. **Deployment Frequency** — successful workflow runs per week
2. **Change Failure Rate** — ratio of reverts/hotfixes to total merged PRs
3. **Lead Time to Change** — median time from first commit to PR merge
4. **Failed Deployment Recovery Time** — median recovery after failed deployments
5. **Change Rework Rate** — PRs that modify the same files as recently merged PRs

Enable via `dora-metrics: "true"` in the action, or use the `get-dora-metrics` MCP tool.

Ratings follow the DORA benchmark: **Elite** (daily deploys, <5% CFR), **High**, **Medium**, **Low**.

## Per-Environment Configuration

Override thresholds per deployment environment in `.trailhead.yml`:

```yaml
thresholds:
  risk: 80
  warn: 60

environments:
  production:
    risk: 50
    warn: 35
    require_security_clear: true
  staging:
    risk: 80
    warn: 60
```

Both the Action and the App respect these overrides when `environment` is set.

Trailhead prefers `.trailhead.yml` from the checked-out workspace. For existing installs,
legacy v1 config filenames are still accepted when `.trailhead.yml` is absent.

This repository's `.trailhead.yml` ignores generated MCP copy/artifact paths so risk scores
reflect canonical source changes instead of prebuild output.

## Policy Profiles and Governed Overrides

Trailhead ships an environment-aware fail policy by default:

- `production` defaults to fail-closed (blocks when Trailhead itself fails)
- all other environments default to fail-open with visible warnings

You can still override policy settings temporarily, but overrides are enforceable and auditable.
Any `override-*` input requires:

- owner
- reason
- linked ticket
- expiry timestamp

Active overrides are included in the gate report and evaluation payload.

Agent and detector-specific policy controls live in `.trailhead.yml`:

```yaml
policies:
  agent_prs:
    enabled: true
    mode: block # use warn for advisory-only measurement
    risk_threshold: 60
    required_approvals: 2
    require_code_owner_approval: true
    code_owner_reviewers: ["platform-owner"]
  ci_integrity:
    enabled: true
    mode: block
  workflow_security:
    enabled: true
    mode: block
  prompt_injection:
    enabled: true
    mode: block
  supply_chain:
    enabled: true
    mode: warn
  session_correlation:
    enabled: true
    threshold: 3
    window_minutes: 60
    mode: warn
```

For reusable starter packs and governance templates, use `examples/policy-pack/`.

For Phase 2 (enforcement, canary-first promotion, and unblock operations), use
`examples/policy-pack/phase-2/`.

## Monorepo Service Boundaries

Define independent services for monorepos — each gets its own risk evaluation:

```yaml
services:
  api:
    paths: ["src/api/**", "src/models/**"]
    environment: production
  web:
    paths: ["src/components/**", "src/pages/**"]
    environment: preview
```

## Freeze Windows

Block deployments during designated periods:

```yaml
freeze:
  - days: ["friday", "saturday"]
    afterHour: 15
    message: "No deploys after 3pm Friday through Saturday"
```

## OpenTelemetry Export

Trailhead can export evaluation spans to any OTLP-compatible backend:

```yaml
- uses: KomatikAI/trailhead@v4
  with:
    otel-endpoint: "https://otel.example.com:4318/v1/traces"
    otel-headers: "Authorization=Bearer ${{ secrets.OTEL_TOKEN }}"
```

Each evaluation produces a span with risk score, health score, gate decision, and factor breakdown as attributes.

## Evaluation Storage

See **[evaluation-storage.md](evaluation-storage.md)** for the full guide. Summary:

1. **Trailhead Cloud (Pro/Team)** — set `trailhead-api-key` in the Action; evaluations POST to `https://api.trailhead.dev/v1/evaluations`.
2. **Bring-your-own-store** — POST JSON to `evaluation-store-url` with `evaluation-store-secret` as Bearer token.
3. **Supabase fallback** — direct REST insert when primary store fails and `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set.

The dashboard lives at `/dashboard` on the Cloud API. MCP feedback tools (`record-finding-feedback`, `get-detector-noise`, `recommend-policy-tuning`) use Cloud when `TRAILHEAD_CLOUD_API_URL` + `TRAILHEAD_API_KEY` are configured.

## Rollout Readiness Output

Action runs emit `rollout-readiness-json`, a compact go/review/hold recommendation derived
from gate decision, risk/health scores, trust profile strictness, and governance findings.

Example:

```json
{
  "ready": false,
  "band": "review",
  "score": 58,
  "reasons": ["Gate decision is WARN", "Elevated trust profile strictness"]
}
```

## Documentation index

| Doc                                                      | Audience                                         |
| -------------------------------------------------------- | ------------------------------------------------ |
| [getting-started.md](./getting-started.md)               | **Everyone** — personas, presets, wizard         |
| [advanced-fleet.md](./advanced-fleet.md)                 | Fleet / AI ops — trust, verdict, metering        |
| [submission-gate.md](./submission-gate.md)               | AI PR shops — Gate 1 reference                   |
| [agents-submission-soak.md](./agents-submission-soak.md) | B4 agents dogfood — flip criterion + measurement |
| [komatik-hosted-store.md](./komatik-hosted-store.md)     | Fleet warehouse at komatik.ai                    |
| [agent-trust-metrics.md](./agent-trust-metrics.md)       | Trust loop implementers                          |
| [verdict.md](./verdict.md)                               | Collector integrators                            |
| [migration-v3-to-v4.md](./migration-v3-to-v4.md)         | Upgrading from `@v3`                             |

## Agent Autonomy (v4.3 → v4.4)

Trailhead is evolving from a human-supervised merge gate into a **coach → fixer → autopilot** loop for agent-authored PRs.

### Phase A — Coach (v4.3.x, shipped)

- **`remediation` block** in `evaluation-json` — machine-readable fix checklist per gate run
- **Agent brief** — collapsed PR comment section with JSON + human-readable steps
- **Semantic webhooks** — `trailhead.blocked`, `trailhead.warn_high_risk`, `trailhead.ready`, `trailhead.loop_exceeded` (schema `trailhead.webhook.v1`)
- **MCP tools** — `get-remediation`, `subscribe-events` (long-poll)

### Phase B — Fixer (v4.4.x, shipped on `dev`)

- **Gate 1 submission engine** — 15 blocking checks via `submission-gate: true` ([submission-gate.md](./submission-gate.md)); **config-driven detector policy** in `.trailhead.yml` ([#256](https://github.com/KomatikAI/trailhead/issues/256))
- **Phase 0 suggestion heuristics** — 14 advisory checks on `agents/*/suggestions/**/*.md` (v4.4.2)
- **Autofix allowlist** — `fixer-core` + `app/fixer.ts` (plan only; git write pending)
- **Agent trust loop** — `trailhead.agent_trust_metrics.v1`, cold-start null, shadow/enforce runtime, post-merge `trailhead.feedback.v1` ([agent-trust-metrics.md](./agent-trust-metrics.md), [agent-trust-feedback.md](./agent-trust-feedback.md); epic [#252](https://github.com/KomatikAI/trailhead/issues/252) / [#261](https://github.com/KomatikAI/trailhead/pull/261))
- **Gate verdict** — stable `trailhead.verdict.v1` on Action `verdict-json` output ([verdict.md](./verdict.md))
- **MCP tools** — `validate-submission`, `apply-autofix`, `get-trust-score`
- **Credit metering** — optional Komatik `deploy_check` ingest ([komatik-credit-metering.md](./komatik-credit-metering.md))
- **CLI bundle** — `@komatikai/trailhead` ships ncc `dist/` + cross-platform SWC bindings ([#258](https://github.com/KomatikAI/trailhead/issues/258))

Configure semantic delivery in workflow YAML:

```yaml
- uses: KomatikAI/trailhead@v4
  with:
    webhook-url: ${{ secrets.TRAILHEAD_WEBHOOK_URL }}
    webhook-events: "block,warn,trailhead.blocked,trailhead.warn_high_risk,trailhead.ready,trailhead.loop_exceeded"
```

The Komatik fleet (`agents` repo) runs a Trailhead coordinator receiver (Spark port 3199, [PR #175](https://github.com/KomatikAI/agents/pull/175)) that routes remediation to fleet agents via `agent_messages`. See [docs/roadmap-v4.3-agent-autonomy.md](roadmap-v4.3-agent-autonomy.md) for the full plan.

Human PRs (`claude/*`, `cursor/*`, explicit `human` provenance) are unchanged — fail-open defaults preserved.

## Branch and Release Context

This repository uses the **progressive branch model**: **`dev`** (integration/default) → **`staging`** (pre-production) → **`main`** (production). Open feature PRs against **`dev`**. CI runs on PRs to `dev` and on pushes to `dev`, `staging`, and `main`. Promote with fast-forward merges only; tag releases on `main`.

**Current state (Jun 6, 2026):** **`main`** is **v4.5.2** (`@v4` advanced on tag push). Fleet pinned `@v4.5.2` explicitly (komatik, agents, 7 satellites). **v4.5.1** warehouse audit ([#280](https://github.com/KomatikAI/trailhead/pull/280)): PR-scoped security, store analytics fields, provenance fix. Komatik store migration [#2248](https://github.com/KomatikAI/komatik/pull/2248) on prod. **v4.5.2** risk calibration ([#284](https://github.com/KomatikAI/trailhead/pull/284)): `risk.non_source_globs`, `presets/agent-docs.yml`. **B4 agents soak:** pre–Jun 6 evals invalid; measure with `scripts/query-agents-submission-soak.mjs` — see [agents-submission-soak.md](./agents-submission-soak.md). Do not flip `submission.mode` to `block` until submission_checks FP < 10% over 30 distinct PRs.

## Key Decisions

- **[ADR-001](adr/001-mcp-health-check-ecosystem.md)**: MCP health check ecosystem patterns (adapter-based provider model)
- **[ADR-002](adr/002-fail-open-default.md)**: Fail-open by default (vs. fail-closed)
- **[ADR-003](adr/003-shared-risk-engine.md)**: Shared risk engine across Action, App, and MCP (vs. independent implementations)
- **[ADR-004](adr/004-sensitivity-weighted-churn.md)**: Sensitivity-weighted code churn (vs. raw line count)
- **[ADR-005](adr/005-dora-from-github-data.md)**: DORA-5 computed from GitHub data (vs. requiring external deployment tracking)
