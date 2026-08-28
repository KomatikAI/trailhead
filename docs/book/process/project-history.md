---
chapter: process/project-history
title: How Trailhead grew
description: The curated development eras that changed Trailhead's durable release-readiness contract.
section: process
owner: David
order: 10
status: current
ttl_days: 60
last_verified: 2026-08-26
verified_by: "Project Book backfill from merged Trailhead pull requests"
pins:
  - pr:1
  - pr:10
  - pr:12
  - pr:14
  - pr:16
  - pr:35
  - pr:214
  - commit:eea5848a4d978b7e77f0b598d0bf27bbfdd731c6
  - pr:216
  - pr:217
  - pr:218
  - commit:7fa9803444117335f3a6847d498614fff9f36e52
  - pr:244
  - pr:261
  - pr:263
  - pr:273
  - pr:280
  - pr:284
  - pr:314
  - pr:315
  - pr:321
  - pr:279
  - pr:301
  - pr:328
  - pr:345
  - pr:348
  - pr:349
  - commit:622c6e9255f1b124f3c0aea4102eb87d1e54b162
---

# How Trailhead grew

<a id="p-trailhead-history-founded-as-deployguard"></a>
### Founded as DeployGuard {#p-trailhead-history-founded-as-deployguard}

The April foundation combined diff-aware risk, CI orchestration, health checks, remediation, DORA evidence, deployment protection, and MCP tools. A completion audit then closed the initial high-priority gaps before later product expansion.

> since 2026-04-09 · verified 2026-08-26 · confidence ratified · sources: `pr:1`, `pr:10`, `pr:12`, `pr:14`

<a id="p-trailhead-history-became-trailhead"></a>
### DeployGuard became Trailhead {#p-trailhead-history-became-trailhead}

The April rename established Trailhead as the product identity and added an agent-facing skill. Follow-up cleanup removed stale public references and committed the generated runtime artifacts needed by packaged surfaces.

> since 2026-04-29 · verified 2026-08-26 · confidence ratified · sources: `pr:16`, `pr:35`

<a id="p-trailhead-history-v4-unified-release-readiness"></a>
### Version four unified release readiness {#p-trailhead-history-v4-unified-release-readiness}

The v4 era introduced the composite Release Ready gate, Trailhead Cloud, path-aware CI manifests, cross-repository impact, and multi-platform CI adapters. Trailhead became a configurable release product rather than only a scalar risk check.

> since 2026-05-24 · verified 2026-08-26 · confidence ratified · sources: `pr:214`, `commit:eea5848a4d978b7e77f0b598d0bf27bbfdd731c6`, `pr:216`, `pr:217`, `pr:218`

<a id="p-trailhead-history-added-coach-and-fixer"></a>
### Coach and Fixer closed the loop {#p-trailhead-history-added-coach-and-fixer}

The next era made remediation machine-readable, extracted the agent submission gate, added bounded fix planning, and connected trust to post-merge feedback. Agent work could now receive a specific next action instead of only a red or green label.

> since 2026-05-27 · verified 2026-08-26 · confidence ratified · sources: `commit:7fa9803444117335f3a6847d498614fff9f36e52`, `pr:244`, `pr:261`

<a id="p-trailhead-history-added-lifecycle-gates"></a>
### Lifecycle gates expanded the evidence boundary {#p-trailhead-history-added-lifecycle-gates}

ADR-010 added contract integrity, destructive-change evidence, claim anchoring, promotion coherence, catalog ownership, and reviewable cross-repository repair. Release readiness began checking whether a change fits its architecture and lifecycle, not only whether its syntax passed.

> since 2026-06-02 · verified 2026-08-26 · confidence ratified · sources: `pr:263`, `pr:273`

<a id="p-trailhead-history-calibrated-real-fleet-data"></a>
### Real fleet data drove calibration {#p-trailhead-history-calibrated-real-fleet-data}

Warehouse audits scoped security evidence to the PR and improved provenance and deploy correlation. Content-type calibration then reduced false blocks for documentation-heavy repositories without making migrations or executable changes invisible.

> since 2026-06-06 · verified 2026-08-26 · confidence ratified · sources: `pr:280`, `pr:284`

<a id="p-trailhead-history-cloud-became-a-product"></a>
### Cloud became a product {#p-trailhead-history-cloud-became-a-product}

The July sprint added durable Cloud storage, billing, key claiming, a customer site, and account dashboards. Immediate post-payment hardening kept billing failures distinct from gate decisions and repaired customer-facing security issues.

> since 2026-07-02 · verified 2026-08-26 · confidence ratified · sources: `pr:314`, `pr:315`, `pr:321`

<a id="p-trailhead-history-v46-closed-reconciliation-gaps"></a>
### Version 4.6 closed reconciliation gaps {#p-trailhead-history-v46-closed-reconciliation-gaps}

On-demand evaluation enabled safe historical backfill, while close-on-ship links reconnected merged PRs to fleet tasks. Head-SHA correction and full-file pagination then removed two ways that GitHub evidence could describe the wrong change.

> since 2026-07-18 · verified 2026-08-26 · confidence ratified · sources: `pr:279`, `pr:301`, `pr:328`, `pr:345`

<a id="p-trailhead-history-v47-made-decisions-readable"></a>
### Version 4.7 made decisions readable {#p-trailhead-history-v47-made-decisions-readable}

ADR-011 added the Release Brief, explicit input relevance, scoped overrides, and per-context availability. The v4.7.0 release carries that communication contract.

> since 2026-08-09 · verified 2026-08-26 · confidence ratified · sources: `pr:348`, `pr:349`

<a id="p-trailhead-current-release-docs-need-supersession"></a>
### Release docs need supersession {#p-trailhead-current-release-docs-need-supersession}

The canonical `dev` package, changelog, and GitHub release record identify v4.7.0, while older product-context and documentation-index passages still describe v4.5.2. This Book treats those older passages as history, distinguishes later `dev` repairs from the published tag, and does not imply that the older `staging` or `main` refs already contain them.

> since 2026-08-09 · verified 2026-08-26 · confidence ratified · sources: `pr:349`, `commit:622c6e9255f1b124f3c0aea4102eb87d1e54b162`
