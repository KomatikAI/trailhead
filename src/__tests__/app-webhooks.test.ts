import { createHmac } from "node:crypto";
// Runtime tests target the real handlers; app/ has its own TypeScript build.
const { app } = (await import(
  new URL("../../app/src/server.ts", import.meta.url).href
)) as { app: { request: (path: string, init?: RequestInit) => Promise<Response> } };
const { handleDeploymentProtectionRule } = (await import(
  new URL("../../app/src/handler.ts", import.meta.url).href
)) as {
  handleDeploymentProtectionRule: (
    payload: unknown,
    body: string,
    signature: string,
  ) => Promise<void>;
};

const writeSecret = "test-write-secret";
let sequence = 0;
let sha: string;
const payload = (changes = {}) => ({
  schema_version: 1,
  repo: "owner/repo",
  commit_sha: sha,
  generated_at: new Date().toISOString(),
  jobs: [{ name: "test", outcome: "passed" }],
  ...changes,
});
const sign = (body: string, secret = writeSecret) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
const post = (data: unknown, signature?: string) => {
  const body = JSON.stringify(data);
  return app.request("/webhook/ci-status", {
    method: "POST",
    body,
    headers: { "x-trailhead-signature-256": signature ?? sign(body) },
  });
};

beforeEach(() => {
  sha = (++sequence).toString(16).padStart(40, "0");
  vi.stubEnv("CI_WEBHOOK_SECRET", writeSecret);
  vi.stubEnv("CI_STATUS_READ_SECRET", "test-read-secret");
  vi.stubEnv("CI_ALLOWED_REPOSITORIES", "owner/repo");
  vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");
  vi.stubEnv("GITHUB_WEBHOOK_SECRET", writeSecret);
  vi.stubEnv("CANARY_WEBHOOK_SECRET", writeSecret);
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("rejects missing configuration on all mutation endpoints before side effects", async () => {
  for (const [path, key] of [
    ["/webhook", "GITHUB_WEBHOOK_SECRET"],
    ["/webhook/deploy-outcome", "CANARY_WEBHOOK_SECRET"],
    ["/webhook/ci-status", "CI_WEBHOOK_SECRET"],
  ]) {
    vi.stubEnv(key, "");
    expect((await app.request(path, { method: "POST", body: "{}" })).status).toBe(503);
  }
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects invalid or missing signatures on all mutation endpoints", async () => {
  for (const path of ["/webhook", "/webhook/deploy-outcome", "/webhook/ci-status"]) {
    expect((await app.request(path, { method: "POST", body: "{}" })).status).toBe(401);
  }
  expect(fetch).not.toHaveBeenCalled();
});
it("the actual deployment handler also rejects a missing secret", async () => {
  vi.stubEnv("GITHUB_WEBHOOK_SECRET", "");
  await expect(handleDeploymentProtectionRule({} as never, "{}", "")).rejects.toThrow(
    "Webhook secret missing",
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("stores signed fresh evidence and requires a separate read token", async () => {
  expect((await post(payload())).status).toBe(200);
  const url = `/v1/ci-status/owner/repo/${sha}`;
  expect((await app.request(url)).status).toBe(401);
  expect(
    (await app.request(url, { headers: { Authorization: `Bearer ${writeSecret}` } }))
      .status,
  ).toBe(401);
  const response = await app.request(url, {
    headers: { Authorization: "Bearer test-read-secret" },
  });
  expect(response.status).toBe(200);
  expect((await response.json()).commit_sha).toBe(sha);
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects tampered, stale, future, abbreviated and unbound observations", async () => {
  const original = payload();
  expect(
    (
      await post(
        { ...original, jobs: [{ name: "forged", outcome: "passed" }] },
        sign(JSON.stringify(original)),
      )
    ).status,
  ).toBe(401);
  for (const changes of [
    { generated_at: undefined },
    { generated_at: "2020-01-01T00:00:00Z" },
    { generated_at: new Date(Date.now() + 600_000).toISOString() },
    { commit_sha: "abc1234" },
  ])
    expect((await post(payload(changes))).status).toBe(400);
  expect((await post(payload({ repo: "other/repo" }))).status).toBe(403);
});
it("requires repository scope and reader configuration", async () => {
  vi.stubEnv("CI_ALLOWED_REPOSITORIES", "");
  expect((await post(payload())).status).toBe(503);
  vi.stubEnv("CI_ALLOWED_REPOSITORIES", "owner/repo");
  vi.stubEnv("CI_STATUS_READ_SECRET", "");
  expect((await app.request(`/v1/ci-status/owner/repo/${sha}`)).status).toBe(503);
});
it("will not replace a newer failure with an older signed success", async () => {
  const timestamp = Date.now();
  const newer = payload({
    generated_at: new Date(timestamp).toISOString(),
    jobs: [{ name: "test", outcome: "failed" }],
  });
  expect((await post(newer)).status).toBe(200);
  expect(
    (await post(payload({ generated_at: new Date(timestamp - 1000).toISOString() })))
      .status,
  ).toBe(409);
  expect((await post(newer)).status).toBe(200); // Exact retry is idempotent.
  const response = await app.request(`/v1/ci-status/owner/repo/${sha}`, {
    headers: { Authorization: "Bearer test-read-secret" },
  });
  expect((await response.json()).jobs[0].outcome).toBe("failed");
});
it("bounds webhook bodies and rejects malformed signed JSON", async () => {
  expect(
    (
      await app.request("/webhook/deploy-outcome", {
        method: "POST",
        body: "null",
        headers: { "x-signature-256": sign("null") },
      })
    ).status,
  ).toBe(400);
  const oversized = "x".repeat(256 * 1024 + 1);
  expect(
    (await app.request("/webhook/ci-status", { method: "POST", body: oversized })).status,
  ).toBe(413);
  expect(
    (
      await app.request("/webhook/ci-status", {
        method: "POST",
        body: "{",
        headers: { "x-trailhead-signature-256": sign("{") },
      })
    ).status,
  ).toBe(400);
});
