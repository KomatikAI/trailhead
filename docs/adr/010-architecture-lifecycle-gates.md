# ADR-010: Architecture & Lifecycle Gates

**Status:** Proposed
**Date:** 2026-06-01
**Author:** Trailhead team

## Context

Trailhead's detectors today catch **change-local** risk: secrets, mock/placeholder
code, destructive SQL, unresolved relative imports, missing RLS, oversized files,
syntax errors (see `src/submission-checks/detectors.ts`). These are necessary but
they all answer "is this diff, in isolation, unsafe?"

A whole class of incidents slips through that net because the failure isn't in the
diff — it's in how the diff relates to the **rest of the system**. A recent
multi-repo ecosystem rollout produced a representative sample:

1. **Dangling contract references.** Repos declared, in their Backstage
   `catalog-info.yaml`, that they *consume* APIs (`komatik-v3-prebuild`,
   `identity`, …) that no repo *published* yet. Each PR was internally valid and
   green; the break only existed across repos. CI cannot see it.
2. **Incomplete deprecation / zombie surfaces.** A product was "retired" (row
   unlisted, `canonical_slug` set, repo archived) but kept rendering through an
   un-redirected route shape (`/apps/{legacy}`), a recommendations map, and a
   dashboard label. The retirement looked done; three live surfaces disagreed.
3. **Doc-vs-reality drift.** A doc asserted "redirects exist" while the live
   canonical path had none. The claim outlived the code.
4. **Destructive data change without standardized evidence.** A row `DELETE`
   shipped only because a human hand-checked FK count, event/purchase references,
   and reversibility. Nothing required or recorded that evidence.
5. **Release-train incoherence.** Work landed on `dev` *behind* an in-flight
   promotion, so the open production release silently omitted it until it was
   manually folded in.

These are **architecture & lifecycle** failures. They are exactly what a ship gate
that understands the system's contracts — not just the diff — should catch, and,
true to Trailhead's self-healing identity, *repair*.

## Decision

Add a new family of detectors — **Architecture & Lifecycle Gates** — that reason
about cross-cutting structure, each fitting the existing
`detector → policy(severity) → verdict → remediation lane` pipeline
(`runAllDetectors`, `applyDetectorPolicy`, `verdict.ts`, `remediation-lanes.ts`).
Each new detector is a `SubmissionCheckCode`, ships **`warn` / phase-0 first** per
ADR-008 gate modes, and graduates to `blocking` only after it proves precision
against real PRs.

| Detector (`code`) | Catches (incident #) | Resolves against | Default severity | Self-heal lane |
|---|---|---|---|---|
| **`contract_integrity`** | dangling catalog refs (#1) | declared entities in-PR + an org catalog index (config) | `warn` (`advisory` when no index) | open a PR declaring the missing API in the owning repo |
| **`safe_deprecation`** | zombie surfaces (#2) | route shapes + listing surfaces vs. a "retired" signal | `warn` | open a PR adding the missing redirect / removing the listing |
| **`claim_anchoring`** | doc-vs-reality drift (#3) | doc assertions ↔ backing tests | `advisory` | comment + open a test stub |
| **`destructive_change`** | unsafe data change (#4) | migration ops ↔ evidence bundle (extends `destructive_sql`) | `blocking` w/o evidence | run FK/row probes, attach evidence |
| **`promotion_coherence`** | release incoherence (#5) | source-branch work vs. target branch | `warn` | open / sequence the next-hop promotion PR |

This ADR is the umbrella. The first wave lands two catalog-native detectors —
**`contract_integrity`** (the reference implementation; it prevents the most
common and generalizable failure, with a live multi-repo catalog to validate
against) and **`safe_deprecation`** (catalog-coherence v1). The remaining three
(`claim_anchoring`, `destructive_change`, `promotion_coherence`) follow as
separate PRs under this ADR.

### `contract_integrity` design (the first detector)

- **Trigger:** any changed `catalog-info.yaml` / `catalog-info.yml`.
- **Build the known universe:** every entity `metadata.name` declared across the
  catalog files in the PR, unioned with an optional **org catalog index**
  (`ctx.catalogKnownEntities`, fed from `.trailhead.yml`
  `submission.contract_integrity.known_entities` or a generated index file).
- **Resolve references:**
  - *Local structural* — `spec.system`, `spec.subcomponentOf`: must resolve in
    the repo's own catalog. Unresolved → `warn` (low false-positive; a component's
    system/parent is always local).
  - *Owned* — `spec.providesApis`: the API entity you publish must be declared
    where you publish it. Unresolved → `warn`.
  - *Contract* — `spec.consumesApis`, `spec.dependsOn`: may be cross-repo.
    Unresolved **and** an org index is configured → `warn` ("dangling contract
    reference"). Unresolved with **no** index → `advisory` ("unverified external
    contract — supply a catalog index to enforce"). This is what makes incident #1
    catchable without producing false positives in single-repo PRs.
- **Output:** one `SubmissionCheckResult` aggregating the unresolved references,
  severity = the max across findings; `null` when everything resolves.

### Implementation status

`contract_integrity` is **implemented and cross-repo-capable**:
- detector: `src/submission-checks/contract-integrity.ts`
- org index config: `.trailhead.yml` `submission.contract_integrity.known_entities`
  (inline) and/or `catalog_index_path` (a generated JSON file); merged into
  `ctx.catalogKnownEntities` (`submission-engine.ts`), file loaded at the gate
  I/O boundary (`catalog-index.ts` → `gate.ts`).
- index generator: `scripts/build-catalog-index.mjs` (`--org <name>` via `gh`, or
  `--root <dir>` local scan).
- dogfood index: `examples/komatik-catalog-index.json` — 53 entities across the
  live org; with it configured, `consumesApis: [komatik-v3-prebuild]` resolves
  instead of flagging.

`safe_deprecation` **v1 (catalog coherence)** is implemented
(`src/submission-checks/safe-deprecation.ts`): when an entity is retired
(`spec.lifecycle: deprecated`), a still-*live* entity that keeps depending on it
(`consumesApis` / `dependsOn` / `subcomponentOf` / `system`) is flagged `warn` —
the catalog-level "zombie wire". It correctly ignores a deprecated entity that
points *up* at its live survivor (the Trace absorption shape). **Follow-up:** the
non-catalog surface coverage (route/redirect maps, listing rows — the literal
`/apps/{legacy}` zombie) needs full repo file *contents* in the gate context, not
just `repoPaths`; tracked as the next increment.

### Rollout

1. Land `contract_integrity` in **`warn`** (it is allow-only today per the gate
   calibration; this is signal-gathering, not blocking).
2. Generate/commit an org **catalog index** so contract refs resolve cross-repo;
   dogfood against the ecosystem catalog. **(done — generator + example shipped)**
3. Once precision is proven, promote to `blocking` for the *local structural* and
   *owned* categories (lowest FP), keeping cross-repo contract refs at `warn`
   until the index is authoritative — coordinated with the
   critical-factor-hard-block calibration work.

## Rationale

- **Fits the existing engine.** No new framework — a new `SubmissionCheckCode` and
  a detector function in `runAllDetectors`. Policy/severity/remediation all reuse
  the current machinery.
- **Self-healing is the product.** Catching a dangling ref is table stakes; the
  differentiator is the remediation lane that opens the fix. The detectors above
  are specified with their lanes for that reason.
- **Generalizes beyond Komatik.** Backstage catalogs, env-branch promotion, and
  migrations are industry-standard. These gates are config-driven and ship as a
  marketable "Architecture & Lifecycle" module for any team past a single repo —
  consistent with Trailhead being a per-user product, not Komatik-specific.
- **Phase-0-first matches reality.** Per ADR-008 and the current allow-only
  calibration, every new detector earns enforcement by proving precision, rather
  than blocking on day one.

## Consequences

- `SubmissionCheckContext` gains an optional `catalogKnownEntities` set (the org
  index). Optional → existing context builders are unaffected.
- The detector vocabulary (`SubmissionCheckCode`) grows; `.trailhead.yml`
  `submission.detectors` can tune each new code's `enabled` / `severity`.
- Detectors are currently **vendored** into each package (`src/`, `app/src/`,
  `cli/`, `mcp/src/`). New detectors should be added to canonical `src/` and the
  duplication tracked for consolidation into a shared package (follow-up).
