---
chapter: platform/product-surfaces
title: Trailhead product surfaces
description: How the Action, CLI, App, MCP server, and Cloud expose one release-readiness product.
section: platform
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
  - commit:eea5848a4d978b7e77f0b598d0bf27bbfdd731c6
  - pr:220
  - pr:246
  - pr:314
  - pr:315
---

# Trailhead product surfaces

<a id="p-trailhead-action-is-the-primary-gate"></a>
### Action is the primary gate {#p-trailhead-action-is-the-primary-gate}

The GitHub Action evaluates a pull request in its native workflow and publishes the release decision back to GitHub. Repositories adopt it through a workflow and policy file rather than installing a separate control-plane service.

> since 2026-04-09 · verified 2026-08-26 · confidence ratified · sources: `pr:1`

<a id="p-trailhead-cli-configures-and-diagnoses"></a>
### CLI configures and diagnoses {#p-trailhead-cli-configures-and-diagnoses}

The CLI creates audience-appropriate configuration and can diagnose policy or check-name mismatches before a team relies on the gate. It supports local setup without becoming a second scoring engine.

> since 2026-05-27 · verified 2026-08-26 · confidence ratified · sources: `pr:220`

<a id="p-trailhead-app-protects-deployments"></a>
### App protects deployments {#p-trailhead-app-protects-deployments}

The optional GitHub App applies the shared decision system to deployment protection rules and webhook-driven flows. It consumes shared risk and remediation modules rather than defining a separate product policy.

> since 2026-04-10 · verified 2026-08-26 · confidence ratified · sources: `pr:12`

<a id="p-trailhead-mcp-makes-evidence-agent-readable"></a>
### MCP makes evidence agent-readable {#p-trailhead-mcp-makes-evidence-agent-readable}

The MCP server exposes health, evaluation, submission, remediation, autofix-planning, and trust tools to agent clients. MCP parity makes the gate's evidence usable in an agent loop without granting direct production deployment authority.

> since 2026-05-29 · verified 2026-08-26 · confidence ratified · sources: `pr:10`, `pr:246`

<a id="p-trailhead-cloud-adds-durable-organization-memory"></a>
### Cloud adds durable organization memory {#p-trailhead-cloud-adds-durable-organization-memory}

Trailhead Cloud stores evaluations for trend analysis, dashboards, feedback, and organization-level billing. Local risk evaluation remains usable without Cloud, and store or billing availability does not redefine the gate result.

> since 2026-05-24 · verified 2026-08-26 · confidence ratified · sources: `commit:eea5848a4d978b7e77f0b598d0bf27bbfdd731c6`, `pr:314`, `pr:315`
