# Trailhead — Product Context

> Canonical cross-product map: `komatik-agents/PRODUCT-MAP.md`.

**Internal Komatik use:** Agent PR gate on KomatikAI/agents — risk/quality + Gate 1 submission checks (`submission-gate: true`). **Jun 2026:** v4.5.2 ships content-type risk calibration for docs/suggestion repos; warehouse analytics (`submission_checks`, `verdict`, `gate_mode`) live on komatik.ai store. B4 soak counter **reset** — pre–Jun 6 store rows are invalid for the submission flip criterion. See `docs/agents-submission-soak.md`.

**External product (what we sell):** Anyone uses Trailhead's logic + architecture to check **their own** personal agents' work — same submission engine, trust scoring, and MCP tools (`validate-submission`, `apply-autofix`, `get-trust-score`).

## Current release

| Item             | Value                                                        |
| ---------------- | ------------------------------------------------------------ |
| Production tag   | **v4.5.2** (`@v4` floating)                                  |
| npm CLI          | `@komatikai/trailhead@4.5.2`                                 |
| Fleet pin policy | Explicit `@v4.5.2` tags (not assumed from `@v4`)             |
| Agents soak      | `submission.mode: warn` — flip after query script says ready |

## Rule

This repo ships a **platform-agnostic** product for an end user. Komatik-specific
functionality (Komatik's Supabase project `sdmfolczsaqiyararqwh`, its RPCs, service-role
keys, prebuild hooks, repo lists) is **internal dogfood only** — gate it behind an instance
flag (e.g. `KOMATIK_INSTANCE`) or parameterize it per-user; never let it leak into shippable
paths. **"Works for Komatik" = validation, not the deliverable.** Komatik the platform is the
IP centerpiece; these products are spokes that ship for general use.

## Release sequencing (warehouse + soak)

1. Tag Trailhead release (producer emits analytics fields).
2. Pin fleet consumers explicitly.
3. Promote Komatik store migration + mapper.
4. Ship risk calibration for docs-heavy repos.
5. Accrue soak on clean data; flip submission mode when measured FP < 10%.
