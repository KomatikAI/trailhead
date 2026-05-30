# Agent submission gate (Gate 1 + Phase 0)

Trailhead's **submission gate** validates agent-authored PR diffs and suggestion markdown before (or alongside) the deploy gate. It is implemented in the shared pure module `src/submission-engine.ts` and copied to `app/` and `mcp/` via prebuild.

## Enable in CI

```yaml
- uses: KomatikAI/trailhead@v4
  with:
    gate-mode: release-ready
    submission-gate: "true"
  env:
    KOMATIK_INSTANCE: "true" # Komatik fleet only — SOUL + stale naming checks
```

Or in `.trailhead.yml`:

```yaml
submission:
  enabled: true
  mode: block # or warn while tuning false-positive rate
```

Findings appear in `evaluation-json.submissionChecks` and map to remediation fixes via `submission-remediation.ts`.

## Check tiers

| Tier        | Count | Severity            | Blocks gate?                                 |
| ----------- | ----- | ------------------- | -------------------------------------------- |
| **Gate 1**  | 15    | `blocking` / `warn` | Yes when `mode: block`                       |
| **Phase 0** | 14    | `advisory`          | No (measurement; weight=0 in komatik-agents) |

Phase 0 runs only on markdown under `agents/*/suggestions/**` (or any `**/suggestions/**` path).

### Gate 1 codes

`artifact_integrity`, `mock_placeholder`, `context_freshness`, `destructive_sql`, `secrets`, `path_format`, `syntax_validity`, `import_resolution`, `rls_new_tables`, `auth_route_auth`, `hardcoded_env`, `external_package_deps`, `sql_syntax_basic`, `large_file`, `soul_integrity` (Komatik instance only).

**`syntax_validity`** uses `@swc/core` (JS/TS), `JSON.parse` (`.json`), and `js-yaml` (`.yaml`/`.yml`/markdown frontmatter). It runs only when **`file.content`** holds the full file body — never on a partial diff hunk. Patch-only inputs (typical PR diff mode in the Action) are skipped; whole-file submission mode (`validate-submission`, suggestion bundles) is the supported path. The ncc Action bundle ships platform `@swc/core` native bindings in `dist/swc.*.node`.

**`external_package_deps`** resolves declared packages from the submission's **`projectSlug` package.json`** (same lookup order as legacy: `{slug}/package.json`, `projects/{slug}/package.json`, root fallback). Callers must pass the matching `declaredPackages` list — see `declaredPackageNamesFromPackageJson()` and `npm run shadow-compare`.

**`sql_syntax_basic`** is advisory (`warn`): flags unclosed `BEGIN` blocks only, excluding `END IF` / `END LOOP` / `END CASE` / `END$$` terminators.

**`context_freshness`** uses legacy naming allowlists (slug-only lines, deprecated names in quoted paths, import lines) — not blanket lowercase `deployguard` matching unless configured via `submission.stale_terms`.

Optional `.trailhead.yml` tuning:

```yaml
submission:
  enabled: true
  mode: block
  stale_terms: [] # explicit only; omit for OLD_NAME_PATTERNS-only (legacy default)
  path_ignore: ["/archive/"] # merged with default _stale/_archive skips
  naming_allowlist:
    skip_extensions: [".sql"]
    skip_path_patterns: ["migrations/", "schema/"]
    skip_comment_markers: ["historical:", "migration:", "deprecated:"]
```

### Detector policy (#256)

Move **policy** into config; detector **logic** stays in the product. No source edits required for rename rules or per-detector scope/severity.

```yaml
submission:
  rename_patterns:
    - old: DeployGuard
      new: Trailhead
    - old: AcmeCorp
      new: BetaInc
  slug_only_patterns:
    - "\\blegacy-slug\\b"
  detectors:
    artifact_integrity:
      enabled: true
      file_globs: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"]
      path_ignore: ["docs/**"]
      severity: block # block | warn | advisory (maps block → blocking)
    context_freshness:
      enabled: true
      severity: warn
    mock_placeholder:
      enabled: false
```

- **`rename_patterns`** — extends Komatik defaults when `KOMATIK_INSTANCE=true`; usable standalone on any repo
- **`detectors.<code>.enabled`** — skip a detector entirely
- **`detectors.<code>.severity`** — override default severity (`block` → `blocking`)
- **`detectors.<code>.file_globs`** — limit which files a detector scans (`artifact_integrity` default: code extensions only)
- **`detectors.<code>.path_ignore`** — skip paths matching globs for that detector
- Unknown detector keys → Action warning (same pattern as unknown top-level config keys)

MCP `validate-submission` accepts the same `submission` object shape as `.trailhead.yml` and returns `config_warnings` for unknown keys.

## Shadow comparison (cutover gate)

Before retiring `komatik-agents/scripts/lib/agent-gate-checks.js`, run the read-only divergence report against real suggestion bundles:

```bash
# Shallow clone komatik-agents dev, then:
KOMATIK_AGENTS_ROOT=/path/to/agents npm run shadow-compare
```

Report written to `shadow-compare-out/shadow-compare-report.json` (gitignored). **Cutover criterion:** 0 divergent decisions on shared checks (`secrets`, `destructive_sql`, `syntax_validity`, `mock_placeholder`, `hardcoded_env`, `external_package_deps`, `sql_syntax_basic`, `large_file`, `context_freshness`).

**Status (May 30, 2026):** 66/66 bundles compared, **0 divergent** after [#250](https://github.com/KomatikAI/trailhead/pull/250). Trailhead `validate-submission` is behavioral equivalent to the legacy gate for whole-file suggestion submissions.

**Caller contract for `external_package_deps`:** pass `declaredPackages` from the submission's `projectSlug` package.json (lookup order: `{slug}/package.json`, `projects/{slug}/package.json`, repo root). Use `declaredPackageNamesFromPackageJson()` from `submission-engine.ts`. The shadow script does this automatically; komatik-agents cutover wiring must do the same per bundle.

### Phase 0 codes (v4.4.2)

**Group A — output shape:** `output_size_min`, `action_extraction_present`, `delta_section_present`, `preamble_absent`, `graduation_signals_section_present`, `fabricated_id_check`, `session_narrative_detection`

**Group B — proposal quality:** `incompleteness_self_flag`, `referenced_files_exist`, `prerequisite_secrets_check`, `dependency_dag_validation`, `uncommitted_fix_check`, `verification_owner_assigned`, `external_interface_validation`

Role-specific heuristics (e.g. coordinator action extraction, knowledge-scout delta section) infer agent role from the file path (`agents/<role>/suggestions/...`).

## MCP parity

| Tool                  | Purpose                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `validate-submission` | Run Gate 1 + Phase 0 on file patches or full suggestion content     |
| `apply-autofix`       | Plan allowlisted autofixes from remediation fixes (dry-run default) |
| `get-trust-score`     | Compute trust profile from rolling evaluation metrics               |

See [mcp/README.md](../mcp/README.md) for the full 26-tool catalog.

## Trust scoring (Phase B3)

Pass rolling metrics via `TRAILHEAD_AGENT_TRUST_JSON` until hosted trust lookup ships:

```json
{
  "evaluations": 20,
  "releaseReadyCount": 18,
  "revertCount": 0,
  "humanReviewRequiredCount": 2,
  "policyViolationCount": 0,
  "sensitivePathViolationCount": 0,
  "remediationRoundsToReady": [1, 1, 2, 1]
}
```

Profiles: `fast-track` (≥0.85), `standard`, `probation` (<0.6). Probation forces stricter review and disables autofix.

## Autofix (Phase B2)

`src/fixer-core.ts` defines red-lane globs and allowlisted `autofix_class` values. `app/src/fixer.ts` plans one fix per gate round; **git write is dry-run in v4.4.x** — execution ships in a follow-up App PR with `contents: write`.

## Komatik dogfood

- Preset: `presets/trailhead-strict-agents.yml`
- External fixture: `examples/agent-submission-fixture/`
- Fleet CI flip: [komatik-agents PR #197](https://github.com/KomatikAI/agents/pull/197) (`submission-gate: true`, deprecate local `./trailhead` composite)
- **B4 enforce** pending: FP rate <10% over 30 PRs before `mode: block` on agent provenance

## Related docs

- [roadmap-v4.3-agent-autonomy.md](./roadmap-v4.3-agent-autonomy.md) — Phase B exit criteria
- [komatik-credit-metering.md](./komatik-credit-metering.md) — deploy_check credit ingest (v4.4.1)
- [komatik-hosted-store.md](./komatik-hosted-store.md) — evaluation persistence
