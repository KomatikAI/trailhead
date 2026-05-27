# Trailhead v4.3 — Agent Autonomy Roadmap

> Status: **Active — Phase A in progress** (May 2026)
> Author: David (Cursor workspace)
> Inputs:
>
> - `komatik-agents/projects/trailhead/RESEARCH-AGENT-GATES.md` (Apr 2026 strategic research)
> - `komatik-agents/projects/trailhead/IMPLEMENTATION-PLAN.md` (12-week plan, Phase 0 live)
> - `docs/roadmap-agent-qa.md` (5-step QA roadmap, superseded for v4 by this doc on the autonomy axis)
> - `PRODUCT-CONTEXT.md` — Trailhead external product = "check your own agents' work"
> - 1,544 Komatik gate evaluations (Apr–May 2026), 63% `warn`, 11% `block`

---

## North Star

> **One person can supervise 30 — and eventually 30,000 — autonomous coding agents because Trailhead rejects, instructs, fixes, and merges agent work under policy. The human only touches the red lane.**

## Why now

- Komatik runs **30 agents 24/7**; David is the only merge gatekeeper. Queue grows linearly with fleet size.
- Komatik data: **63% of PRs land in `warn`** — "almost right, something's off, CI is green." That is exactly the agent failure mode.
- Industry: no shipping product closes the full loop (reject → instruct → fix → merge). Devin has auto-merge after human approval; nobody has policy-bound autonomous merge with a fix loop.
- Trailhead already has the pieces: provenance, trust profiles, agent_prs policy, sensitive paths, contexts, evaluation store, MCP tools. The work is **wiring them into a closed loop** and adding **autonomy + remediation + merge authority**.

## Non-negotiables (apply to every phase)

1. **Platform-agnostic shippable product.** Komatik specifics gated behind `KOMATIK_INSTANCE`. Anyone with their own agent fleet must be able to adopt v4.3.
2. **Fail-open for humans, fail-closed for agents.** Provenance-aware default: human PRs preserve today's behavior; agent PRs default to stricter mode.
3. **Backward compatible.** Existing `.trailhead.yml`, `.deployguard.yml`, and `@v4` consumers continue to work without changes.
4. **No silent autofix on sensitive paths.** Migrations, RLS, auth, secrets, workflow files, payments — never auto-edited, never auto-merged. Ever.
5. **Auditable.** Every autofix commit and every auto-merge writes an evaluation row with reason, tier, trust score, and policy chain.
6. **Self-test coverage.** Every new detector or autonomy rule exercised by the Trailhead Self-Test workflow with fixture PRs.
7. **`risk-engine.ts` stays pure.** New capabilities ship as engine functions; Action, App, and MCP consume via existing prebuild copy pattern.

---

## Three-tier autonomy model

The unit of policy is the **lane**, declared per repo and per provenance.

| Lane       | Examples                                                                      | Default behavior                                                       |
| ---------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Green**  | Docs, formatting, lint fixes, deps patch, generated artifacts                 | Allowlisted autofix + auto-merge when CI green + score < tier max      |
| **Yellow** | UI, API handlers, tests, internal libs                                        | Remediation loop (N rounds); auto-merge after loop succeeds + CI green |
| **Red**    | Migrations, RLS, auth, payments, secrets, `.github/workflows/**`, agent SOULs | Human-only; auto-fixer forbidden; agent PRs require explicit approval  |

**Lane assignment is computed from:**

- Files touched (path globs from `sensitivity` + `lanes.*.paths`)
- Risk score (lane max thresholds)
- Provenance (human can override into lower-friction lane; agent never can)
- Trust score (probation forces yellow → red, fast-track allows green → green even with mixed paths)

---

## Phases at a glance

| Phase | Theme                 | Duration    | Outcome                                                                                                                                                          |
| ----- | --------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | Coach + fleet rollout | 4–6 weeks   | Strict gate live in **all 21 repos** day one. Agents get structured fix instructions; their backlog starts moving via the remediation loop. Human PRs unchanged. |
| **B** | Fixer                 | 6–10 weeks  | Trailhead (and a fixer agent) commits allowlisted autofixes; trust scores adjust thresholds                                                                      |
| **C** | Autopilot             | 10–16 weeks | Auto-merge in green/yellow lanes; post-merge canary + auto-revert                                                                                                |
| **D** | Fleet                 | 16–24 weeks | Multi-tenant, per-agent DORA, governance dashboard, marketplace tier                                                                                             |

Phases are **gated by measured success criteria**, not calendar. Do not advance until exit metrics are met.

## Rollout strategy: strict-everywhere, tune-from-data

**Decision (May 26, 2026):** ship Phase A to **all 21 monitored repos simultaneously** with stricter-than-default thresholds for agent-provenance PRs. Human PR behavior unchanged.

**Rationale:**

- Live test data is the highest-leverage input right now. The gate is largely bypassed today; running it in `warn` mode in production for 30 days gives us nothing.
- David's workflow already bypasses Trailhead, so strict gates do not add friction to the human.
- Agents have 1,544+ historic evaluations showing 63% land in `warn` — the strict gate plus remediation loop converts that into a fix queue agents can actually drain.
- Starting strict and loosening from telemetry is safer than the reverse (loose → strict requires re-training agent behavior and David's review habits).

**Rollout targets (21 repos):**

- **Base Camp monitored (14):** Komatik, komatik-agents, komatik-base-camp, deployguard, daydream-studio, storyboard-studio, shieldcheck, reviewflow, mcp-brokerage, rescue-engineering, shadow-ai-governance, drift, komatik-yggdrasil, Bored
- **DORA-enabled satellites (7):** trace, pack, cairn, kindling, sundog, frontier, slipstream

**Strict default preset (`presets/trailhead-strict-agents.yml`, shipped in v4.3.0):**

```yaml
gate:
  mode: enforce
  agent_brief: "collapsed"
policies:
  agent_prs:
    enabled: true
    risk_threshold: 40 # vs 60 default
    strict_on_unknown_provenance: true
    require_code_owner_approval: true
  ci_integrity: { mode: block }
  workflow_security: { mode: block }
  prompt_injection: { mode: block }
  pr_scope: { mode: warn, max_files: 30, max_changes: 1500 }
  duplicate_logic: { mode: warn }
remediation:
  enabled: true
  max_loop_rounds: 5
```

**Telemetry-first additions (must land before fleet rollout):**

- `false_positive_rate` field on `trailhead_evaluations`, sourced from:
  - A 👎 reaction on the Trailhead PR comment, OR
  - A `trailhead-false-positive` label on the PR (with a required follow-up comment)
- Daily Cloud digest per repo: detector block/warn counts + 7-day FP rate
- **Auto-downgrade:** any detector whose 7-day FP rate crosses 15% across the fleet is automatically demoted from `block` → `warn` until manually re-enabled, and a tuning issue is auto-opened in `KomatikAI/trailhead`

**Escape valve:**

- Label `trailhead-override` on a PR forces `release_ready: true` for that evaluation
- Requires a same-PR comment matching `/^trailhead-override: (.+)/` (reason text)
- Override author, reason, expiration, and pre-override decision are written to `trailhead_evaluations.policyOverride` (column already exists)
- Override metrics surfaced in Cloud digest so we can see if a repo is leaning on the escape too hard

**Per-detector kill switch:**

- `policies.<detector>.mode: "off"` ships in v4.3.0 — turns the detector off entirely without uninstalling
- Used by auto-downgrade and as the manual cooldown for noisy detectors

---

# Phase A — Coach (v4.3.0)

**Goal:** Every blocked or warned PR ships with a machine-readable, agent-actionable remediation payload. The submitting agent retries inside its current session. You stop reviewing "almost right" PRs.

**Duration:** 4–6 weeks
**Owner:** David (Cursor workspace) + Trailhead self-test fixtures
**Repos touched:** `trailhead` (engine + Action + MCP + App), `komatik-agents` (coordinator wiring)

### Phase A progress (May 27, 2026)

| Epic                  | Trailhead repo | komatik-agents                                                   | Notes                                                                 |
| --------------------- | -------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| A1 Remediation schema | ✅ merged      | —                                                                | `src/remediation.ts`, Zod types                                       |
| A2 Agent brief        | ✅ merged      | —                                                                | Collapsed PR comment section                                          |
| A3 Coordinator bus    | ✅ merged      | ✅ merged ([#175](https://github.com/KomatikAI/agents/pull/175)) | Engine emits semantic webhooks; handler **not deployed on Spark yet** |
| A4 Loop bookkeeping   | 🔄 PR open     | —                                                                | Cloud columns + loop telemetry                                        |
| A5–A8                 | backlog        | —                                                                | Tuning digest, fleet rollout, override, fixtures                      |

**Deploy gap:** coordinator HTTP service needs `TRAILHEAD_COORDINATOR_WEBHOOK_SECRET`, port 3199 exposure, and `webhook-url` on fleet repos before E2E loop works. **`agent/*` routing** is forward-built — fleet cannot push those branches until the suggestions→PR bridge lands.

## Epics

### A1 — Remediation schema

Add a typed `remediation` block to `GateEvaluation` and the action output `evaluation-json`.

**Schema (Zod, in `src/types.ts`):**

```ts
export const RemediationFix = z.object({
  code: z.string(), // e.g. "risk.test_coverage"
  severity: z.enum(["blocking", "warn", "advisory"]),
  title: z.string(), // one-line summary
  detail: z.string(), // markdown, agent-readable
  files: z.array(z.string()).default([]), // exact paths to touch
  suggested_action: z.string().optional(), // e.g. "add test in src/__tests__/foo.test.ts"
  suggested_command: z.string().optional(), // e.g. "npm run lint -- --fix"
  autofix_eligible: z.boolean().default(false),
  autofix_class: z
    .enum([
      "format",
      "lint",
      "import-fix",
      "type-narrow",
      "test-scaffold",
      "doc-update",
      "dependency-bump",
    ])
    .optional(),
  policy_link: z.string().url().optional(), // doc explaining the rule
});

export const Remediation = z.object({
  release_ready: z.boolean(),
  fixes: z.array(RemediationFix),
  blocking_count: z.number().int().min(0),
  warn_count: z.number().int().min(0),
  autofix_eligible_count: z.number().int().min(0),
  loop_round: z.number().int().min(0).default(0),
  max_loop_rounds: z.number().int().min(0).default(3),
  next_action: z.enum([
    "ready_to_merge",
    "fix_and_retry",
    "human_review_required",
    "max_rounds_exceeded",
  ]),
});
```

**Deliverables:**

- `src/remediation.ts` — derive `Remediation` from `GateEvaluation`
- `Remediation` added to `GateEvaluation` Zod schema + `evaluation-json` output
- `cloud/openapi.yaml` updated
- Unit tests cover each `RemediationFix.code` mapping

**Acceptance:**

- 95% of existing block/warn reasons map to a `RemediationFix` with concrete `files` and `suggested_action`
- `evaluation-json` size growth < 30% on a 50-file PR
- Self-test fixture PR produces deterministic remediation payload

### A2 — Agent brief in PR comments

Add a collapsed `<details>` section to the Release Ready comment, titled **"Agent instructions"**, machine-parseable but human-readable.

**Format:**

````markdown
<details>
<summary>🤖 Agent instructions (3 blocking, 2 warn)</summary>

```json
{ "$schema": "trailhead.remediation.v1", "...": "..." }
```

**Blocking:**

1. **`ci.missing` — Lint check missing**
   - Fix: run `npm run lint && git add -A && git commit -m "fix: lint"`
2. **`risk.test_coverage` — `src/foo.ts` (added 40 lines, no test)**
   - Fix: create `src/__tests__/foo.test.ts` and exercise added exports
3. **`policy.import_resolution` — `src/bar.ts:12`**
   - Fix: import from `./shared/types`, not `../legacy/types` (deleted in v4.0)

**Warn (non-blocking):**

- `risk.sensitive_files` — `src/auth/middleware.ts` touched; ensure CODEOWNER signoff

**Loop:** round 0 of 3 · **Next action:** `fix_and_retry`

</details>
````

**Deliverables:**

- `formatAgentBrief()` in `src/gate.ts`
- Configurable via `gate.agent_brief: "off" | "collapsed" | "expanded"`
- Default `collapsed` when provenance is agent, `off` when human

**Acceptance:**

- Agent brief renders cleanly in PR comments
- JSON block is valid and matches `Remediation` schema
- Human-only PRs do not show the brief by default

### A3 — Coordinator event bus

Trailhead emits `trailhead.evaluation` events to `webhook-url` and to MCP subscribers. New event types:

- `trailhead.blocked` — gate decision was `block`
- `trailhead.warn_high_risk` — gate `warn` and risk ≥ context threshold − 10
- `trailhead.ready` — `release_ready: true`
- `trailhead.loop_exceeded` — `max_loop_rounds` hit

**Deliverables:**

- Event payload includes full `Remediation` block and PR URL
- `webhook-events` action input accepts new types
- MCP tool `subscribe-events` (long-poll or SSE for Phase A; full streaming later)

**komatik-agents side:**

- `scripts/trailhead-coordinator-http.mjs` on Base Camp Spark receives `trailhead.webhook.v1` POSTs at `/api/webhooks/trailhead` — **merged** ([#175](https://github.com/KomatikAI/agents/pull/175)); runbook: `komatik-agents/docs/runbooks/TRAILHEAD-COORDINATOR.md`
- Routes blocked/warn events on **`agent/<id>/*`** branches → `agent_messages` to submitting agent with remediation JSON (inert until Path-1 bridge)
- **`claude/*` and `cursor/*`** operator branches → logged only (`operator-skip`) — David's PRs do not spam coordinator
- Also logs to `events` table (BC6-compatible metadata); dedupes on `evaluationId`
- Submitting agent's next cron session picks up message, applies fixes, pushes, gate re-runs

**Acceptance:**

- End-to-end: agent opens PR → block → coordinator routes brief → agent fixes → gate green, **with no human touch**, on at least 1 fixture PR
- Loop telemetry recorded: `remediation_round`, `time_to_fix_seconds`

### A4 — Loop bookkeeping

Each gate run records:

- `remediation.loop_round` (incremented from previous evaluation for same PR)
- `remediation.previous_evaluation_id`
- `remediation.fixes_resolved` (codes from prior round no longer present)
- `remediation.fixes_introduced` (new codes appearing)

**Deliverables:**

- New columns on `trailhead_evaluations`: `loop_round`, `previous_evaluation_id`, `fixes_resolved JSONB`, `fixes_introduced JSONB`
- Migration with RLS preserved
- Engine computes loop state from previous evaluation by `(repo_id, pr_number, ORDER BY created_at DESC LIMIT 1)`

**Acceptance:**

- Loop history visible in evaluation store
- Cloud analytics adds `agent_loop_efficiency` chart (rounds-to-green by agent)

### A5 — Trust stub + Cloud tuning digest

Trust scoring proper waits for Phase B, but the strict-everywhere rollout needs visibility into "which agents are converging vs. flailing" from day one.

**Deliverables:**

- New column `agent_provenance_id` on `trailhead_evaluations` (denormalized from `pr.provenance.source` for fast group-by)
- Cloud analytics endpoint `GET /api/agents/{agent_id}/recent-evaluations` — rolling 30-day block/warn/allow counts, median rounds-to-ready, sensitive-path-violation count
- Daily tuning digest (Cloud cron) — per-repo and per-detector:
  - block/warn count, 7-day FP rate (from 👎 or `trailhead-false-positive` label), override rate
  - flagged: any detector with FP rate > 15% (triggers auto-downgrade per rollout strategy)
- Posted to Slack/webhook via `digest_webhook_url` in `.trailhead.yml`

**Acceptance:**

- Digest delivered daily without manual intervention
- Auto-downgrade verified end-to-end on a synthetic high-FP detector fixture
- Per-agent rolling stats query returns < 500ms p95 over Komatik's evaluation volume

### A6 — Fleet rollout (21 repos)

**Deliverables:**

- `scripts/batch-v4.3-rollout-prs.mjs` — modeled on `scripts/batch-dora-permissions-prs.mjs`. Per repo:
  - Bump `@v4` consumers to `@v4.3` in `.github/workflows/trailhead.yml`
  - Add `presets: ["@trailhead/strict-agents"]` line to `.trailhead.yml` (creates the file if missing)
  - Open a PR with standardized title `chore(trailhead): adopt v4.3 strict-agent gate + remediation loop`
  - PR body explains the change, links to `docs/roadmap-v4.3-agent-autonomy.md`, includes rollback instructions
- Each PR auto-labeled `trailhead-v4.3-rollout`
- Script runs in dry-run mode by default; `--apply` flag actually opens PRs
- Post-rollout dashboard: which repos have merged, which are pending, FP rate per repo first 7 days

**Acceptance:**

- All 21 PRs opened within a single script invocation
- Dry-run output reviewable before any PR is created
- 100% of merged adopters report a successful gate evaluation within 24 hours of merge

### A7 — Override mechanism

**Deliverables:**

- `trailhead-override` label triggers override mode
- Comment regex `/^trailhead-override:\s*(.+)/` extracts reason; absence of reason auto-rejects the override and re-blocks
- Override metadata written to `trailhead_evaluations.policyOverride` (existing column)
- Webhook event `trailhead.override_applied` emitted with author, reason, PR URL, pre-override decision
- Per-repo override cap (default 5/week); exceeding cap requires an issue in `KomatikAI/trailhead` linking the override pattern
- Cloud digest surfaces top-10 override authors and reason clusters

**Acceptance:**

- End-to-end: blocked PR → label applied → comment with reason → gate re-evaluates `release_ready: true` with audit trail
- Override without reason comment is rejected with helpful PR comment explaining the requirement

### A8 — Self-test fleet fixtures

Add fixtures to the Trailhead Self-Test that simulate agent failures:

- Phantom file PR (`artifact_integrity` blocker)
- Missing test PR (`test_coverage` warn → block at probation tier)
- Stale naming PR (`context_freshness` warn)
- Mock placeholder leak (`mock_placeholder` block)
- Multi-fix PR (3 blocking, 2 warn)

Each fixture has a `remediation.expected.json` golden file.

**Acceptance:**

- All fixtures green on `main`
- Coverage thresholds raised: statements 65, branches 55, functions 65, lines 65 (was 60/50/60/60)

## Phase A exit criteria

- [x] `Remediation` block in every gate run, schema-validated (A1 merged)
- [x] Agent brief in PR comments (collapsed by default for agent provenance) (A2 merged)
- [ ] Coordinator event routing demonstrated end-to-end on Komatik (handler merged; **deploy + 1 agent-driven loop** pending)
- [ ] **Fleet rollout:** strict-agent preset adopted by all 21 monitored repos
- [ ] **Telemetry:** daily Cloud tuning digest live, auto-downgrade verified on synthetic fixture
- [ ] **Override:** `trailhead-override` label flow live with audit trail
- [ ] **Measured (after 30 days fleet-wide):** median agent-loop-rounds-to-ready ≤ 2 across 100+ PRs
- [ ] **Measured:** fleet-wide detector FP rate ≤ 10% after auto-downgrade tuning
- [ ] **Measured:** override usage ≤ 5/repo/week steady-state (escape valve, not crutch)
- [ ] No human-PR behavior regression (verified by self-test + manual smoke)
- [ ] Released as **v4.3.0**

---

# Phase B — Fixer (v4.4.0)

**Goal:** Trailhead (or a separately deployed fixer agent) commits allowlisted autofixes back to the PR. Trust score promotes consistent agents into looser thresholds; demotes agents into probation. Gate 1 (agent submission quality) engine extracted from `komatik-agents` into the Trailhead product repo so external users get it.

**Duration:** 6–10 weeks (after Phase A exit criteria met)
**Repos touched:** `trailhead` (engine + new fixer module), `komatik-agents` (Gate 1 engine retired, replaced by Trailhead Action `submission-gate: true`)

## Epics

### B1 — Gate 1 engine extraction

Move agent-submission checks from `komatik-agents/scripts/lib/agent-gate-checks.js` into `src/submission-engine.ts` (pure, no Komatik deps).

**Checks ported:**

- `path_format`, `artifact_integrity`, `syntax_validity` (SWC)
- `secrets`, `destructive_sql`, `import_resolution`
- `rls_new_tables`, `auth_route_auth`, `mock_placeholder`, `hardcoded_env`
- `external_package_deps`, `sql_syntax_basic`, `large_file`
- 14 Phase-0 stubs **with real logic** (output_size_min, action_extraction_present, referenced_files_exist, etc.)

**New Action input:** `submission-gate: "true"` enables Gate 1 alongside the existing deploy gate. Default off (backward compat).

**Komatik-specific overrides** (SOUL integrity, agent identity vs project) gated behind `KOMATIK_INSTANCE=true` env var.

**Acceptance:**

- All `komatik-agents/scripts/lib/agent-gate-checks.test.js` tests pass against new engine
- Komatik's CI workflow uses `submission-gate: true` instead of in-repo script
- External-product fixture (`examples/agent-submission-fixture/`) demonstrates Gate 1 on a non-Komatik repo

### B2 — Autofix allowlist + fixer module

Trailhead can commit a fix back to the PR for narrowly-defined classes.

**Allowlisted classes (`autofix_class`):**
| Class | What it does | Forbidden if |
|-------|--------------|--------------|
| `format` | `prettier --write` on PR-touched files | binary or generated file |
| `lint` | `eslint --fix` for safe rules only (configurable allowlist) | rule not in safe set |
| `import-fix` | Rewrite import paths from stale → current (uses BRAND.md rename map) | path crosses module boundary not declared in `services` |
| `test-scaffold` | Create empty test file matching the new source file's exports | source file in red-lane paths |
| `doc-update` | Apply BRAND.md rename matrix to `.md` files | file is `LICENSE`, `CHANGELOG.md`, or has `historical:` marker |
| `dependency-bump` | Patch-version-only `package.json` bumps suggested by `dependabot` | major or minor bump |

**Hard forbidden everywhere:** migrations, RLS, `auth/`, `.github/workflows/**`, agent SOULs, `secrets`, payments, `risk-engine.ts`.

**Deliverables:**

- New `app/src/fixer.ts` (runs in App context; needs `contents: write`)
- Or: separate `@komatikai/trailhead-fixer` agent (Codex/Claude wrapper) — TBD by spike
- Fixer commits with `[trailhead-fixer]` author + signed-off-by trailer
- Max 1 fix commit per gate round; if fix introduces new findings, abort and emit `trailhead.fixer_regressed`

**Acceptance:**

- 90% of `format`/`lint`/`doc-update` fixtures auto-fix without regression
- Zero autofix commits land on red-lane files (enforced by test)
- Audit trail: every fix commit references the evaluation ID that triggered it

### B3 — Dynamic trust scoring

Per-agent trust score derived from rolling 30-day outcomes:

```text
trust = w1 * release_ready_rate
      + w2 * (1 - revert_rate)
      + w3 * (1 - human_review_required_rate)
      + w4 * avg_remediation_efficiency
      - w5 * policy_violation_rate
      - w6 * sensitive_path_violation_rate
```

**Profiles:**

- `fast-track` (trust ≥ 0.85): lane max thresholds +10, autofix loop rounds +1
- `standard` (0.6–0.85): default thresholds
- `probation` (< 0.6): yellow lane forced to red, autofix disabled, human review required

**Deliverables:**

- New table `agent_trust_scores` (agent_id, repo_id, score, profile, window_start, window_end)
- Nightly compute job (Action or scheduled workflow in Trailhead Cloud)
- `evaluateGate` reads trust profile and adjusts thresholds in-flight
- `evaluation_json.trust_profile` already exists; extend with `score` and `factors`

**Acceptance:**

- Trust scores correlate ≥ 0.7 with David's manual judgment on a labeled set of 100 PRs
- Probation agents observed to graduate or be retired within 14 days
- Self-test fixture for trust-driven threshold adjustment

### B4 — Enforce mode for Gate 1 (Komatik dogfood)

Flip `.trailhead/agents.yaml` from `mode: warn` to `mode: enforce` for agent-provenance PRs on `komatik-agents` once Gate 1 false-positive rate < 10% across 30 PRs.

**Acceptance:**

- Gate 1 enforce on `komatik-agents` for 7 consecutive days with zero false-positive blocks reported

## Phase B exit criteria

- [ ] Gate 1 engine shipped in Trailhead product (`submission-gate: true` input)
- [ ] Komatik's in-repo gate retired in favor of Trailhead Action
- [ ] Fixer module commits at least 50 fixes on Komatik PRs with zero red-lane violations
- [ ] Trust scoring live; probation/fast-track in active use
- [ ] **Measured:** ≥ 60% of agent PRs reach `release_ready: true` without human intervention
- [ ] **Measured:** time-from-block-to-ready p50 ≤ 15 minutes (was: days, waiting for David)
- [ ] Released as **v4.4.0**

---

# Phase C — Autopilot (v4.5.0)

**Goal:** Auto-merge in green and yellow lanes when policy is satisfied. Post-merge canary + auto-revert closes the loop. Human only touches red.

**Duration:** 10–16 weeks (after Phase B exit metrics met; this is the high-trust phase)

## Epics

### C1 — Autonomy tier schema

Add `autonomy` block to `.trailhead.yml`:

```yaml
autonomy:
  enabled: true
  default_provenance_tier:
    human: yellow # humans can land any lane; tier just controls auto-merge eligibility
    agent: yellow # agents default to yellow; promoted to green via path + trust
    unknown: red # unknown provenance = strictest
  lanes:
    green:
      paths:
        - "docs/**"
        - "**/*.md"
        - "package-lock.json"
      max_risk: 25
      auto_merge: true
      required_checks: ["Lint", "Build"]
    yellow:
      paths: ["src/**", "tests/**", "app/**", "cli/**", "mcp/**"]
      max_risk: 55
      auto_merge: true # only after remediation loop succeeds
      required_checks: ["Lint", "Build", "Test"]
      max_loop_rounds: 3
    red:
      paths:
        - "**/migrations/**"
        - "**/rls/**"
        - "src/auth/**"
        - ".github/workflows/**"
        - "**/secrets/**"
        - "agents/*/SOUL.md"
        - "src/risk-engine.ts"
      auto_merge: false
      required_approvers: ["@david"]
      forbid_autofix: true
  promotion:
    fast_track_tier_uplift: true # fast-track trust → green even on yellow paths
    probation_tier_downlift: true # probation → red even on green paths
  post_merge:
    canary_required_for: ["yellow"]
    auto_revert_on_canary_fail: true
    revert_via: "pr" # never force-push; opens a revert PR
```

**Deliverables:**

- Zod schema in `src/types.ts`
- `resolveAutonomyTier()` pure function in `risk-engine.ts`
- Migration: existing repos default to `autonomy.enabled: false` (no behavior change)

### C2 — Merge authority

Trailhead App gains optional `contents: write` + `pull_requests: write` for participating repos.

**Merge guard:**

1. `release_ready: true`
2. Lane permits `auto_merge`
3. All `required_checks` for the lane passing
4. Trust profile not `probation`
5. No active freeze window
6. No `human-review-required` label
7. Concurrency limit not exceeded (per-repo and per-agent)

**Deliverables:**

- `app/src/auto-merger.ts`
- Audit row written for every auto-merge with the full policy chain
- Opt-in only: requires repo-level App install + `.trailhead.yml` `autonomy.enabled: true`
- `--dry-run` mode in App for the first 14 days per repo

### C3 — Post-merge canary + auto-revert

- After auto-merge, App watches deploy outcome (existing canary webhook + `deploy_outcome`)
- On failure, opens a **revert PR** (never force-push); labels it `trailhead-autorevert`, links to original
- Routes a `trailhead.autorevert` event to the submitting agent with the failure detail

**Deliverables:**

- Extend `src/canary.ts` with `openRevertPr()`
- Self-test fixture: simulated canary failure produces revert PR within 5 minutes
- Demote agent to `probation` after 2 autoreverts in 7 days

### C4 — Concurrency + rate limits

Per-repo and per-agent caps:

```yaml
autonomy:
  rate_limits:
    max_open_agent_prs_per_repo: 10
    max_open_agent_prs_per_agent: 3
    min_seconds_between_auto_merges: 60
    daily_auto_merge_cap_per_lane:
      green: 200
      yellow: 50
```

When caps hit, gate decision becomes `warn` with `next_action: human_review_required` and event `trailhead.rate_limit_reached`.

## Phase C exit criteria

- [ ] Auto-merge live on at least one production repo (likely `komatik` or one satellite) for 30 consecutive days
- [ ] Zero auto-merges into red lane (enforced)
- [ ] **Measured:** ≥ 80% of agent PRs flow agent → Trailhead → merge without David
- [ ] **Measured:** post-merge autorevert rate < 2% of auto-merged PRs
- [ ] **Measured:** David reviews < 20% of agent PRs (vs ~100% today)
- [ ] Public docs `docs/autonomy-tiers.md` for external users
- [ ] Released as **v4.5.0**

---

# Phase D — Fleet (v4.6.0+)

**Goal:** Productize the autopilot for external customers. Per-agent DORA. Multi-tenant. Governance dashboard. Marketplace tier.

**Duration:** 16–24 weeks (continuous after Phase C)

## Epics (sketch — to be expanded after Phase C)

- **D1 — Per-agent DORA dashboard** in Trailhead Cloud (deploy frequency, lead time, CFR, FDRT, rework rate, trust trajectory per agent)
- **D2 — Multi-tenant isolation** in Trailhead Cloud (per-org agent rosters, scoped trust scores, RBAC on autonomy config)
- **D3 — Governance UI** (override audit, escalation routing, weekly digest of auto-merges + reverts)
- **D4 — Marketplace billing tier "Trailhead Autopilot"** — usage-priced on auto-merges and autofixes (separate from existing v4.1 Cloud tier)
- **D5 — Customer onboarding wizard** (`trailhead init --autonomy`) — interactive tier setup, sensitive path detection, trust seed

---

## Cross-cutting workstreams

### Documentation (every phase ships its own)

- `docs/autonomy-tiers.md` (Phase C)
- `docs/remediation-schema.md` (Phase A)
- `docs/fixer-allowlist.md` (Phase B)
- `docs/trust-scoring.md` (Phase B)
- `docs/migration-v4.2-to-v4.3.md` (Phase A)
- Update `README.md` and `docs/README.md` per phase
- Update `mcp/README.md` for new MCP tools
- Update `.agents/skills/trailhead/SKILL.md` per phase

### Self-test coverage

Every new detector, autonomy lane, fixer class, and trust profile **must** have a fixture in `.github/workflows/self-test.yml`. CI fails on detector without fixture.

### Performance budget

- p95 evaluation latency < 30s with all Phase A–C detectors active
- Fixer commit latency < 60s end-to-end
- Auto-merge decision latency < 5s after CI green

### MCP parity

Every new gate capability ships as an MCP tool in the same release:

- Phase A: `get-remediation`, `subscribe-events`
- Phase B: `validate-submission`, `apply-autofix`, `get-trust-score`
- Phase C: `resolve-autonomy-tier`, `eligible-for-automerge`, `propose-revert`

### Backward compatibility

- `.deployguard.yml` keeps working
- `evaluation-json` adds new fields; never removes or renames
- All new policies default to off
- Existing `policies.agent_prs` block continues to work; `autonomy` is additive

---

## Dependency graph

```text
Phase A (Coach)
   │
   ├── A1 Remediation schema ──┐
   │                            ├── A2 Agent brief
   │                            └── A3 Coordinator events ──── A4 Loop bookkeeping
   │                                                                 │
   │                                                                 └── A5 Self-test fixtures
   │
   ▼
Phase B (Fixer)
   │
   ├── B1 Gate 1 engine extraction ── B4 Komatik enforce mode
   ├── B2 Autofix allowlist + fixer module
   └── B3 Trust scoring
   │
   ▼
Phase C (Autopilot)
   │
   ├── C1 Autonomy tier schema
   ├── C2 Merge authority   (requires B2 + B3 mature)
   ├── C3 Canary + auto-revert
   └── C4 Concurrency + rate limits
   │
   ▼
Phase D (Fleet)
```

---

## Risks and mitigations

| Risk                                                        | Mitigation                                                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Fixer commits a "fix" that breaks something                 | 1 fix commit/round max; abort on new findings; allowlisted classes only; red-lane forbidden                            |
| Auto-merge ships broken code into staging                   | Canary required for yellow; auto-revert via PR (never force-push); probation kicks in after 2 autoreverts              |
| Trust score gameable by agent producing trivial PRs         | Score weights revert rate and human-review-required heavily; sensitive-path violations zero out fast-track eligibility |
| Komatik-specific code leaks into shippable product          | `KOMATIK_INSTANCE` env gate; PR review checklist; CI test verifies no Komatik project IDs in `src/` or `mcp/src/`      |
| Remediation JSON drifts from human reasons                  | Schema test enforces every PR comment reason maps to a `RemediationFix.code`                                           |
| Coordinator becomes single point of failure                 | Events table is the source of truth (BC6 webhooks); coordinator is a poller, replaceable                               |
| External users don't have an MCP coordinator                | Webhook delivery is primary; MCP is convenience for fleet operators                                                    |
| Fail-closed-for-agents blocks too aggressively at launch    | Default `autonomy.enabled: false`; opt-in per repo; first 14 days `--dry-run`                                          |
| Trust scoring needs months of data before useful            | Seed with provenance-only profile; trust factors blend in gradually as data accumulates                                |
| You can't review the volume of auto-merges to validate them | Weekly digest in Trailhead Cloud; canary + auto-revert is the safety net, not your eyes                                |

---

## Success metrics (north-star, per phase)

| Metric                                             | Today            | After Phase A | After Phase B | After Phase C                |
| -------------------------------------------------- | ---------------- | ------------- | ------------- | ---------------------------- |
| % agent PRs you review                             | ~100%            | ≤ 40%         | ≤ 30%         | ≤ 20%                        |
| Median rounds-to-green per agent PR                | n/a (you fix it) | ≤ 2           | ≤ 1           | ≤ 1                          |
| % agent PRs reaching `release_ready` with no human | ~0%              | 30%           | 60%           | 80%                          |
| % agent PRs auto-merged                            | 0%               | 0%            | 0%            | 50%+ (green+yellow combined) |
| Time-from-block-to-ready (p50)                     | days             | hours         | < 15 min      | < 5 min                      |
| Autorevert rate on auto-merges                     | n/a              | n/a           | n/a           | < 2%                         |
| Red-lane violations by fixer/auto-merger           | n/a              | n/a           | 0             | 0                            |
| Fleet capacity (agents one human can supervise)    | 30 (saturated)   | ~80           | ~200          | ~500+                        |

---

## What I need from you

1. **Approve or amend the three-tier lane model** (green/yellow/red). Especially the red-lane file globs — those are absolute.
2. **Approve the autofix allowlist for Phase B.** Specifically: am I right that test-scaffold and import-fix are safe? Should `dependency-bump` go in or wait until D?
3. **Confirm trust score weights are roughly right** (rework, revert, sensitive-path violation as the big three).
4. **Pick the first Phase C pilot repo.** I would suggest a satellite (e.g. `kindling` or `sundog`) before Komatik, because blast radius is smaller.
5. **Decide:** is the fixer a Trailhead module (App with `contents: write`) or a separate `@komatikai/trailhead-fixer` agent that consumes Trailhead remediation? Spike both in Phase B, pick before C1.
6. **Sign off on the "no auto-merge until Phase C" rule** — Phase A and B are pure coach + fixer; the merge button stays human.

Once you approve, I can:

- Open the **v4.3 epic** in `KomatikAI/trailhead` with sub-issues per Phase A epic (A1–A5)
- Draft the `Remediation` Zod schema PR as the first concrete deliverable
- Update `docs/roadmap-v4.md` to reference this doc as the autonomy axis

---

## Appendix — files this plan will touch

**New:**

- `src/remediation.ts`
- `src/submission-engine.ts` (Phase B)
- `src/autonomy.ts` (Phase C)
- `app/src/fixer.ts` (Phase B)
- `app/src/auto-merger.ts` (Phase C)
- `docs/autonomy-tiers.md`, `docs/remediation-schema.md`, `docs/fixer-allowlist.md`, `docs/trust-scoring.md`
- `examples/agent-submission-fixture/` (Phase B)
- Self-test fixtures in `.github/workflows/self-test.yml`

**Modified:**

- `src/types.ts` — `Remediation`, `AutonomyConfig`, trust fields
- `src/gate.ts` — emit remediation, agent brief, lane resolution
- `src/notify.ts` — event types, store fields
- `src/canary.ts` — `openRevertPr()` (Phase C)
- `mcp/src/server.ts` — new MCP tools per phase
- `action.yml` — `submission-gate`, `autonomy-mode`, `agent-brief` inputs
- `cloud/openapi.yaml` — new event shapes + analytics endpoints
- `README.md`, `docs/README.md`, `.agents/skills/trailhead/SKILL.md`

**Migrations:**

- `trailhead_evaluations` — loop columns (Phase A)
- `agent_trust_scores` (Phase B)
- `autonomy_audit` (Phase C)

**Out of scope (for v4.3–v4.5):**

- Replacing CI providers
- Hosting Cursor/Claude/Codex agents (Trailhead consumes their outputs)
- Authoring agent SOULs or prompts (Komatik responsibility)
- Replacing GitHub merge UI (Trailhead is the policy, GitHub is the substrate)
