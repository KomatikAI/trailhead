# ADR-009: CI Check Classification

**Status:** Accepted
**Date:** 2026-05-23
**Author:** Trailhead team

## Context

Trailhead v4 reads GitHub Checks API to determine CI readiness. GitHub check runs have varied `status` and `conclusion` values; path-filtered workflows may skip jobs entirely (checks never appear).

## Decision

### Trailhead CI status enum

| Status    | Meaning                                 |
| --------- | --------------------------------------- |
| `pass`    | Check completed successfully            |
| `fail`    | Check completed with failure            |
| `skip`    | Check skipped or neutral (allowed skip) |
| `pending` | Check still in progress                 |
| `stale`   | Check run is stale (superseded)         |
| `missing` | Required check not found on commit      |

### GitHub conclusion mapping

| GitHub conclusion                                      | Trailhead status |
| ------------------------------------------------------ | ---------------- |
| `success`                                              | `pass`           |
| `failure`, `timed_out`, `action_required`, `cancelled` | `fail`           |
| `skipped`, `neutral`                                   | `skip`           |
| (status `in_progress`, `queued`, `pending`)            | `pending`        |
| (status `completed`, conclusion null)                  | `pending`        |
| stale flag set                                         | `stale`          |

### Required vs optional checks

Configured per context in `contexts[].ci`:

- `required_checks`: must be `pass` or `skip` for release readiness
- `optional_checks`: reported but never block
- `missing_required`: when a required check is absent:
  - `fail` (default): treat as `missing` → blocks release readiness
  - `skip`: treat as allowed skip (for path-filtered jobs)

### Self-check exclusion

Checks named `Trailhead`, `Trailhead — Release Ready`, or matching `gate.check_name` are excluded from CI rollup to avoid recursion.

### Check name matching

Exact match first, then case-insensitive prefix match (e.g., `Build` matches `Build / lint`).

## Rationale

- Explicit classification avoids ambiguous GitHub API edge cases.
- `missing_required: skip` supports monorepos with path-filtered CI without false blocks.

## Consequences

- **Positive:** Predictable CI rollup across diverse workflow setups.
- **Negative:** Prefix matching may over-match similarly named checks.
- **Mitigated by:** Exact names in config; alias patterns planned for v4.2 (E3.6).
