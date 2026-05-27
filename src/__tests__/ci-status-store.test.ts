import { describe, it, expect } from "vitest";
import { parseCiExternalWebhook } from "../ci-external.js";
import { CiStatusStore } from "../ci-status-store.js";

describe("CiStatusStore", () => {
  it("stores and retrieves CI status by repo and commit sha", () => {
    const store = new CiStatusStore(60_000);
    const payload = parseCiExternalWebhook({
      schema_version: 1,
      commit_sha: "abc1234567890",
      repo: "KomatikAI/trailhead",
      source: "webhook",
      jobs: [{ name: "test", outcome: "passed" }],
    });

    store.put("KomatikAI/trailhead", "abc1234567890", payload);
    const entry = store.get("KomatikAI/trailhead", "abc1234567890");
    expect(entry?.payload.jobs[0]?.name).toBe("test");
  });
});
