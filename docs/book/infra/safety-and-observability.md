---
chapter: infra/safety-and-observability
title: Safety and operational truth
description: Availability, GitHub evidence, health, observability, and current integration-branch repairs.
section: infra
owner: David
order: 10
status: current
ttl_days: 30
last_verified: 2026-08-26
verified_by: "Project Book backfill from merged Trailhead pull requests"
pins:
  - pr:8
  - pr:12
  - pr:53
  - pr:328
  - pr:345
  - pr:348
  - pr:357
  - pr:358
  - pr:359
---

# Safety and operational truth

<a id="p-trailhead-availability-is-an-explicit-policy"></a>
### Availability is explicit policy {#p-trailhead-availability-is-an-explicit-policy}

Trailhead began with fail-open behavior so a broken gate would warn instead of becoming a new outage. Current policy can make production or an exact branch context fail closed, and ADR-011 records that stance beside the inputs it governs.

> since 2026-04-10 · verified 2026-08-26 · confidence ratified · sources: `pr:12`, `pr:53`, `pr:348`

<a id="p-trailhead-pr-evidence-follows-head-sha"></a>
### PR evidence follows the head SHA {#p-trailhead-pr-evidence-follows-head-sha}

Pull-request evaluation reads CI and diff evidence for the PR head rather than GitHub's synthetic merge commit. This prevents a missing-check policy from declaring readiness against the wrong revision.

> since 2026-07-21 · verified 2026-08-26 · confidence ratified · sources: `pr:328`

<a id="p-trailhead-complete-pr-files"></a>
### Large PRs require complete files {#p-trailhead-complete-pr-files}

The Action, App, MCP, and DORA paths paginate PR files instead of stopping at the first API page. Scope and risk therefore describe the complete available change rather than an arbitrary prefix.

> since 2026-07-22 · verified 2026-08-26 · confidence ratified · sources: `pr:345`

<a id="p-trailhead-observes-health-and-delivery-outcomes"></a>
### Health and delivery outcomes remain evidence {#p-trailhead-observes-health-and-delivery-outcomes}

Trailhead can combine production health checks, deployment protection, canary outcomes, DORA measurements, and telemetry export with code evidence. Those integrations inform the decision while retaining visible failure and availability semantics.

> since 2026-04-10 · verified 2026-08-26 · confidence ratified · sources: `pr:8`, `pr:12`

<a id="p-trailhead-ci-integrity-scans-added-behavior"></a>
### CI integrity scans added behavior {#p-trailhead-ci-integrity-scans-added-behavior}

CI bypass detection focuses on behavior introduced by the patch and distinguishes test fixtures or cleanup traps from executable weakening. Precision work must preserve the backstop without turning inert examples into blockers.

> since 2026-08-26 · verified 2026-08-26 · confidence ratified · sources: `pr:345`, `pr:359`

<a id="p-trailhead-dev-repairs"></a>
### Post-release repairs live on dev {#p-trailhead-dev-repairs}

The current `dev` branch contains release-train satisfiability, gate-wait, and cleanup-handler precision work merged after the v4.7.0 release. Those repairs are integration-branch state until a later release and promotion explicitly carries them.

> since 2026-08-26 · verified 2026-08-26 · confidence ratified · sources: `pr:357`, `pr:358`, `pr:359`
