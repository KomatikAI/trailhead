# ADR-008: Gate Modes

**Status:** Accepted
**Date:** 2026-05-23
**Author:** Trailhead team

## Context

Not all consumers want Trailhead to block merges. Some want advisory visibility; others want v3 risk-only behavior during migration.

## Decision

Three gate modes, configured via `gate.mode` in `.trailhead.yml` or the `gate-mode` action input (input overrides config):

| Mode            | Blocks merge?                 | Reads CI?      | Check conclusion                                |
| --------------- | ----------------------------- | -------------- | ----------------------------------------------- |
| `release-ready` | Yes on composite fail         | Yes            | success / failure from `releaseReady`           |
| `advisory`      | Never                         | Yes            | Always neutral                                  |
| `risk-only`     | Yes on risk/policy block only | No (v3 compat) | success / neutral / failure from `gateDecision` |

**Defaults:**

- New v2 configs: `release-ready`
- v1 configs (no `gate` section): `risk-only`
- Action input `gate-mode` overrides config when set

## Rationale

- `release-ready` is the v4 product default and matches the "one-stop shop" vision.
- `advisory` enables gradual rollout — teams see CI + risk rollup without blocking.
- `risk-only` preserves v3 behavior for existing consumers during migration.

## Consequences

- **Positive:** Clear migration path: risk-only → advisory → release-ready.
- **Negative:** Three code paths to test.
- **Mitigated by:** Fixture suite (E9) and self-test workflow.
