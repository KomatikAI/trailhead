# ADR-007: Config Schema v2 (Contexts)

**Status:** Accepted
**Date:** 2026-05-23
**Author:** Trailhead team

## Context

Trailhead v3 supports `environments` for per-environment thresholds and `profiles` for file-based risk weight overrides. Neither supports branch-aware policy — consumers hack per-workflow `risk-threshold` inputs for promotion vs feature PRs.

## Decision

Introduce `schema_version: 2` with two new top-level concepts:

### `gate`

```yaml
gate:
  mode: release-ready # release-ready | advisory | risk-only
  check_name: "Trailhead — Release Ready"
```

### `contexts[]`

Branch/promotion-aware policy. First matching context wins.

```yaml
contexts:
  - name: feature
    match:
      base_branch: [dev, develop]
    thresholds:
      risk: 70
      warn: 55
    ci:
      required_checks: [CI Gate, Build]
      optional_checks: [Playwright]
      missing_required: skip

  - name: promotion
    match:
      base_branch: [staging, main, master]
    environment: production
    thresholds:
      risk: 95
      warn: 80
    ci:
      required_checks: [CI Gate, Build, Playwright, Security Gate]
      missing_required: fail
```

### Distinction from `profiles`

| Feature        | Purpose                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `profiles`     | File-pattern weight overrides (risk factor tuning)                                              |
| `contexts`     | Branch/label policy — thresholds, CI requirements, environment                                  |
| `environments` | Named deployment targets — still used for threshold overrides when `context.environment` is set |

v1 configs (`schema_version: 1` or omitted) continue to parse unchanged with `gate.mode: risk-only` implied.

## Rationale

- Promotion PRs to `staging`/`main` need different thresholds and CI expectations than feature PRs to `dev`.
- Context matching is declarative — no workflow input duplication.

## Consequences

- **Positive:** Single `.trailhead.yml` encodes full release policy.
- **Negative:** Config complexity increases; migration guide required.
- **Mitigated by:** v1 backward compatibility; `trailhead init` generates v2 templates.

## Example v2 config

See `examples/policy-pack/trailhead-starter.progressive.v2.yml`.
