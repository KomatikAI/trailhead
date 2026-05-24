# Trailhead v4 Roadmap

> Tracking issue: [#213](https://github.com/KomatikAI/trailhead/issues/213)

## Vision

Transform Trailhead from a risk-scoring sidecar into a **Release Readiness Gate** — the single required check that combines CI status, risk scoring, policy, health, and security into one merge decision.

## Releases

| Release  | Theme                  | Milestone |
| -------- | ---------------------- | --------- |
| **v4.0** | Release Readiness Gate | E1–E10    |
| **v4.1** | Trailhead Cloud        | E11–E14   |
| **v4.2** | Advanced CI            | E15–E17   |

## v4.1 Epics (complete)

| Epic | Status  | Description                             |
| ---- | ------- | --------------------------------------- |
| E11  | ✅ Done | Trailhead Cloud API (`cloud/`, OpenAPI) |
| E12  | ✅ Done | Hosted dashboard + analytics API        |
| E13  | ✅ Done | Feedback, noise charts, tuning, digest  |
| E14  | ✅ Done | Marketplace tiers, metering, keys, SSO  |

## v4.0 Epics (implemented foundation)

| Epic | Status     | Description                                |
| ---- | ---------- | ------------------------------------------ |
| E1   | ✅ ADRs    | Product decisions locked (006–009)         |
| E2   | ✅ Core    | Config schema v2 (`contexts`, `gate.mode`) |
| E3   | ✅ Core    | CI orchestrator (Checks API)               |
| E4   | ✅ Core    | Composite `computeReleaseReady()`          |
| E5   | 🔶 Partial | Unified PR comment + composite check       |
| E6   | ⏳         | CLI onboarding v2                          |
| E7   | ⏳         | App + MCP parity                           |
| E8   | 🔶 Partial | Store persistence visibility               |
| E9   | ⏳         | Self-test fixtures                         |
| E10  | 🔶 Partial | Docs + migration guide                     |

## Quick start (v4)

```yaml
# .trailhead.yml
schema_version: 2

gate:
  mode: release-ready

contexts:
  - name: feature
    match:
      base_branch: [dev]
    thresholds:
      risk: 70
    ci:
      required_checks: [CI Gate, Build]
      missing_required: skip

  - name: promotion
    match:
      base_branch: [staging, main]
    thresholds:
      risk: 95
    ci:
      required_checks: [CI Gate, Build, Playwright]
```

```yaml
# workflow
- uses: KomatikAI/trailhead@v4
  with:
    gate-mode: release-ready
    wait-for-checks: true
```

Branch protection: require **`Trailhead — Release Ready`** as the single required check.

## Architecture

```
GitHub Checks API ──► ci-orchestrator.ts ──┐
                                           ├──► computeReleaseReady() ──► Check + PR comment
Risk engine + policy ──► evaluateGate() ────┘
         ▲
    context-matcher.ts ◄── .trailhead.yml contexts[]
```

## ADRs

- [ADR-006: Release Ready composite gate](./adr/006-release-ready-composite-gate.md)
- [ADR-007: Config schema v2 (contexts)](./adr/007-config-schema-v2-contexts.md)
- [ADR-008: Gate modes](./adr/008-gate-modes.md)
- [ADR-009: CI check classification](./adr/009-ci-check-classification.md)

## Migration

See [migration-v3-to-v4.md](./migration-v3-to-v4.md).
