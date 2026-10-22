# Open-item closeout — 2026-10-22

The live inventory contained 50 open Trailhead issues. Nine bounded tickets were
closed after checking existing merged implementation at
`a9ace35454557d8e2d6977ca75896e470e9d587b`: #68, #139, #143, #144, #145, #147,
#164, #167 and #178. Their issue bodies now link immutable implementation and
regression evidence. Closing them does not establish production or fleet readiness.

## Fixes in this follow-up

| Issue      | Gap and change                                                                                                                                                                                                                                                        | Verification                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| #166       | Tracker treated a push as deployment success, passed a filter as a curl URL, and lost explicit false readiness through jq fallback. Require a real production success event, exact repository/full SHA, bounded opt-in unambiguous fallback, and conditional updates. | Offline collector tests exercise event identity, false/block guards, stale outcomes, fallback bounds and failed stores. No production writes. |
| #148       | Slack text lacked CI counts and legacy webhooks lacked readiness. Both payload forms now expose the evaluation CI summary and readiness; text distinguishes blocking failures/pending checks.                                                                         | Both webhook forms tested, including false readiness.                                                                                         |
| #154, #181 | Missing branch-protection guide; migration instructed removing old checks before verifying the composite. Add a staged migration, publishing-app validation and explicit preservation of independent guards.                                                          | Compared with current GitHub documentation and existing Action policy. No branch settings changed.                                            |
| #173       | No explicit already-green latency regression. Add a no-poll test and 50-sample p95 overhead budget under 15 seconds.                                                                                                                                                  | Mocked GitHub responses isolate orchestration overhead; this is not a network or live-provider latency measurement.                           |

The root suite also verifies non-default evaluation-store retry input wiring.
Action runtime output is rebuilt for the notification change.

## Remaining work in priority order

- **Production promotion #373:** reviewed code is still awaiting the live billing
  prerequisites and required approvals. No production merge is implied here.
- **Lodge #343:** validator #374 is merged. Lodge draft #210 implements independent
  deployment/policy/health collection and trusted check publication; all functional
  CI checks pass, while existing dependency audit findings remain. The authoritative
  canary-evidence service, scoped credentials, real debit/refund/usage/top-up and
  fault canaries, health bootstrap and required-check activation remain outstanding.
- **External CI #114/#211/#212:** adapter code and examples exist, but review found
  the App accepts unsigned status writes when its secret is unset. CircleCI also
  accepts abbreviated SHA matches and selects only the first workflow. These need
  fixes and regression evidence before the umbrella can be called complete.
- **Calibration #350 and fleet #229/#223:** real human classifications, consecutive
  clean promotions, reconciled active inventory and per-repository telemetry are
  required. Code tests or a green version-pin audit cannot replace those records.
- **Remaining bounded features #133/#140/#159/#161/#165:** verify or complete legacy
  status fallback, explicit override dimensions, MCP CI waiting/tool documentation,
  and opt-in artifact recovery. These were not closed based on adjacent features.
- **Historical epics #69–#90 (excluding closed #68), #91 and cross-repo #38:** retain
  pending acceptance-by-acceptance audit. Some include pilot metrics or operational
  demonstrations that source presence cannot establish. The original inventory and
  roadmap remain in [the readiness audit](./readiness-audit-2026-10-22.md).

No enforcement mode, protected-branch rule, live credential, deployment or billing
configuration was changed by this closeout.
