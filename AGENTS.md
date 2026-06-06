# Komatik Fleet — Cursor Workspace Protocol

> **Canonical fleet docs:** [KomatikAI/agents](https://github.com/KomatikAI/agents) — README, `AGENTS.md`, `docs/EXTERNAL-WORKSPACE-GUIDE.md`
>
> **Base Camp is retired.** Coordination uses the **Komatik MCP** bridge (`user-komatik-readonly` in Cursor) to the Spark fleet PostgreSQL + agent messaging layer.

---

## What Is the Komatik Fleet?

**21 specialized AI agents** run **24/7** on dual NVIDIA DGX Sparks (OpenClaw), monitoring **20 repositories**, opening PRs, running security scans, and coordinating through an RBAC MCP server (54+ tools). The harness lives in the **`agents`** repo (on-disk `komatik-agents`); the **Frontier** dashboard is the operational UI (repo slug `frontier`, formerly `komatik-base-camp`).

**You are the last line of defense.** Agent-authored code flows into integration branches continuously. Human-supervised review in Cursor/Claude Code is the quality gate before `staging` / `main`.

### Code flow

```
┌──────────────────────────────────────────────┐
│  Komatik Fleet (Spark, 24/7)                 │
│  21 agents → branches → PRs → dev            │
│  GitHub webhooks → events table              │
└────────────────────┬─────────────────────────┘
                     ▼
┌──────────────────────────────────────────────┐
│  YOUR Workspace (Human-Supervised)           │
│  Review → Approve/Fix → staging → main       │
└──────────────────────────────────────────────┘
```

Agents propose via `agents/<id>/suggestions/`; humans/Cursor apply, test, PR, and merge. Agents do not push to GitHub directly.

---

## Session Start (every conversation)

```bash
git fetch origin --prune
git log --oneline HEAD..origin/dev | wc -l   # behind dev?

gh pr list --state open --json number,title,headRefName \
  --jq '.[] | select(.headRefName | test("^(claude/|agent/)")) | "#\(.number) \(.title)"'
```

**Komatik MCP (when connected):**

```
query_events(limit: 10)
get_messages(agent_id: "cursor-workspace")
```

- Behind `dev` → `git pull origin dev` before new work
- Open agent PRs → review with security checklist; do not duplicate work
- Many recent merges → run `npm run build && npm test` after pull

---

## Before Starting a Task

Search for existing agent work:

```bash
gh pr list --state all --limit 50 --json number,title,headRefName,state \
  --jq '.[] | select(.title | test("KEYWORD"; "i")) | "\(.state) #\(.number) \(.headRefName)"'
git branch -r | grep -i "KEYWORD"
```

---

## Agent PR Review (blocking checklist)

1. No destructive SQL (`DROP`, `TRUNCATE`, `DELETE` without `WHERE`)
2. RLS enabled + policies on new tables
3. Auth on new API routes / Edge Functions
4. No secrets in code
5. Prompt sanitization on new LLM calls
6. CI green; no conflict with your local changes

Full checklist: `KomatikAI/agents` → `docs/EXTERNAL-WORKSPACE-GUIDE.md`

---

## Work Completed (Komatik MCP)

After merging significant work:

```
send_message(to_agent: "coordinator", subject: "Work completed: …", body: "…")
log_decision(title, reasoning, outcome, confidence)
update_task_status(task_id, column: "done")   # if applicable
```

---

## Branch Patterns

| Pattern | Origin |
| --- | --- |
| `agent/<agent-id>/<desc>` | OpenClaw scheduled agent |
| `claude/<two-word-slug>` | Claude Code on Spark |
| `cursor/<desc>-<hex>` | Cursor on Spark |
| `cursor/<desc>` | **Probably your local workspace** |

Confirm: `git log origin/<branch> -1 --format='%an <%ae>'`

---

## Monitored Repos (20) — current slugs

Core: **komatik**, **agents**, **frontier** · Products: **pack**, **trailhead**, **trace**, **slipstream** · POCs: **lodge**, **sundog**, **kindling** · Research: **vector**, **cairn** · Other: **koda**, **experiments**, **.github**

Retired slugs redirect: `deployguard`→`trailhead`, `komatik-base-camp`→`frontier`, `shieldcheck`+`reviewflow`+…→`trace`, etc. See `KomatikAI/agents` `AGENTS.md`.

---

## Project-Specific


<!-- These sections are preserved across HQ re-distributions -->

### What this project is

Trailhead is the canonical name for the deployment gate formerly known as DeployGuard. It is a GitHub Action (released **v4.5.2** on `main`; floating tag **`@v4`** tracks latest major) that scores pull request risk, waits for required CI, publishes a composite **Release Ready** check, checks production health, integrates **security signals** (Code Scanning / SARIF), computes **DORA-5** metrics, tracks deployment outcomes via **canary hooks**, exports **OpenTelemetry** spans, and blocks dangerous releases. It also ships a **`trailhead init`** / **`trailhead doctor`** CLI, an optional **GitHub App** (`app/`) for deployment protection rules, a standalone **MCP server** (`mcp/`, package **`@trailhead/mcp-server`**) with **26 tools** for AI agents, and **Trailhead Cloud** (`cloud/`) for hosted evaluation storage, analytics, feedback, and org billing tiers.

Phase B (v4.4.x) adds **Gate 1 submission checks** (`submission-gate: true`), **Phase 0 advisory suggestion heuristics**, **autofix planning** (`fixer-core`), **dynamic trust scoring**, and optional **Komatik credit metering** for `deploy_check`. Phase C (v4.5.x) adds **warehouse analytics**, **content-type risk calibration**, and **fleet pin audit** tooling.

### Current repo state (Jun 6, 2026)

- **Branch model**: **`dev`** is the default integration branch — open all feature PRs against `dev`. Promote: `dev` → `staging` → `main` via promote PRs (use `--merge --admin` when branch policies block FF-only). Do **not** merge features directly to `main`.
- **Released tag**: **v4.5.2** on `main`. **`@v4`** advanced on tag push. npm `@komatikai/trailhead@4.5.2`.
- **Fleet pins**: komatik + agents + 7 satellites pinned **`@v4.5.2`** explicitly. Audit: `node scripts/check-fleet-trailhead-pins.mjs`. Rollout: `TRAILHEAD_ROLLOUT_VERSION=4.5.x node scripts/batch-v4.5.1-rollout-prs.mjs --apply`.
- **Warehouse audit (v4.5.1, [#280](https://github.com/KomatikAI/trailhead/pull/280)):** PR-scoped security alerts, provenance fix, store-row analytics fields, deploy-correlation guard. Komatik store migration [#2248](https://github.com/KomatikAI/komatik/pull/2248) on prod.
- **Risk calibration (v4.5.2, [#284](https://github.com/KomatikAI/trailhead/pull/284)):** `risk.non_source_globs` in `.trailhead.yml`; `presets/agent-docs.yml` for docs/suggestion repos.
- **B4 agents soak:** Pre–Jun 6 evals invalid for flip decision. See `docs/agents-submission-soak.md`. Measure with `scripts/query-agents-submission-soak.mjs`. **Do not** flip `submission.mode` to `block` until submission_checks FP < 10% over 30 distinct PRs on post-v4.5.2 data.
- **Agent trust dogfood:** Collectors read **penalty** from `agent_gate_decision` **events** — not warehouse `release_ready`. See `docs/agent-trust-metrics.md`.
- **Komatik hosted store:** Analytics columns live (`gate_mode`, `submission_checks`, `verdict`, …). See `docs/komatik-hosted-store.md`.
- **Tests:** 722+ root + 21 cloud on `dev`.
- **Legacy compatibility**: `.deployguard.yml` configs and `DEPLOYGUARD_*` env vars still accepted where already shipped.
- **Coordinator:** Spark port 3199 — `agents/docs/runbooks/TRAILHEAD-COORDINATOR.md` ([#175](https://github.com/KomatikAI/agents/pull/175) merged).

**Promotion (fast-forward only):**

```bash
git fetch origin
git checkout staging && git merge --ff-only origin/dev && git push origin staging
git checkout main && git merge --ff-only origin/staging && git push origin main
```

Tag releases on `main` after promotion (`git tag v4.x.y && git push origin v4.x.y`).

### Hard rules (do not regress)

1. **Fail-open default** — if Trailhead errors in normal operation, deployments proceed with a warning (unless `fail-mode: closed`). Store/webhook/OTel failures are non-blocking with visible warnings.
2. **Minimal GitHub permissions** — read PRs, read code, write checks/comments/labels as documented. No write access to repository code from the gate itself.
3. **No source code storage** — risk scoring analyzes diffs in-memory. Persisted evaluation payloads contain scores/metadata only.
4. **Test healer proposes, developer approves** — self-healing changes are suggestions (e.g. PR comments), never force-pushed.
5. **Shared risk engine** — `src/risk-engine.ts` is the canonical scoring implementation; MCP and app MUST use prebuild copies, not independent implementations. If `risk-engine.ts` imports a new local module, update both `app` and `mcp` prebuild flows and committed runtime artifacts.
6. **Merge-base drift protection** — `fetchPrFiles` cross-checks GitHub's `pulls.listFiles` against commit-level files when >30 files reported; falls back to commit-derived list when API count exceeds 2x actual. Applied to Action, App, and MCP server.
7. **No direct prod deploy via MCP** — never `apply_migration` or DDL against Komatik prod Supabase from Cursor MCP. Schema and store routes ship via **Komatik PR → merge → deploy** only. MCP is read-only for verification (`list_migrations`, SELECT). See `docs/komatik-hosted-store.md` and Komatik `docs/runbooks/TRAILHEAD-EVALUATION-STORE.md`.

### Dependencies

| Package           | Version | Notes                                         |
| ----------------- | ------- | --------------------------------------------- |
| `@actions/core`   | 2.0.3   | Action toolkit (getInput, setOutput, summary) |
| `@actions/github` | 9.1.0   | Octokit + context (ESM-only since v9)         |
| `zod`             | 3.24+   | Schema validation for types and config        |
| `undici`          | 6.24.1  | Transitive via @actions/\*; all CVEs resolved |

### Build toolchain

- **Bundler**: `@vercel/ncc` → single CJS file at `dist/index.js`.
- **TypeScript**: `moduleResolution: "Bundler"`, `module: "ESNext"` — required because `@actions/github@9` ships ESM-only exports.
- **Linting**: ESLint + typescript-eslint + Prettier (CI enforces `format:check` before lint).
- **Testing**: Vitest (722 root tests + 21 cloud tests).

### CI pipeline

`.github/workflows/ci.yml` runs on every push to `dev`, `staging`, or `main`, and on every PR targeting **`dev`**:

1. `npm run format:check` — Prettier
2. `npm run lint` — ESLint + `tsc --noEmit`
3. `tsc --noEmit` for `cli/`, `app/`, `mcp/`, `cloud/` (each with prebuild where needed)
4. `npm run build:cli` + `node cli/dist/index.js doctor --offline`
5. `npx vitest run --coverage` — Vitest with coverage thresholds enforced (60/50/60/60)
6. `npm run build` — ncc bundle (ubuntu; no cross-host `dist/` git-diff check)

**Note**: Feature work targets **`dev`**. Run build + tests after promoting `dev` → `staging` → `main`.

### Conventions

- GitHub Action contract: **`action.yml`** ↔ **`src/main.ts`** (inputs/outputs must stay in sync).
- Action runtime bundle: **`src/`** → **`dist/index.js`** via `@vercel/ncc` (`npm run build`).
- **`src/risk-engine.ts`** — pure module with no `@actions/*` deps, shared via prebuild copy to `mcp/src/` and `app/src/`.
- **`mcp/src/adapters/*`** and **`mcp/dist/adapters/*`** — generated/prebuild copies that are intentionally committed so `mcp/dist/server.js` resolves runtime imports without a local build step.
- **`app/`** and **`mcp/`** are separate TypeScript projects; match their local patterns when editing.
- **`cli/`** — ncc bundle via `npm run build:cli`; typecheck with `cd cli && npm run typecheck`. Published `@komatikai/trailhead` ships prebuilt `dist/` only.
- Always run `npm run format` before committing — CI will reject unformatted code.
- **`.trailhead.yml`** — canonical repo policy. `.deployguard.yml` is still accepted as a legacy fallback for consumers.

### Risk factors (10 types)

| Factor               | Weight | Source            |
| -------------------- | ------ | ----------------- |
| `security_alerts`    | 4      | Code Scanning API |
| `code_churn`         | 3      | PR file diff      |
| `sensitive_files`    | 3      | PR file patterns (excludes markdown/config; see `risk.non_source_globs`) |
| `file_count`         | 2      | PR file count     |
| `test_coverage`      | 2      | Testable source files only (skipped for docs-only changesets) |
| `dependency_changes` | 2      | PR file names     |
| `deployment_history` | 2      | Supabase/API      |
| `canary_status`      | 2      | Deploy webhooks   |
| `author_history`     | 1      | GitHub API        |
| `pr_age`             | 1      | GitHub API        |

### Quick file map

| Path                 | Purpose                                             |
| -------------------- | --------------------------------------------------- |
| `action.yml`         | Action inputs/outputs definition                    |
| `src/risk-engine.ts` | **Shared** pure risk scoring (no @actions deps)     |
| `src/gate.ts`        | Gate evaluation, health checks, GitHub interactions |
| `src/security.ts`    | Code Scanning API + security risk factor            |
| `src/canary.ts`      | Deploy outcome webhooks + history tracking          |
| `src/dora.ts`        | DORA-5 metrics computation                          |
| `src/main.ts`        | Action entry point                                  |
| `src/types.ts`       | Zod schemas + TypeScript types                      |
| `src/config.ts`      | `.trailhead.yml` parser with legacy `.deployguard.yml` fallback |
| `src/notify.ts`      | Webhook + evaluation store                          |
| `src/otel.ts`        | OpenTelemetry span export                           |
| `src/submission-engine.ts` | Gate 1 + Phase 0 submission checks          |
| `src/submission-checks/` | Detectors, Phase 0 heuristics, syntax-validity |
| `scripts/shadow-compare-gates.mjs` | Legacy vs Trailhead divergence report        |
| `src/fixer-core.ts`  | Autofix allowlist + red-lane globs (Phase B2)       |
| `src/trust-score.ts` | Dynamic agent trust profiles (Phase B3)             |
| `src/agent-trust-metrics.ts` | `trailhead.agent_trust_metrics.v1` schema + parser |
| `src/agent-trust-feedback.ts` | `trailhead.feedback.v1` post-merge rollup          |
| `src/trust-runtime.ts` | Shadow/enforce/kill switch for trust JSON           |
| `src/verdict.ts` | `trailhead.verdict.v1` gate verdict contract            |
| `scripts/build-cli-bundle.mjs` | ncc CLI bundle + vendored SWC bindings          |
| `src/credit-meter.ts`| Komatik deploy_check credit ingest (v4.4.1)         |
| `mcp/src/server.ts`  | MCP server (26 tools)                               |
| `app/src/handler.ts` | GitHub App webhook handler                          |
| `app/src/fixer.ts`   | Autofix planner (dry-run in v4.4.x)                 |
| `app/src/server.ts`  | Hono HTTP server                                    |
| `cli/src/index.ts`   | `trailhead init` wizard (`--preset solo|team|agent|ops`) |
| `presets/`           | Persona policy templates — see `docs/getting-started.md` |
| `src/__tests__/`     | Vitest test suite (691 tests)                       |
| `cloud/src/__tests__/` | Cloud API tests (21 tests)                        |
| `docs/submission-gate.md` | Gate 1 + Phase 0 reference                   |
| `docs/agents-submission-soak.md` | B4 soak + flip sequencing              |
| `docs/komatik-hosted-store.md` | Fleet evaluation store at komatik.ai        |
| `presets/agent-docs.yml` | Docs/suggestion repo `risk.non_source_globs`   |
| `scripts/check-fleet-trailhead-pins.mjs` | Fleet pin drift audit              |
| `scripts/query-agents-submission-soak.mjs` | Submission FP rate (per-PR)      |
