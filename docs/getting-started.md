# Getting started with Trailhead

Trailhead adds one GitHub check — **Release Ready** — that means more than “CI passed.” It waits for your required checks, scores PR risk, and (optionally) blocks merges when policy says you are not ready to ship.

Pick the path that matches you:

| I am…                 | Start here                                  | Preset                    |
| --------------------- | ------------------------------------------- | ------------------------- |
| Solo dev / small team | [Solo setup](#solo--small-team)             | `presets/solo.yml`        |
| Platform / eng lead   | [Team setup](#platform--eng-lead)           | `presets/team.yml`        |
| Shop using AI on PRs  | [Agent guard](#ai-authored-prs)             | `presets/agent-guard.yml` |
| Docs/suggestion repo  | [Agent docs](#docs-heavy--suggestion-repos) | `presets/agent-docs.yml`  |
| Ops-minded team       | [Ops setup](#ops--production-safety)        | `presets/ops.yml`         |

## Fastest path (any persona)

```bash
npx @komatikai/trailhead init
```

The wizard asks **what you are protecting** and only prompts for what matters. Non-interactive:

```bash
npx @komatikai/trailhead init --preset solo
```

Validate config offline:

```bash
npx @komatikai/trailhead doctor --offline
```

---

## Solo / small team

**Goal:** One repo, one merge gate beyond CI green. No fleet jargon.

### What you get

- `gate.mode: release-ready` — blocks when CI fails or risk is too high
- Required checks you name (default: `CI`, `Build`)
- Security alerts as a risk factor (when Code Scanning is enabled)
- No submission gate, no DORA, no freeze unless you add them later

### Setup

```bash
npx @komatikai/trailhead init --preset solo
# or copy: cp presets/solo.yml .trailhead.yml
```

Minimal workflow (wizard generates this):

```yaml
name: Trailhead
on:
  pull_request:
    types: [opened, synchronize, reopened, labeled, unlabeled]

concurrency:
  group: trailhead-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}-${{ ((github.event.action == 'labeled' || github.event.action == 'unlabeled') && github.event.label.name != 'trailhead-override') && github.run_id || 'gate' }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: write
  checks: write
  security-events: read

jobs:
  trailhead:
    if: >-
      (github.event.action != 'labeled' && github.event.action != 'unlabeled') ||
      github.event.label.name == 'trailhead-override'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: KomatikAI/trailhead@v4
        with:
          gate-mode: release-ready
          wait-for-checks: "true"
          risk-threshold: "70"
```

Branch protection: require the custom GitHub Actions check **Trailhead — Release
Ready** with **GitHub Actions** as its expected source (`integration_id: 15368` on
github.com). Do not require the workflow job name (`Trailhead Gate`, `Trailhead / gate`,
or similar): job checks belong to the triggering event's suite, while Trailhead's
custom check is published directly on the PR head.

To record a risk override, post `trailhead-override: <rationale>` first, then add the
`trailhead-override` label. The label action triggers a fresh `pull_request`
evaluation. If the label was added first, post the reason and re-run the job or remove
and re-add the label.

Human label changes trigger the workflow normally. GitHub suppresses recursive workflow
events created with that same workflow's `GITHUB_TOKEN`; automation that records an
override must use a GitHub App/PAT or explicitly dispatch the gate.

The generated concurrency group also makes the newest real gate event authoritative. This
prevents an older labeled evaluation from publishing after a newer unlabeled revocation.
GitHub evaluates workflow concurrency before the job-level label filter, so ignored label
activity must use a unique group rather than canceling the real gate. The workflow name also
prevents a separate fork publisher or other gate workflow from canceling it. For existing
workflows, use:

```yaml
concurrency:
  group: trailhead-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}-${{ ((github.event.action == 'labeled' || github.event.action == 'unlabeled') && github.event.label.name != 'trailhead-override') && github.run_id || 'gate' }}
  cancel-in-progress: true
```

### Public fork PRs

GitHub makes `GITHUB_TOKEN` read-only for `pull_request` workflows from forks, even
when the workflow requests `checks: write`. The generated workflow can evaluate those
PRs, but it cannot publish the protected custom check or PR comment. Public repositories
that accept forks need a separate publisher using `pull_request_target` and the base
repository's released action. It must never check out the fork head or execute fork code:

```yaml
name: Trailhead fork publisher
on:
  pull_request_target:
    types: [opened, synchronize, reopened, labeled, unlabeled]

concurrency:
  group: trailhead-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}-${{ ((github.event.action == 'labeled' || github.event.action == 'unlabeled') && github.event.label.name != 'trailhead-override') && github.run_id || 'gate' }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: write
  checks: write
  security-events: read

jobs:
  trailhead:
    if: >-
      github.event.pull_request.head.repo.fork == true &&
      ((github.event.action != 'labeled' && github.event.action != 'unlabeled') ||
      github.event.label.name == 'trailhead-override')
    runs-on: ubuntu-latest
    steps:
      # Security boundary: use the released action only. Do not checkout or run PR code.
      - uses: KomatikAI/trailhead@v4
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          gate-mode: release-ready
          wait-for-checks: "true"
```

This path still publishes as GitHub Actions, so github.com's expected-source id remains
`15368`. If you instead pass an installation token from a separate GitHub App, pin that
App—not GitHub Actions—as the ruleset's expected source. The `github.workflow` namespace keeps
this publisher's concurrency group distinct from the ordinary `pull_request` workflow. To avoid
duplicating read-only evaluation work once the publisher is installed, also prepend
`github.event.pull_request.head.repo.fork != true &&` to the ordinary workflow's job filter.

`pull_request_target` does not re-run when a review is submitted or dismissed. The no-checkout
publisher above is therefore insufficient for fork PRs when Trailhead enforces
`required_approvals` or code-owner approval. For those policies, use an installed GitHub App or
external publisher that listens to pull-request review webhooks and evaluates with a write-capable
installation token, then pin that App as the required-check source. If that bridge is unavailable,
do not make review state a blocking Trailhead input for fork PRs.

Example repo layout: [`examples/solo-web-app/`](../examples/solo-web-app/).

---

## Platform / eng lead

**Goal:** Same release policy across many repos — progressive promotion.

### What you get

- Contexts for **feature** (`dev`), **staging**, and **production** (`main`)
- Stricter thresholds on production promotion PRs
- Per-context required checks (feature PRs can `skip` missing optional checks)

### Setup

```bash
npx @komatikai/trailhead init --preset team
```

Adopt the same policy everywhere:

```bash
cp presets/team.yml .trailhead.yml
# tune required_checks to match each repo's CI job names
trailhead doctor --offline
```

See also [`examples/policy-pack/`](../examples/policy-pack/) for fleet rollout artifacts.

---

## AI-authored PRs

**Goal:** Catch bad agent output _before_ merge — secrets, syntax, destructive SQL, oversized scope.

### What you get

- **Submission gate** (Gate 1) — 15 blocking checks on PR diffs
- **Remediation** payloads in PR comments for agent loops
- Stricter risk thresholds (default 60/40)
- Optional Phase 0 advisory heuristics on suggestion markdown

### Setup

```bash
npx @komatikai/trailhead init --preset agent
```

Workflow includes `submission-gate: "true"`. Config includes `submission.enabled: true`.

External example (no Komatik internals): [`examples/agent-submission-fixture/`](../examples/agent-submission-fixture/).

MCP: `validate-submission` runs the same engine locally.

**Not included by default:** fleet-only checks (`soul_integrity`, stale naming) — those need `KOMATIK_INSTANCE=true`. See [advanced-fleet.md](./advanced-fleet.md).

Pin an explicit Action version in CI (e.g. `KomatikAI/trailhead@v4.5.2`), not only `@v4`. Audit fleet pins: `node scripts/check-fleet-trailhead-pins.mjs`.

---

## Docs-heavy / suggestion repos

**Goal:** Agent or human PRs that are mostly markdown, suggestions, and config — without risk false positives from `security` in doc paths or `test_coverage` on non-testable files.

### What you get

- **`risk.non_source_globs`** — excludes docs/suggestions from `sensitive_files` and `test_coverage`
- **`risk.size_factors.mode: metadata`** — optionally reports `file_count` and `code_churn` outside the blocking risk average while retaining them in evaluation metadata
- Same submission gate + remediation as agent-guard when enabled

### Setup

```bash
cp presets/agent-docs.yml .trailhead.yml
# or merge the risk: block into your existing config
```

**KomatikAI/agents dogfood:** Do not flip `submission.mode` to `block` until the B4 soak passes — see [agents-submission-soak.md](./agents-submission-soak.md).

---

## Ops / production safety

**Goal:** Freeze windows, health probes before scoring, DORA visibility.

### What you get

- **Freeze** — block merges Fri–Sat after 15:00 UTC (customizable)
- **Health check URLs** in workflow — production must respond before scoring
- **DORA-5** metrics on each evaluation
- **Canary** webhook hook for deploy outcome tracking

### Setup

```bash
npx @komatikai/trailhead init --preset ops
```

Provide health URLs when prompted (e.g. `https://app.example.com/health`).

Tune freeze in `.trailhead.yml`:

```yaml
freeze:
  - days: [friday]
    afterHour: 15
    message: "No Friday afternoon promotions"
```

---

## Presets reference

| File                                                    | Use when                                  |
| ------------------------------------------------------- | ----------------------------------------- |
| [`presets/solo.yml`](../presets/solo.yml)               | Default for most repos                    |
| [`presets/team.yml`](../presets/team.yml)               | Multi-repo standard, progressive branches |
| [`presets/agent-guard.yml`](../presets/agent-guard.yml) | AI/copilot/codex PRs                      |
| [`presets/ops.yml`](../presets/ops.yml)                 | SRE / release management                  |

Legacy alias: `presets/trailhead-strict-agents.yml` → use `agent-guard.yml` for new repos.

---

## Next steps

- [submission-gate.md](./submission-gate.md) — Gate 1 check codes and detector policy
- [evaluation-storage.md](./evaluation-storage.md) — trend store / Trailhead Cloud
- [advanced-fleet.md](./advanced-fleet.md) — agent trust, verdict contracts, fleet dogfood (optional)
- [migration-v3-to-v4.md](./migration-v3-to-v4.md) — upgrading from `@v3`
