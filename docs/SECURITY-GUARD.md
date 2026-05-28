# security-guard — the autonomous-merge backstop

## Why

As the fleet moves toward autonomous PR authoring and **soak-then-merge**, a
poisoned-but-plausible change must not be able to land with no human in the loop.

The motivating incident (2026-05-27): a fleet message relayed a **real** CVE
(`CVE-2026-48710`, Starlette host-header auth bypass) — but the actual instruction
buried in it was _"run the BadHost scanner against both services."_ The malice was
in the **remediation action**, not the claim. A "is this a real CVE?" check passes;
corroboration passes. The only thing that catches it is gating the **action class**
in the diff — and refusing to auto-merge it without a human.

`security-guard` is that gate. It is deliberately a **Trailhead** concern: Trailhead
is the PR/release gate (runtime/agent-side guardrails are a separate Frontier layer).

## What it does

A single CI job (`security-guard`) scans the PR's diff, body, and commit messages
and classifies findings:

| Rule                        | Level            | Fires when                                                                                                                                                                                                      |
| --------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetch-and-execute`         | **BLOCK**        | An added line downloads-and-runs (`curl … \| sh`, `bash <(curl …)`, `iwr … \| iex`, `base64 -d … \| sh`, …)                                                                                                     |
| `ci-workflow-change`        | **BLOCK**        | The PR edits `.github/workflows/**`, `.github/actions/**`, or an `action.yml` (a malicious workflow can exfiltrate secrets)                                                                                     |
| `external-advisory-cited`   | **BLOCK**        | PR title/body/commits cite a CVE/GHSA/PYSEC id or urgency phrasing ("patch immediately", "run the X scanner", "auth bypass", "RCE") — the diff may be fine, but a human must confirm the _fix_ isn't the attack |
| `fleet-critical-dependency` | **BLOCK**        | A dependency manifest bumps a load-bearing package (`starlette`, `uvicorn`, `fastapi`, `litellm`, `vllm`, `gunicorn`, `anthropic`, `openai`) — coordinated, compat-checked upgrade only                         |
| `dependency-change`         | **WARN** → BLOCK | Any dep/lockfile change. WARN normally; **BLOCK** when the same PR is advisory-cited                                                                                                                            |
| `new-outbound-domain`       | **WARN**         | An added line references a host outside the build/CI allowlist                                                                                                                                                  |

Any **BLOCK** finding fails the check. Ordinary dependency bumps and new outbound
domains only warn, so everyday PRs aren't gummed up — the gate is tuned to stop the
_autonomous-merge-of-a-poisoned-fix_ case, not to nag.

### The human override

A maintainer who has reviewed the change adds the **`security-reviewed`** label to
the PR. The next run downgrades all BLOCK findings to advisory and the check passes.
This is the only clear path — there is no admin-merge bypass (`gh pr merge --admin`
to `master` is disabled fleet-wide), and CI never grants itself the label
(permissions are read-only).

## ⛓️ The sequencing lock (most important)

**Autonomous soak-then-merge must not be enabled on any repo until `security-guard`
is a _required_ status check on that repo's protected branches.** Otherwise the
backstop is bypassable by definition — a soak timer alone would merge a blocked PR.

Today no repo has required status checks (they're configured in the GitHub UI / org
settings, not in-repo). So the order of operations is:

1. Land this workflow on `dev` → `staging` → `main`.
2. Wire it into each repo that will gain autonomy (below).
3. Mark `security-guard` **required** on the protected branches.
4. _Only then_ turn on auto-merge / soak.

Make it required (per branch):

```bash
gh api -X PATCH repos/KomatikAI/<repo>/branches/<branch>/protection/required_status_checks \
  -f 'checks[][context]=security-guard'
```

(or add `security-guard` under Branch protection → Require status checks in the UI.)

## Consuming it from another repo

`security-guard.yml` runs standalone on `pull_request` in this repo, and exposes a
`workflow_call` entry for reuse. A consumer repo adds one thin caller workflow:

```yaml
# .github/workflows/security-guard.yml
name: security-guard
on:
  pull_request:
    branches: [dev, staging, main]
jobs:
  guard:
    uses: KomatikAI/trailhead/.github/workflows/security-guard.yml@dev
```

The job name surfaced for branch protection is `security-guard / security-guard`
(caller job → reusable job); use whatever the Checks tab shows when you mark it
required.

## Tuning

- **`FLEET_CRITICAL`** and **`OUTBOUND_ALLOWLIST`** live at the top of
  `scripts/security-guard.mjs`. Keep `FLEET_CRITICAL` short and intentional — every
  entry hard-blocks a version bump.
- The script is zero-dependency Node 24 (ESM) and reads GitHub context from
  `$GITHUB_EVENT_PATH`. Run it locally against a branch with
  `node scripts/security-guard.mjs` (diffs against `origin/<base>`).

## Scope / where this sits

This is **Layer 2** of a three-layer defense (see the umbrella plan):

- **Layer 0 — ingress**: web-sweep / knowledge-scout treat scraped imperatives as
  _data_, never forward them as action items (where today's message leaked through).
- **Layer 1 — Frontier runtime**: the acting agent's non-overridable denylist
  (fetch-and-execute, prod-service mutation, fleet-critical bumps never autonomous;
  security changes need authoritative corroboration that is _not_ the requesting
  source + human sign-off).
- **Layer 2 — Trailhead** (this): the PR gate that no autonomous merge can skip.

Neither layer is trusted alone; this is the backstop because the runtime gate can be
jailbroken.
