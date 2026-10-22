import { test } from "node:test";
import assert from "node:assert/strict";
import { recordDeployment } from "./record-deploy-correlation.mjs";
const sha = "a".repeat(40);
const config = {
  repository: "owner/repo",
  storeUrl: "https://store.example",
  storeKey: "test-secret",
};
const event = {
  repository: { full_name: config.repository },
  deployment: { sha, environment: "Production", production_environment: true },
  deployment_status: {
    state: "success",
    environment: "Production",
    created_at: "2026-10-22T12:00:00Z",
  },
};
const row = {
  id: "eval-1",
  repo_id: config.repository,
  commit_sha: sha,
  gate_decision: "allow",
  release_ready: true,
  created_at: "2026-10-22T11:30:00Z",
};
function source(responses) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push({ url: new URL(url), ...options });
      if (!responses.length) throw new Error("unexpected request");
      const body = responses.shift();
      return body instanceof Response ? body : Response.json(body);
    },
  };
}
test("records only the exact full-SHA row after observed production success", async () => {
  const s = source([[row], [{ id: row.id }]]);
  assert.deepEqual(await recordDeployment(event, config, s), {
    recorded: true,
    match: "exact_sha",
  });
  assert.equal(s.calls[0].url.searchParams.get("commit_sha"), `eq.${sha}`);
  assert.equal(s.calls[0].url.searchParams.get("repo_id"), "eq.owner/repo");
  const patch = s.calls[1];
  assert.equal(patch.method, "PATCH");
  assert.equal(patch.url.searchParams.get("commit_sha"), `eq.${sha}`);
  assert.equal(
    patch.url.searchParams.get("or"),
    "(release_ready.is.null,release_ready.eq.true)",
  );
  assert.match(
    patch.url.searchParams.get("and"),
    /deployed_at.lte.2026-10-22T12:00:00.000Z/,
  );
  assert.deepEqual(JSON.parse(patch.body), {
    deploy_outcome: "success",
    deployed_at: "2026-10-22T12:00:00.000Z",
  });
  assert.ok(
    s.calls.every(
      (c) => c.redirect === "error" && c.signal && c.url.origin === config.storeUrl,
    ),
  );
});
for (const [name, change] of [
  ["branch push", () => ({ repository: event.repository })],
  [
    "failed deployment",
    (e) => {
      e.deployment_status.state = "failure";
      return e;
    },
  ],
  [
    "preview",
    (e) => {
      e.deployment.production_environment = false;
      return e;
    },
  ],
  [
    "different environment",
    (e) => {
      e.deployment_status.environment = "staging";
      return e;
    },
  ],
  [
    "short SHA",
    (e) => {
      e.deployment.sha = "abc1234";
      return e;
    },
  ],
  [
    "foreign repo",
    (e) => {
      e.repository.full_name = "other/repo";
      return e;
    },
  ],
])
  test(`does not query or mutate on ${name}`, async () => {
    const s = source([]);
    assert.equal(
      (await recordDeployment(change(structuredClone(event)), config, s)).recorded,
      false,
    );
    assert.equal(s.calls.length, 0);
  });
for (const fields of [
  { release_ready: false },
  { gate_decision: "block" },
  { release_ready: "false" },
]) {
  test(`does not mark blocked evaluation deployed: ${JSON.stringify(fields)}`, async () => {
    const s = source([[{ ...row, ...fields }]]);
    assert.equal(
      (await recordDeployment(event, { ...config, fallbackHours: 1 }, s)).reason,
      "evaluation_not_ready",
    );
    assert.equal(s.calls.length, 1); // Never fall back past an exact blocked row.
  });
}
test("supports legacy null readiness only with a non-blocking gate", async () => {
  const s = source([[{ ...row, release_ready: null }], [{ id: row.id }]]);
  assert.equal((await recordDeployment(event, config, s)).recorded, true);
});
test("does not use a time window by default", async () => {
  const s = source([[]]);
  assert.equal((await recordDeployment(event, config, s)).reason, "no_evaluation");
  assert.equal(s.calls.length, 1);
});
test("bounded opt-in fallback keeps repository and both time bounds", async () => {
  const s = source([[], [{ ...row, commit_sha: "b".repeat(40) }], [{ id: row.id }]]);
  assert.equal(
    (await recordDeployment(event, { ...config, fallbackHours: "1" }, s)).match,
    "time_window",
  );
  assert.deepEqual(s.calls[1].url.searchParams.getAll("created_at"), [
    "lte.2026-10-22T12:00:00.000Z",
    "gte.2026-10-22T11:00:00.000Z",
  ]);
  assert.equal(s.calls[2].url.searchParams.get("commit_sha"), `eq.${"b".repeat(40)}`);
});
test("ambiguous fallback never writes", async () => {
  const s = source([[], [row, { ...row, id: "eval-2" }]]);
  assert.equal(
    (await recordDeployment(event, { ...config, fallbackHours: 1 }, s)).reason,
    "ambiguous_match",
  );
  assert.equal(s.calls.length, 2);
});
test("rejects wrong identity returned by the store", async () => {
  for (const changed of [
    { commit_sha: "b".repeat(40) },
    { repo_id: "other/repo" },
    { created_at: "2026-10-23T00:00:00Z" },
  ]) {
    const s = source([[{ ...row, ...changed }]]);
    await assert.rejects(recordDeployment(event, config, s), /identity_mismatch/);
    assert.equal(s.calls.length, 1);
  }
});
test("changed eligibility or newer deployment does not report a write", async () => {
  const s = source([[row], []]);
  assert.deepEqual(await recordDeployment(event, config, s), {
    recorded: false,
    reason: "evaluation_changed",
  });
});
test("rejects unsafe config before any request", async () => {
  for (const changed of [
    { fallbackHours: -1 },
    { fallbackHours: 25 },
    { fallbackHours: "bad" },
    { storeUrl: "http://store.example" },
    { storeUrl: "https://user:secret@store.example" },
  ]) {
    const s = source([]);
    await assert.rejects(recordDeployment(event, { ...config, ...changed }, s));
    assert.equal(s.calls.length, 0);
  }
});
test("failed store reads cannot reach the PATCH", async () => {
  const s = source([new Response("secret-error", { status: 503 })]);
  await assert.rejects(recordDeployment(event, config, s), /store_http_503/);
  assert.equal(s.calls.length, 1);
});
