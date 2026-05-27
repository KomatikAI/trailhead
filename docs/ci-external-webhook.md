# External CI Webhook (E17)

Trailhead v4.2+ can merge **non-GitHub CI** job status into the Release Ready gate. Use this when required checks run on GitLab, CircleCI, or another platform while the merge gate runs on GitHub.

## Flow

```
GitLab / CircleCI / custom CI
        │ POST /webhook/ci-status (Trailhead App)
        ▼
   ci-status store
        │ GET /v1/ci-status/:owner/:repo/:sha
        ▼
GitHub Action (ci-external-status-url) ──► merge with GitHub Checks + ci-manifest
        ▼
   Release Ready decision
```

Alternatively, poll GitLab or CircleCI directly from the Action using `gitlab-*` or `circleci-*` inputs.

## Webhook payload (v1)

See [`schemas/ci-webhook.v1.json`](schemas/ci-webhook.v1.json).

```json
{
  "schema_version": 1,
  "commit_sha": "abc1234567890deadbeef",
  "repo": "KomatikAI/trailhead",
  "source": "gitlab",
  "jobs": [
    {
      "name": "lint",
      "outcome": "passed",
      "details_url": "https://gitlab.com/.../jobs/1"
    },
    {
      "name": "test",
      "outcome": "failed",
      "details_url": "https://gitlab.com/.../jobs/2"
    }
  ]
}
```

| Field            | Description                                                            |
| ---------------- | ---------------------------------------------------------------------- |
| `commit_sha`     | Git commit the external CI ran against (must match GitHub PR head SHA) |
| `repo`           | `owner/name` — required unless `GITHUB_REPOSITORY` is set on the App   |
| `source`         | `generic`, `gitlab`, `circleci`, or `webhook`                          |
| `jobs[].outcome` | `passed`, `failed`, `skipped`, `pending`, `cancelled`, or `ran`        |

Use **`passed`** for external jobs that succeeded but never publish a GitHub Check run.

## Trailhead App endpoints

### POST `/webhook/ci-status`

Ingest external CI status. Optional HMAC verification with `CI_WEBHOOK_SECRET` and header `x-trailhead-signature-256` (same algorithm as deploy outcome webhooks).

### GET `/v1/ci-status/:owner/:repo/:sha`

Returns the latest stored webhook payload for the commit (7-day TTL by default).

## GitHub Action inputs

```yaml
- uses: KomatikAI/trailhead@v4
  with:
    gate-mode: release-ready
    ci-external-status-url: https://trailhead-app.example/v1/ci-status/KomatikAI/trailhead/{sha}
    ci-external-status-secret: ${{ secrets.TRAILHEAD_CI_STATUS_SECRET }}
```

Or poll GitLab / CircleCI directly:

```yaml
gitlab-api-url: https://gitlab.com/api/v4
gitlab-token: ${{ secrets.GITLAB_TOKEN }}
gitlab-project-id: "12345678"
circleci-token: ${{ secrets.CIRCLECI_TOKEN }}
circleci-project-slug: gh/KomatikAI/trailhead
```

All external sources merge with `ci-manifest-path` and GitHub Checks API results. Later sources override job names that collide.

## GitLab pipeline example

See [`examples/gitlab-ci/trailhead.gitlab-ci.yml`](../examples/gitlab-ci/trailhead.gitlab-ci.yml) — posts job outcomes to the webhook after pipeline jobs complete.

## CircleCI example

See [`examples/circleci/trailhead.circleci.yml`](../examples/circleci/trailhead.circleci.yml).

## Related

- [CI manifest](ci-manifest.md) — path-filter skip semantics on GitHub Actions
- [ADR-009: CI check classification](adr/009-ci-check-classification.md)
