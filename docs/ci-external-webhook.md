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
  "commit_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "generated_at": "2026-10-22T12:00:00.000Z",
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

| Field            | Description                                                                             |
| ---------------- | --------------------------------------------------------------------------------------- |
| `commit_sha`     | Full 40-character lowercase Git SHA; must match the GitHub PR head exactly              |
| `generated_at`   | Actual observation timestamp; App ingest requires it within five minutes of server time |
| `repo`           | `owner/name` — required unless `GITHUB_REPOSITORY` is set on the App                    |
| `source`         | `generic`, `gitlab`, `circleci`, or `webhook`                                           |
| `jobs[].outcome` | `passed`, `failed`, `skipped`, `pending`, `cancelled`, or `ran`                         |

Use **`passed`** for external jobs that succeeded but never publish a GitHub Check run.

## Trailhead App endpoints

### POST `/webhook/ci-status`

Ingest external CI status. **Required** HMAC verification with `CI_WEBHOOK_SECRET`
and header `x-trailhead-signature-256: sha256=<hex digest>` over the exact raw JSON
bytes. Missing configuration returns 503, invalid signatures return 401, and
bodies over 256 KiB return 413. Configure `CI_ALLOWED_REPOSITORIES` as an exact
comma-separated `owner/repo` allowlist (or a single `GITHUB_REPOSITORY`). Requests
outside this scope return 403.

An older/conflicting observation cannot replace a newer one for the same repo/SHA
(409); retrying an identical payload is idempotent. Generate timestamps when the
trusted reporter observes provider results, never when replaying an old artifact.
The example timestamp above is illustrative, not valid fresh evidence.

### GET `/v1/ci-status/:owner/:repo/:sha`

Requires `Authorization: Bearer <CI_STATUS_READ_SECRET>`, a separate read token,
and an allowed repository. Configure the Action's `ci-external-status-secret`
with this read token, not the HMAC write secret. Missing reader configuration
returns 503; invalid credentials return 401. Returns the latest stored payload
for the full commit SHA (7-day in-memory TTL by default). A restart loses this
ephemeral data; missing evidence remains missing rather than a synthetic pass.

### Trusted publisher example (Node 22)

Produce `ci-status.json` from actual provider job results in trusted CI. Do not
accept a PR-supplied artifact as proof, invent passed jobs, or infer sibling job
outcomes from the reporter's own status. Sign and send the exact file bytes:

```js
import { readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
const body = await readFile("ci-status.json", "utf8");
const secret = process.env.TRAILHEAD_CI_WEBHOOK_SECRET;
if (!secret) throw new Error("CI signing secret required");
const url = new URL(process.env.TRAILHEAD_CI_WEBHOOK_URL);
if (url.protocol !== "https:" || url.username || url.password)
  throw new Error("Use the trusted HTTPS CI webhook URL");
const signature = createHmac("sha256", secret).update(body).digest("hex");
const response = await fetch(url, {
  method: "POST",
  body,
  redirect: "error",
  signal: AbortSignal.timeout(10_000),
  headers: {
    "Content-Type": "application/json",
    "x-trailhead-signature-256": `sha256=${signature}`,
  },
});
if (!response.ok) throw new Error(`CI status rejected (${response.status})`);
```

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

Remote status payloads must identify the exact requested full SHA; missing,
abbreviated or mismatched identities are rejected. The HTTP clients reject
redirects, require HTTPS and apply request deadlines. GitLab verifies the returned
pipeline SHA and follows job pages. CircleCI finds the latest exact-SHA pipeline,
reads every workflow/job page (bounded to ten pages per list), and selects the
latest timestamped rerun of each workflow. Same-named jobs across remaining
workflows retain the worst outcome. Failed/incomplete pagination supplies no
manifest. Configure mandatory external jobs with `missing_required: fail`.

The examples below use direct provider polling so an unsigned reporting job or
hard-coded passed result cannot masquerade as CI evidence. Provider reference:
[CircleCI pagination](https://circleci.com/docs/guides/toolkit/api-developers-guide/),
[GitLab pipeline jobs](https://docs.gitlab.com/api/jobs/#list-all-jobs-by-pipeline).

## GitLab pipeline example

See [`examples/gitlab-ci/trailhead.gitlab-ci.yml`](../examples/gitlab-ci/trailhead.gitlab-ci.yml) — defines real lint/test jobs for the Action's GitLab adapter to read.

## CircleCI example

See [`examples/circleci/trailhead.circleci.yml`](../examples/circleci/trailhead.circleci.yml).

## Related

- [CI manifest](ci-manifest.md) — path-filter skip semantics on GitHub Actions
- [ADR-009: CI check classification](adr/009-ci-check-classification.md)
