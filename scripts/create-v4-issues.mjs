#!/usr/bin/env node
/**
 * Creates Trailhead v4 epic + child GitHub issues.
 * Usage: node scripts/create-v4-issues.mjs [--dry-run]
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const DRY_RUN = process.argv.includes("--dry-run");
const REPO = "KomatikAI/trailhead";
const MILESTONES = {
  "v4.0": "v4.0 — Release Readiness Gate",
  "v4.1": "v4.1 — Trailhead Cloud",
  "v4.2": "v4.2 — Advanced",
};
const EPIC_NUMBERS_FILE = ".v4-epic-issue-numbers.json";

function gh(args) {
  if (DRY_RUN) {
    console.log("[dry-run] gh", args.join(" "));
    return '{"number":0,"html_url":"https://example.com/0"}';
  }
  return execFileSync("gh", args, { encoding: "utf8" });
}

function createIssue({ title, body, labels, milestone }) {
  const args = ["issue", "create", "--repo", REPO, "--title", title, "--body", body];
  for (const label of labels) args.push("--label", label);
  if (milestone) args.push("--milestone", milestone);
  const out = gh(args);
  const line = out.trim().split("\n").pop();
  const url = line?.includes("http") ? line : out.match(/https:\/\/[^\s]+/)?.[0];
  const num = url?.match(/\/issues\/(\d+)/)?.[1];
  return { number: num ? Number(num) : 0, url: url ?? "" };
}

const epics = [
  {
    id: "E1",
    title: "Epic E1: Product foundation & ADRs",
    release: "v4.0",
    pillar: "pillar/infra",
    body: `## Goal
Lock v4 product decisions before implementation diverges.

## Child issues
- E1.1 ADR-006: Release Ready composite gate
- E1.2 ADR-007: Config schema v2 (contexts)
- E1.3 ADR-008: Gate modes (release-ready, advisory, risk-only)
- E1.4 ADR-009: CI check classification
- E1.5 Deprecate dual-check pattern in policy pack

## Release
Trailhead v4.0 GA`,
  },
  {
    id: "E2",
    title: "Epic E2: Config schema v2 (contexts)",
    release: "v4.0",
    pillar: "pillar/policy",
    body: `## Goal
Branch-aware, promotion-aware policy without per-workflow threshold hacks.

## Child issues
E2.1–E2.7 (schema, matcher, thresholds, migration)

## Release
Trailhead v4.0 GA`,
  },
  {
    id: "E3",
    title: "Epic E3: CI orchestrator (Checks API)",
    release: "v4.0",
    pillar: "pillar/orchestrator",
    body: `## Goal
Read live CI state from GitHub Checks API; distinguish skipped vs failed.

## Child issues
E3.1–E3.7

## Release
Trailhead v4.0 GA`,
  },
  {
    id: "E4",
    title: "Epic E4: Composite Release Ready gate",
    release: "v4.0",
    pillar: "pillar/orchestrator",
    body: `## Goal
Single gate decision combining CI + risk + policy.

## Child issues
E4.1–E4.7

## Release
Trailhead v4.0 GA`,
  },
  {
    id: "E5",
    title: "Epic E5: Unified PR surface",
    release: "v4.0",
    pillar: "pillar/ux",
    body: `## Goal
One PR comment and one required check — the v4 product UX.

## Child issues
E5.1–E5.8

## Release
Trailhead v4.0 GA`,
  },
  {
    id: "E6",
    title: "Epic E6: Workflow & CLI onboarding",
    release: "v4.0",
    pillar: "pillar/ux",
    body: `## Goal
New consumers get the v4 release-ready experience via trailhead init.

## Child issues
E6.1–E6.7

## Release
Trailhead v4.0 GA`,
  },
  {
    id: "E7",
    title: "Epic E7: Interface parity (App + MCP)",
    release: "v4.0",
    pillar: "pillar/infra",
    body: `## Goal
Same release-ready logic in Action, GitHub App, and MCP server.

## Child issues
E7.1–E7.6

## Release
Trailhead v4.0 GA`,
  },
  {
    id: "E8",
    title: "Epic E8: Store resilience (OSS + cloud-ready)",
    release: "v4.0",
    pillar: "pillar/infra",
    body: `## Goal
Persistence failures visible and recoverable for all consumers.

## Child issues
E8.1–E8.6

## Release
Trailhead v4.0 GA`,
  },
  {
    id: "E9",
    title: "Epic E9: Self-test & fixture suite",
    release: "v4.0",
    pillar: "pillar/infra",
    body: `## Goal
Prove v4 composite gate behavior on Trailhead's own PRs.

## Child issues
E9.1–E9.6

## Release
Trailhead v4.0 GA`,
  },
  {
    id: "E10",
    title: "Epic E10: Docs, migration & marketplace positioning",
    release: "v4.0",
    pillar: "pillar/ux",
    body: `## Goal
Product story matches shipped v4 reality.

## Child issues
E10.1–E10.8

## Release
Trailhead v4.0 GA`,
  },
  {
    id: "E11",
    title: "Epic E11: Trailhead Cloud API",
    release: "v4.1",
    pillar: "pillar/cloud",
    body: `## Goal
First-party evaluation store API for paid Trailhead Cloud tier.

## Child issues
E11.1–E11.6

## Release
Trailhead v4.1`,
  },
  {
    id: "E12",
    title: "Epic E12: Hosted dashboard MVP",
    release: "v4.1",
    pillar: "pillar/cloud",
    body: `## Goal
Per-repo trends, release-ready rates, DORA correlation for paying customers.

## Child issues
E12.1–E12.6

## Release
Trailhead v4.1`,
  },
  {
    id: "E13",
    title: "Epic E13: FP feedback + policy recommendations",
    release: "v4.1",
    pillar: "pillar/cloud",
    body: `## Goal
Close the false-positive feedback loop from dashboard to policy tuning.

## Child issues
E13.1–E13.5

## Release
Trailhead v4.1`,
  },
  {
    id: "E14",
    title: "Epic E14: Billing & org management",
    release: "v4.1",
    pillar: "pillar/cloud",
    body: `## Goal
GitHub Marketplace tiers and org-level API key provisioning.

## Child issues
E14.1–E14.4

## Release
Trailhead v4.1`,
  },
  {
    id: "E15",
    title: "Epic E15: CI manifest / path-filter contract",
    release: "v4.2",
    pillar: "pillar/orchestrator",
    body: `## Goal
Distinguish path-filter skips from missing checks via workflow manifest.

## Child issues
E15.1–E15.4

## Release
Trailhead v4.2`,
  },
  {
    id: "E16",
    title: "Epic E16: Cross-repo impact v2",
    release: "v4.2",
    pillar: "pillar/policy",
    body: `## Goal
Detect and surface contract changes affecting satellite repos.

## Child issues
E16.1–E16.3

## Release
Trailhead v4.2`,
  },
  {
    id: "E17",
    title: "Epic E17: Multi-platform CI adapters",
    release: "v4.2",
    pillar: "pillar/orchestrator",
    body: `## Goal
Release-ready gate for GitLab and CircleCI consumers.

## Child issues
E17.1–E17.3

## Release
Trailhead v4.2`,
  },
];

const children = [
  // E1
  {
    epic: "E1",
    id: "E1.1",
    priority: "p0",
    pillar: "pillar/infra",
    release: "v4.0",
    title: "ADR-006: Release Ready composite gate",
    body: `## Summary
Document the v4 product decision: primary required check is \`Trailhead — Release Ready\`.

## Decision
\`\`\`
release_ready =
  all(required_checks ∈ {success, skipped_allowed})
  ∧ risk_score ≤ effective_threshold
  ∧ freeze_clear
  ∧ security_clear (if configured)
  ∧ health_ok (if configured)
  ∧ no blocking policy findings
\`\`\`

## Acceptance criteria
- [ ] ADR merged to \`docs/adr/006-release-ready-composite-gate.md\`
- [ ] Team agrees single-check branch protection model`,
  },
  {
    epic: "E1",
    id: "E1.2",
    priority: "p0",
    pillar: "pillar/policy",
    release: "v4.0",
    title: "ADR-007: Config schema v2 (contexts)",
    body: `## Summary
Document \`schema_version: 2\`, \`contexts[]\` matcher, and distinction from file \`profiles\`.

## Acceptance criteria
- [ ] ADR merged to \`docs/adr/007-config-schema-v2-contexts.md\`
- [ ] Example v2 config included`,
  },
  {
    epic: "E1",
    id: "E1.3",
    priority: "p0",
    pillar: "pillar/policy",
    release: "v4.0",
    title: "ADR-008: Gate modes (release-ready, advisory, risk-only)",
    body: `## Summary
| Mode | Blocks merge? | Reads CI? |
|------|---------------|-----------|
| release-ready | Yes on composite fail | Yes |
| advisory | Never (neutral check) | Yes |
| risk-only | Yes on risk only | No (v3 compat) |

## Acceptance criteria
- [ ] ADR merged
- [ ] Default for new installs documented`,
  },
  {
    epic: "E1",
    id: "E1.4",
    priority: "p0",
    pillar: "pillar/orchestrator",
    release: "v4.0",
    title: "ADR-009: CI check classification (pass/fail/skip/pending)",
    body: `## Summary
Define how GitHub check conclusions map to Trailhead CI status and skip heuristics.

## Acceptance criteria
- [ ] ADR covers required vs optional checks
- [ ] Documents \`missing_required: fail|skip\` behavior`,
  },
  {
    epic: "E1",
    id: "E1.5",
    priority: "p1",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "Deprecate dual-check pattern in policy pack",
    body: `## Summary
Update \`examples/policy-pack/\` to recommend single \`Trailhead — Release Ready\` required check.

## Acceptance criteria
- [ ] Policy pack v2 examples
- [ ] Enforcement guidelines updated`,
  },
  // E2
  {
    epic: "E2",
    id: "E2.1",
    priority: "p0",
    pillar: "pillar/policy",
    release: "v4.0",
    title: "Extend Zod schema: schema_version, contexts, gate.mode",
    body: `## Summary
Add v2 config types to \`src/types.ts\` and parser in \`src/config.ts\`.

## Files
- \`src/types.ts\`
- \`src/config.ts\`
- \`src/__tests__/config.test.ts\`

## Acceptance criteria
- [ ] v1 configs still parse (default schema_version: 1)
- [ ] v2 configs parse with gate.mode and contexts`,
  },
  {
    epic: "E2",
    id: "E2.2",
    priority: "p0",
    pillar: "pillar/policy",
    release: "v4.0",
    title: "Context matcher engine (base_branch, head_branch, labels)",
    body: `## Summary
New \`src/context-matcher.ts\` — first matching context wins.

## Acceptance criteria
- [ ] Match on base_branch globs
- [ ] Optional label matching
- [ ] Unit tests for feature vs promotion PRs`,
  },
  {
    epic: "E2",
    id: "E2.3",
    priority: "p0",
    pillar: "pillar/policy",
    release: "v4.0",
    title: "Per-context thresholds + CI required checks config",
    body: `## Summary
Each context defines thresholds and \`ci.required_checks\` / \`ci.optional_checks\`.

## Acceptance criteria
- [ ] Context thresholds override root thresholds
- [ ] CI check lists exposed to orchestrator`,
  },
  {
    epic: "E2",
    id: "E2.4",
    priority: "p1",
    pillar: "pillar/policy",
    release: "v4.0",
    title: "Auto-resolve environment from matched context",
    body: `## Summary
When action \`environment\` input unset, derive from context name or explicit \`environment\` field.

## Acceptance criteria
- [ ] environments.* thresholds apply when context sets environment`,
  },
  {
    epic: "E2",
    id: "E2.5",
    priority: "p1",
    pillar: "pillar/policy",
    release: "v4.0",
    title: "Config validation warnings (unknown keys, schema drift)",
    body: `## Summary
Warn on unknown keys; actionable error on unsupported schema_version.

## Acceptance criteria
- [ ] Unknown keys log warning, not failure
- [ ] schema_version > supported emits clear error`,
  },
  {
    epic: "E2",
    id: "E2.6",
    priority: "p1",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "Migration guide: v1 → v2 config",
    body: `## Summary
Document step-by-step migration from v3 risk-only to v4 contexts.

## Acceptance criteria
- [ ] \`docs/migration-v3-to-v4.md\` published
- [ ] Linked from README`,
  },
  {
    epic: "E2",
    id: "E2.7",
    priority: "p2",
    pillar: "pillar/policy",
    release: "v4.0",
    title: "Keep profiles file-weight-only; document distinction",
    body: `## Summary
Clarify \`profiles\` = weight overrides; \`contexts\` = branch/CI/threshold policy.

## Acceptance criteria
- [ ] docs/README.md section updated`,
  },
  // E3
  {
    epic: "E3",
    id: "E3.1",
    priority: "p0",
    pillar: "pillar/orchestrator",
    release: "v4.0",
    title: "ci-orchestrator.ts — list check runs for head SHA",
    body: `## Summary
New \`src/ci-orchestrator.ts\` with \`fetchCheckRuns()\` using Octokit checks API.

## Acceptance criteria
- [ ] Returns normalized CiCheckStatus[]
- [ ] Unit tests with mocked Octokit`,
  },
  {
    epic: "E3",
    id: "E3.2",
    priority: "p0",
    pillar: "pillar/orchestrator",
    release: "v4.0",
    title: "Check classification: pass / fail / skip / pending / stale",
    body: `## Summary
Map GitHub conclusions to Trailhead CI status enum.

## Acceptance criteria
- [ ] skipped/neutral handled per ADR-009
- [ ] pending vs stale distinguished`,
  },
  {
    epic: "E3",
    id: "E3.3",
    priority: "p0",
    pillar: "pillar/orchestrator",
    release: "v4.0",
    title: "Poll loop with wait-for-checks + timeout",
    body: `## Summary
\`waitForChecks()\` polls until terminal or timeout.

## Action inputs
- \`wait-for-checks\` (default false; true in release-ready mode)
- \`wait-timeout-minutes\`

## Acceptance criteria
- [ ] Exits early when all required checks terminal
- [ ] Returns pending checks on timeout`,
  },
  {
    epic: "E3",
    id: "E3.4",
    priority: "p0",
    pillar: "pillar/orchestrator",
    release: "v4.0",
    title: "Exclude Trailhead's own checks from CI rollup",
    body: `## Summary
Filter out checks named \`Trailhead\` / \`Trailhead — Release Ready\` to avoid recursion.

## Acceptance criteria
- [ ] Self-checks excluded from required CI evaluation`,
  },
  {
    epic: "E3",
    id: "E3.5",
    priority: "p1",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "Workflow run deep links for failed checks",
    body: `## Summary
Populate \`detailsUrl\` on failed checks for PR comment links.

## Acceptance criteria
- [ ] Failed checks link to workflow run in unified comment`,
  },
  {
    epic: "E3",
    id: "E3.6",
    priority: "p2",
    pillar: "pillar/orchestrator",
    release: "v4.0",
    title: "Support check name aliases / patterns (Build*)",
    body: `## Summary
Optional glob/prefix matching for check names in config.

## Acceptance criteria
- [ ] Document alias syntax in contexts.ci`,
  },
  {
    epic: "E3",
    id: "E3.7",
    priority: "p2",
    pillar: "pillar/orchestrator",
    release: "v4.0",
    title: "Status API fallback for legacy commit statuses",
    body: `## Summary
Fallback to repos/statuses API when check runs absent.

## Acceptance criteria
- [ ] Config flag to enable legacy status mode`,
  },
  // E4
  {
    epic: "E4",
    id: "E4.1",
    priority: "p0",
    pillar: "pillar/orchestrator",
    release: "v4.0",
    title: "computeReleaseReady() — merge CI result + gate evaluation",
    body: `## Summary
Pure function combining CI orchestrator result with risk/policy/freeze decisions.

## Acceptance criteria
- [ ] Decision matrix from ADR-006 implemented
- [ ] Unit tests for all matrix rows`,
  },
  {
    epic: "E4",
    id: "E4.2",
    priority: "p0",
    pillar: "pillar/orchestrator",
    release: "v4.0",
    title: "Extend GateEvaluation with ci_status and release_ready",
    body: `## Summary
Add \`releaseReady\`, \`releaseReadyReasons\`, \`ci\`, \`context\` to evaluation payload.

## Acceptance criteria
- [ ] Zod schema updated
- [ ] Serialized in evaluation-json output`,
  },
  {
    epic: "E4",
    id: "E4.3",
    priority: "p0",
    pillar: "pillar/orchestrator",
    release: "v4.0",
    title: "Wire orchestrator into evaluateGate() when mode ≠ risk-only",
    body: `## Summary
Call CI orchestrator from \`evaluateGate\` when gate.mode is release-ready or advisory.

## Acceptance criteria
- [ ] risk-only mode skips CI entirely (v3 behavior)
- [ ] Matched context drives required check list`,
  },
  {
    epic: "E4",
    id: "E4.4",
    priority: "p0",
    pillar: "pillar/orchestrator",
    release: "v4.0",
    title: "Block reasons array (ordered, human-readable)",
    body: `## Summary
\`releaseReadyReasons[]\` lists why not ready in priority order.

## Acceptance criteria
- [ ] Reasons appear in check output and PR comment`,
  },
  {
    epic: "E4",
    id: "E4.5",
    priority: "p1",
    pillar: "pillar/orchestrator",
    release: "v4.0",
    title: "Advisory mode: always neutral, never setFailed",
    body: `## Summary
advisory mode shows would-block reasons but check conclusion is always neutral.

## Acceptance criteria
- [ ] Merge never blocked in advisory mode
- [ ] Reasons still visible in comment`,
  },
  {
    epic: "E4",
    id: "E4.6",
    priority: "p1",
    pillar: "pillar/orchestrator",
    release: "v4.0",
    title: "Extend rollout-readiness-json to include CI dimension",
    body: `## Summary
Rollout readiness score factors in CI summary state.

## Acceptance criteria
- [ ] CI failed → band cannot be go
- [ ] Self-test validates output`,
  },
  {
    epic: "E4",
    id: "E4.7",
    priority: "p2",
    pillar: "pillar/policy",
    release: "v4.0",
    title: "Override support: waive CI or risk explicitly",
    body: `## Summary
Extend governed overrides to optionally waive CI failure or risk threshold.

## Acceptance criteria
- [ ] Override metadata records which dimension waived
- [ ] Audit trail in evaluation payload`,
  },
  // E5
  {
    epic: "E5",
    id: "E5.1",
    priority: "p0",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "Unified PR comment template (CI table + risk + decision)",
    body: `## Summary
Replace risk-only comment with unified Release Ready summary table.

## Acceptance criteria
- [ ] CI table + risk + security + freeze in one comment
- [ ] Context name shown`,
  },
  {
    epic: "E5",
    id: "E5.2",
    priority: "p0",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "Composite check run: Trailhead — Release Ready",
    body: `## Summary
Primary check uses configurable name (default \`Trailhead — Release Ready\`).

## Acceptance criteria
- [ ] Check conclusion reflects releaseReady not just risk
- [ ] risk-only mode keeps legacy \`Trailhead\` check name`,
  },
  {
    epic: "E5",
    id: "E5.3",
    priority: "p1",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "Collapsible sections: risk factors, health, DORA, policy findings",
    body: `## Summary
<details> sections for detailed breakdown below summary table.

## Acceptance criteria
- [ ] Summary scannable; details expandable`,
  },
  {
    epic: "E5",
    id: "E5.4",
    priority: "p1",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "Failed check links to workflow run / job log",
    body: `## Summary
CI table rows link to GitHub Actions run for failures.

## Acceptance criteria
- [ ] Clickable links in PR comment for failed checks`,
  },
  {
    epic: "E5",
    id: "E5.5",
    priority: "p1",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "Store persistence failure annotation on check output",
    body: `## Summary
When store POST fails, check output includes visible persistence warning.

## Acceptance criteria
- [ ] Message: "Evaluation not persisted — dashboard incomplete"
- [ ] Visible in GitHub Checks UI`,
  },
  {
    epic: "E5",
    id: "E5.6",
    priority: "p1",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "Comment update strategy (single comment, not spam)",
    body: `## Summary
Update existing Trailhead comment on synchronize rather than posting new each run.

## Acceptance criteria
- [ ] One comment per PR (update in place)`,
  },
  {
    epic: "E5",
    id: "E5.7",
    priority: "p2",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "Risk labels: soften in advisory mode",
    body: `## Summary
Skip or soften risk labels when gate.mode is advisory.

## Acceptance criteria
- [ ] Labels only applied in release-ready and risk-only modes`,
  },
  {
    epic: "E5",
    id: "E5.8",
    priority: "p2",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "Slack/webhook payload includes CI summary",
    body: `## Summary
Extend webhook payload with ci.summary and releaseReady fields.

## Acceptance criteria
- [ ] Slack text includes CI pass/fail count`,
  },
  // E6
  {
    epic: "E6",
    id: "E6.1",
    priority: "p0",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "trailhead init v2 wizard — gate mode + contexts",
    body: `## Summary
CLI wizard asks branch model and generates v2 .trailhead.yml with contexts.

## Acceptance criteria
- [ ] Generates schema_version: 2 config
- [ ] Offers release-ready vs risk-only`,
  },
  {
    epic: "E6",
    id: "E6.2",
    priority: "p0",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "Generated workflow: needs pattern + wait-for-checks",
    body: `## Summary
Init generates workflow with optional needs: [ci jobs] and wait-for-checks.

## Acceptance criteria
- [ ] Valid workflow YAML output
- [ ] Document parallel CI + poll alternative`,
  },
  {
    epic: "E6",
    id: "E6.3",
    priority: "p1",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "Reusable workflow: release-ready.yml",
    body: `## Summary
Publish \`.github/workflows/release-ready.yml\` callable workflow.

## Acceptance criteria
- [ ] Consumers can uses: KomatikAI/trailhead/.github/workflows/release-ready.yml@v4`,
  },
  {
    epic: "E6",
    id: "E6.4",
    priority: "p1",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "Policy pack v2: contexts templates (main-only, progressive)",
    body: `## Summary
Update examples/policy-pack with v2 contexts for main-only and dev/staging/main.

## Acceptance criteria
- [ ] trailhead-starter.progressive.yml uses contexts
- [ ] Komatik-style example included as reference profile`,
  },
  {
    epic: "E6",
    id: "E6.5",
    priority: "p1",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "GitHub ruleset JSON: single required check name",
    body: `## Summary
Update ruleset templates to require only \`Trailhead — Release Ready\`.

## Acceptance criteria
- [ ] github-ruleset.*.json updated`,
  },
  {
    epic: "E6",
    id: "E6.6",
    priority: "p2",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "Branch protection setup guide",
    body: `## Summary
Step-by-step guide for org admins configuring required checks.

## Acceptance criteria
- [ ] docs/branch-protection-setup.md`,
  },
  {
    epic: "E6",
    id: "E6.7",
    priority: "p2",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "trailhead doctor — validate config + check name mismatches",
    body: `## Summary
CLI command to validate .trailhead.yml and compare check names to recent PR runs.

## Acceptance criteria
- [ ] Reports unknown check names in config vs GitHub`,
  },
  // E7
  {
    epic: "E7",
    id: "E7.1",
    priority: "p0",
    pillar: "pillar/infra",
    release: "v4.0",
    title: "Prebuild: copy ci-orchestrator + context-matcher to app/mcp",
    body: `## Summary
Update app/ and mcp/ prebuild scripts for new shared modules.

## Acceptance criteria
- [ ] mcp/dist and app builds pass
- [ ] Committed dist artifacts updated`,
  },
  {
    epic: "E7",
    id: "E7.2",
    priority: "p1",
    pillar: "pillar/infra",
    release: "v4.0",
    title: "GitHub App handler: composite gate on deployment protection",
    body: `## Summary
app/src/handler.ts uses same release-ready logic as Action.

## Acceptance criteria
- [ ] App evaluation matches Action for same PR fixture`,
  },
  {
    epic: "E7",
    id: "E7.3",
    priority: "p1",
    pillar: "pillar/infra",
    release: "v4.0",
    title: "MCP tool: get-pr-release-status",
    body: `## Summary
New MCP tool returning releaseReady + ci + risk for a PR.

## Acceptance criteria
- [ ] Tool documented in mcp/README.md
- [ ] Tests in mcp.test.ts`,
  },
  {
    epic: "E7",
    id: "E7.4",
    priority: "p2",
    pillar: "pillar/infra",
    release: "v4.0",
    title: "MCP tool: wait-for-ci-checks",
    body: `## Summary
MCP tool wrapping waitForChecks for agent workflows.

## Acceptance criteria
- [ ] Polls until timeout; returns same shape as Action`,
  },
  {
    epic: "E7",
    id: "E7.5",
    priority: "p1",
    pillar: "pillar/infra",
    release: "v4.0",
    title: "Update evaluate-policy MCP tool to include CI dimension",
    body: `## Summary
evaluate-policy includes CI status when gate.mode ≠ risk-only.

## Acceptance criteria
- [ ] Policy evaluation returns releaseReady`,
  },
  {
    epic: "E7",
    id: "E7.6",
    priority: "p2",
    pillar: "pillar/infra",
    release: "v4.0",
    title: "Update MCP README + tool count in docs",
    body: `## Summary
Document new MCP tools; update tool count across docs and skill file.

## Acceptance criteria
- [ ] docs/README.md tool list current`,
  },
  // E8
  {
    epic: "E8",
    id: "E8.1",
    priority: "p0",
    pillar: "pillar/infra",
    release: "v4.0",
    title: "Store POST retry with exponential backoff (429, 502, 503)",
    body: `## Summary
Retry store POST up to 3 times with 1s/4s/16s backoff.

## Acceptance criteria
- [ ] Retries on 429, 502, 503, 504, network error
- [ ] No retry on 401, 403, 400
- [ ] Tests in notify.test.ts`,
  },
  {
    epic: "E8",
    id: "E8.2",
    priority: "p0",
    pillar: "pillar/infra",
    release: "v4.0",
    title: "storePersisted flag on evaluation payload",
    body: `## Summary
Evaluation includes storePersisted: boolean for E5.5 annotation.

## Acceptance criteria
- [ ] Flag set false when all retries fail
- [ ] ADR-002 preserved: never blocks merge`,
  },
  {
    epic: "E8",
    id: "E8.3",
    priority: "p1",
    pillar: "pillar/infra",
    release: "v4.0",
    title: "Action input: evaluation-store-retries (default 3)",
    body: `## Summary
Configurable retry count via action input.

## Acceptance criteria
- [ ] action.yml input documented
- [ ] Passed to storeEvaluation()`,
  },
  {
    epic: "E8",
    id: "E8.4",
    priority: "p2",
    pillar: "pillar/infra",
    release: "v4.0",
    title: "Optional artifact upload on store failure",
    body: `## Summary
Upload evaluation-json as workflow artifact when store unreachable.

## Acceptance criteria
- [ ] Opt-in via action input
- [ ] Artifact named trailhead-evaluation-{sha}`,
  },
  {
    epic: "E8",
    id: "E8.5",
    priority: "p1",
    pillar: "pillar/infra",
    release: "v4.0",
    title: "Deploy tracker: full SHA match + configurable fallback window",
    body: `## Summary
Improve examples/github-actions/trailhead-deploy-tracker.yml matching.

## Acceptance criteria
- [ ] Full commit_sha match primary
- [ ] Optional time-window fallback documented`,
  },
  {
    epic: "E8",
    id: "E8.6",
    priority: "p1",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "Document bring-your-own-store vs Trailhead Cloud",
    body: `## Summary
Clarify OSS store options vs v4.1 cloud tier in docs.

## Acceptance criteria
- [ ] docs/evaluation-storage.md updated`,
  },
  // E9
  {
    epic: "E9",
    id: "E9.1",
    priority: "p0",
    pillar: "pillar/infra",
    release: "v4.0",
    title: "CI check fixtures — 15 mock Octokit scenarios",
    body: `## Summary
Fixture JSON for ci-orchestrator tests covering pass/fail/skip/pending/timeout.

## Acceptance criteria
- [ ] 15 scenarios from v4 roadmap
- [ ] All pass in CI`,
  },
  {
    epic: "E9",
    id: "E9.2",
    priority: "p0",
    pillar: "pillar/infra",
    release: "v4.0",
    title: "Context matcher fixtures — 8 branch/label cases",
    body: `## Summary
Unit test fixtures for context matching edge cases.

## Acceptance criteria
- [ ] 8 cases including no-match fallback`,
  },
  {
    epic: "E9",
    id: "E9.3",
    priority: "p1",
    pillar: "pillar/infra",
    release: "v4.0",
    title: "Self-test workflow: composite gate on PRs to dev",
    body: `## Summary
Update .github/workflows/self-test.yml for v4 release-ready mode.

## Acceptance criteria
- [ ] Self-test runs gate.mode release-ready on PRs`,
  },
  {
    epic: "E9",
    id: "E9.4",
    priority: "p1",
    pillar: "pillar/infra",
    release: "v4.0",
    title: "Integration test: release-ready block on high-risk fixture PR",
    body: `## Summary
End-to-end test that composite gate blocks when expected.

## Acceptance criteria
- [ ] dry-run or self-test validates block path`,
  },
  {
    epic: "E9",
    id: "E9.5",
    priority: "p2",
    pillar: "pillar/infra",
    release: "v4.0",
    title: "Advisory mode self-test job",
    body: `## Summary
Self-test job validating advisory mode never fails workflow.

## Acceptance criteria
- [ ] Advisory run produces neutral check`,
  },
  {
    epic: "E9",
    id: "E9.6",
    priority: "p2",
    pillar: "pillar/infra",
    release: "v4.0",
    title: "Latency budget test: orchestrator adds < 15s p95",
    body: `## Summary
Benchmark test when checks already green (no unnecessary polling).

## Acceptance criteria
- [ ] CI test or documented benchmark under 15s p95`,
  },
  // E10
  {
    epic: "E10",
    id: "E10.1",
    priority: "p0",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "README rewrite: Release Readiness Gate positioning",
    body: `## Summary
Reposition Trailhead as one-stop release readiness gate, not risk sidecar.

## Acceptance criteria
- [ ] README hero and quick start reflect v4
- [ ] gate.mode documented`,
  },
  {
    epic: "E10",
    id: "E10.2",
    priority: "p0",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "v3 → v4 migration guide",
    body: `## Summary
Full migration guide for existing @v3 consumers.

## Acceptance criteria
- [ ] docs/migration-v3-to-v4.md complete
- [ ] risk-only compat documented`,
  },
  {
    epic: "E10",
    id: "E10.3",
    priority: "p0",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "CHANGELOG v4.0.0 entry",
    body: `## Summary
Document all v4.0 breaking-ish changes and opt-in paths.

## Acceptance criteria
- [ ] CHANGELOG section for 4.0.0`,
  },
  {
    epic: "E10",
    id: "E10.4",
    priority: "p1",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "Update docs/README.md architecture diagram",
    body: `## Summary
Architecture diagram shows CI orchestrator + composite gate layer.

## Acceptance criteria
- [ ] Diagram includes ci-orchestrator.ts`,
  },
  {
    epic: "E10",
    id: "E10.5",
    priority: "p1",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "Replace roadmap-agent-qa.md with roadmap-v4.md",
    body: `## Summary
Publish v4 roadmap doc referencing GitHub epics/issues.

## Acceptance criteria
- [ ] docs/roadmap-v4.md links to epic issues`,
  },
  {
    epic: "E10",
    id: "E10.6",
    priority: "p1",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "GitHub Marketplace listing update",
    body: `## Summary
Update marketplace description for v4 release-ready positioning.

## Acceptance criteria
- [ ] Listing mentions composite gate`,
  },
  {
    epic: "E10",
    id: "E10.7",
    priority: "p1",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "Update .agents/skills/trailhead/SKILL.md",
    body: `## Summary
Agent skill reflects v4 workflow and get-pr-release-status tool.

## Acceptance criteria
- [ ] Skill triggers on release-ready evaluation`,
  },
  {
    epic: "E10",
    id: "E10.8",
    priority: "p2",
    pillar: "pillar/ux",
    release: "v4.0",
    title: "Deprecation notice: dual-check pattern, risk-only as opt-in",
    body: `## Summary
Document deprecation timeline for dual CI Gate + Trailhead required checks.

## Acceptance criteria
- [ ] Deprecation note in migration guide`,
  },
  // E11
  {
    epic: "E11",
    id: "E11.1",
    priority: "p0",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "OpenAPI spec: /v1/evaluations, /v1/orgs, /v1/repos",
    body: `## Summary
Publish Trailhead Cloud API OpenAPI spec.

## Acceptance criteria
- [ ] Spec covers evaluation ingest and query
- [ ] May live in trailhead-cloud repo`,
  },
  {
    epic: "E11",
    id: "E11.2",
    priority: "p0",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "Action input: trailhead-api-key",
    body: `## Summary
Single API key replaces evaluation-store-url + secret for cloud tier.

## Acceptance criteria
- [ ] action.yml input added
- [ ] Auto-configures store URL from key`,
  },
  {
    epic: "E11",
    id: "E11.3",
    priority: "p0",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "Auto-config store URL from API key",
    body: `## Summary
Resolve https://api.trailhead.dev/v1/evaluations from trailhead-api-key.

## Acceptance criteria
- [ ] No manual store URL for cloud consumers`,
  },
  {
    epic: "E11",
    id: "E11.4",
    priority: "p1",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "Org/repo registration on first evaluation",
    body: `## Summary
Cloud API auto-registers repo on first authenticated evaluation POST.

## Acceptance criteria
- [ ] Repo appears in dashboard after first run`,
  },
  {
    epic: "E11",
    id: "E11.5",
    priority: "p1",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "Rate limit headers + idempotency key (evaluation.id)",
    body: `## Summary
Cloud API returns RateLimit-* headers; accepts Idempotency-Key header.

## Acceptance criteria
- [ ] Duplicate POST with same id is no-op`,
  },
  {
    epic: "E11",
    id: "E11.6",
    priority: "p1",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "Deploy event endpoint: /v1/deploy-events",
    body: `## Summary
Cloud API endpoint for deploy tracker correlation.

## Acceptance criteria
- [ ] Replaces direct Supabase PATCH in cloud tier`,
  },
  // E12
  {
    epic: "E12",
    id: "E12.1",
    priority: "p0",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "Dashboard: per-repo evaluation trend (risk over time)",
    body: `## Summary
Hosted dashboard chart of risk scores over time per repo.

## Acceptance criteria
- [ ] 30/90 day views`,
  },
  {
    epic: "E12",
    id: "E12.2",
    priority: "p0",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "Dashboard: release ready pass/fail rate",
    body: `## Summary
Show % PRs passing Release Ready over time.

## Acceptance criteria
- [ ] Breakdown by context (feature vs promotion)`,
  },
  {
    epic: "E12",
    id: "E12.3",
    priority: "p1",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "Dashboard: CI failure correlation",
    body: `## Summary
Which required checks fail most often per repo.

## Acceptance criteria
- [ ] Top failing checks widget`,
  },
  {
    epic: "E12",
    id: "E12.4",
    priority: "p1",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "Dashboard: DORA-5 panel from stored evaluations",
    body: `## Summary
DORA metrics computed from cloud store, not just live GitHub API.

## Acceptance criteria
- [ ] Matches Action dora-json where data exists`,
  },
  {
    epic: "E12",
    id: "E12.5",
    priority: "p1",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "Dashboard: deploy outcome correlation (CFR proxy)",
    body: `## Summary
Correlate release-ready decisions with deploy outcomes.

## Acceptance criteria
- [ ] Warned → incident rate visible`,
  },
  {
    epic: "E12",
    id: "E12.6",
    priority: "p2",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "Dashboard: per-PR drill-down with CI + risk breakdown",
    body: `## Summary
Click PR row to see full evaluation payload.

## Acceptance criteria
- [ ] Shows ci.checks array and risk factors`,
  },
  // E13
  {
    epic: "E13",
    id: "E13.1",
    priority: "p1",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "Dashboard: dismiss finding with reason",
    body: `## Summary
UI to mark detector finding as false positive with reason.

## Acceptance criteria
- [ ] Dismissal stored in cloud DB`,
  },
  {
    epic: "E13",
    id: "E13.2",
    priority: "p1",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "Wire dashboard dismissals to record-finding-feedback MCP",
    body: `## Summary
Dashboard FP dismissals use same schema as MCP feedback tool.

## Acceptance criteria
- [ ] MCP and dashboard share feedback API`,
  },
  {
    epic: "E13",
    id: "E13.3",
    priority: "p2",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "Dashboard: detector noise rates (get-detector-noise)",
    body: `## Summary
Per-detector FP rate chart per repo.

## Acceptance criteria
- [ ] Flags detectors > 15% FP rate`,
  },
  {
    epic: "E13",
    id: "E13.4",
    priority: "p2",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "Auto-suggest threshold tuning (recommend-policy-tuning)",
    body: `## Summary
Cloud generates .trailhead.yml tuning proposals from feedback history.

## Acceptance criteria
- [ ] Proposal exportable as YAML snippet`,
  },
  {
    epic: "E13",
    id: "E13.5",
    priority: "p3",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "Email/Slack digest: high FP detectors",
    body: `## Summary
Weekly digest of noisy detectors per org.

## Acceptance criteria
- [ ] Opt-in per org`,
  },
  // E14
  {
    epic: "E14",
    id: "E14.1",
    priority: "p1",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "GitHub Marketplace plan tiers (Free / Pro / Team)",
    body: `## Summary
Define and publish marketplace pricing tiers.

## Acceptance criteria
- [ ] Free: risk-only, no cloud store
- [ ] Pro: cloud store + dashboard
- [ ] Team: org rollup`,
  },
  {
    epic: "E14",
    id: "E14.2",
    priority: "p1",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "Usage metering: evaluations/month per org",
    body: `## Summary
Track and enforce evaluation quota by plan tier.

## Acceptance criteria
- [ ] Quota headers on API responses`,
  },
  {
    epic: "E14",
    id: "E14.3",
    priority: "p2",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "API key provisioning UI",
    body: `## Summary
Dashboard UI to create/revoke trailhead-api-key per repo/org.

## Acceptance criteria
- [ ] Key rotation without workflow downtime`,
  },
  {
    epic: "E14",
    id: "E14.4",
    priority: "p3",
    pillar: "pillar/cloud",
    release: "v4.1",
    title: "SSO / org seat management",
    body: `## Summary
Team tier SSO and seat-based billing.

## Acceptance criteria
- [ ] SAML/OIDC for Team plan`,
  },
  // E15
  {
    epic: "E15",
    id: "E15.1",
    priority: "p1",
    pillar: "pillar/orchestrator",
    release: "v4.2",
    title: "Workflow output: ci-manifest.json schema",
    body: `## Summary
Define JSON schema for CI job manifest artifact.

## Acceptance criteria
- [ ] Schema documents ran/skipped/reason per job`,
  },
  {
    epic: "E15",
    id: "E15.2",
    priority: "p1",
    pillar: "pillar/orchestrator",
    release: "v4.2",
    title: "Action input: ci-manifest-path or artifact download",
    body: `## Summary
Action reads ci-manifest.json from path or prior job artifact.

## Acceptance criteria
- [ ] ci-manifest-path input in action.yml`,
  },
  {
    epic: "E15",
    id: "E15.3",
    priority: "p1",
    pillar: "pillar/orchestrator",
    release: "v4.2",
    title: "Merge manifest with Checks API results",
    body: `## Summary
Orchestrator prefers manifest for skip semantics when present.

## Acceptance criteria
- [ ] paths-filter skips detected from manifest`,
  },
  {
    epic: "E15",
    id: "E15.4",
    priority: "p2",
    pillar: "pillar/ux",
    release: "v4.2",
    title: "Document ci-manifest contract in README + policy pack",
    body: `## Summary
Consumer guide for emitting ci-manifest from path-filtered workflows.

## Acceptance criteria
- [ ] Example workflow snippet in policy pack`,
  },
  // E16
  {
    epic: "E16",
    id: "E16.1",
    priority: "p2",
    pillar: "pillar/policy",
    release: "v4.2",
    title: "External consumer registry (API or config file)",
    body: `## Summary
Registry of downstream repos affected by contract changes.

## Acceptance criteria
- [ ] services.consumers supports external repo refs`,
  },
  {
    epic: "E16",
    id: "E16.2",
    priority: "p2",
    pillar: "pillar/policy",
    release: "v4.2",
    title: "Satellite repo webhook on contract change",
    body: `## Summary
Optional webhook notify downstream repos on contract surface change.

## Acceptance criteria
- [ ] Configurable webhook URL in services block`,
  },
  {
    epic: "E16",
    id: "E16.3",
    priority: "p2",
    pillar: "pillar/ux",
    release: "v4.2",
    title: "Cross-repo impact in unified PR comment",
    body: `## Summary
Show affected downstream repos in Release Ready comment.

## Acceptance criteria
- [ ] Lists consumers from registry`,
  },
  // E17
  {
    epic: "E17",
    id: "E17.1",
    priority: "p2",
    pillar: "pillar/orchestrator",
    release: "v4.2",
    title: "GitLab pipeline status adapter",
    body: `## Summary
CI orchestrator adapter for GitLab pipeline/job status API.

## Acceptance criteria
- [ ] examples/gitlab-ci updated for release-ready mode`,
  },
  {
    epic: "E17",
    id: "E17.2",
    priority: "p2",
    pillar: "pillar/orchestrator",
    release: "v4.2",
    title: "CircleCI workflow adapter",
    body: `## Summary
CI orchestrator adapter for CircleCI workflow status.

## Acceptance criteria
- [ ] examples/circleci updated`,
  },
  {
    epic: "E17",
    id: "E17.3",
    priority: "p3",
    pillar: "pillar/orchestrator",
    release: "v4.2",
    title: "Generic webhook CI adapter",
    body: `## Summary
Accept CI status via webhook POST for non-GitHub CI systems.

## Acceptance criteria
- [ ] Document webhook payload schema`,
  },
];

function labelsFor(item, { isEpic = false } = {}) {
  const ls = ["epic/v4", item.pillar, `release/${item.release}`, "enhancement"];
  if (!isEpic && item.priority) ls.push(`priority/${item.priority}`);
  return ls;
}

// Phase 1: epics
const epicNumbers = {};
console.log("Creating epic issues...");
for (const epic of epics) {
  const { number, url } = createIssue({
    title: `[${epic.id}] ${epic.title}`,
    body: epic.body,
    labels: labelsFor(epic, { isEpic: true }),
    milestone: MILESTONES[epic.release],
  });
  epicNumbers[epic.id] = number;
  console.log(`  ${epic.id} -> #${number} ${url}`);
}

writeFileSync(EPIC_NUMBERS_FILE, JSON.stringify(epicNumbers, null, 2));
console.log(`\nWrote ${EPIC_NUMBERS_FILE}`);

// Phase 2: children
console.log("\nCreating child issues...");
const childNumbers = [];
for (const child of children) {
  const epicNum = epicNumbers[child.epic];
  const body = `${child.body}\n\n---\n**Epic:** #${epicNum} (${child.epic})\n**Release:** Trailhead ${child.release}`;
  const releaseKey = child.release;
  const { number, url } = createIssue({
    title: `[${child.id}] ${child.title}`,
    body,
    labels: labelsFor(child),
    milestone: MILESTONES[releaseKey],
  });
  childNumbers.push({ id: child.id, number, url, epic: child.epic });
  console.log(`  ${child.id} -> #${number}`);
}

// Update epic bodies with child issue links
if (!DRY_RUN) {
  console.log("\nUpdating epic checklists...");
  for (const epic of epics) {
    const epicNum = epicNumbers[epic.id];
    const kids = childNumbers.filter((c) => c.epic === epic.id);
    const checklist = kids.map((k) => `- [ ] #${k.number} [${k.id}]`).join("\n");
    const updatedBody = `${epic.body}\n\n## Issues\n${checklist}`;
    gh(["issue", "edit", String(epicNum), "--repo", REPO, "--body", updatedBody]);
    console.log(`  Updated ${epic.id} #${epicNum} with ${kids.length} children`);
  }
}

writeFileSync(
  ".v4-issue-manifest.json",
  JSON.stringify({ epics: epicNumbers, children: childNumbers }, null, 2),
);
console.log("\nDone. Manifest: .v4-issue-manifest.json");
