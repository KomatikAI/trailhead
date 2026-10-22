import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  externalStatusToManifest,
  fetchCiExternalStatus,
  mergeCiManifests,
  parseCiExternalWebhook,
  resolveCiManifests,
} from "../ci-external.js";
import { parseCiManifest } from "../ci-manifest.js";
import { evaluateRequiredChecks } from "../ci-core.js";

describe("parseCiExternalWebhook", () => {
  it("accepts a valid external CI payload", () => {
    const payload = parseCiExternalWebhook({
      schema_version: 1,
      commit_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      repo: "KomatikAI/trailhead",
      source: "gitlab",
      jobs: [{ name: "test", outcome: "passed" }],
    });
    expect(payload.source).toBe("gitlab");
    expect(payload.jobs).toHaveLength(1);
  });
});

describe("mergeCiManifests", () => {
  it("merges jobs from multiple manifests with later entries winning", () => {
    const merged = mergeCiManifests(
      parseCiManifest({
        schema_version: 1,
        jobs: [{ name: "Build", outcome: "passed" }],
      }),
      parseCiManifest({
        schema_version: 1,
        jobs: [{ name: "Build", outcome: "failed" }],
      }),
    );
    expect(merged?.jobs).toHaveLength(1);
    expect(merged?.jobs[0]?.outcome).toBe("failed");
  });
});

describe("externalStatusToManifest", () => {
  it("maps webhook payload to ci-manifest", () => {
    const manifest = externalStatusToManifest(
      parseCiExternalWebhook({
        schema_version: 1,
        commit_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        source: "webhook",
        jobs: [{ name: "E2E", outcome: "passed" }],
      }),
    );
    expect(manifest.schema_version).toBe(1);
    expect(manifest.workflow).toBe("webhook");
  });
});

describe("fetchCiExternalStatus", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and parses external webhook JSON", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          schema_version: 1,
          commit_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          source: "generic",
          jobs: [{ name: "Deploy", outcome: "passed" }],
        }),
        { status: 200 },
      ),
    );

    const manifest = await fetchCiExternalStatus("https://example.com/ci-status", {
      commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(manifest?.jobs[0]?.name).toBe("Deploy");
  });

  it.each([undefined, "abc1234", "b".repeat(40)])(
    "rejects missing or wrong remote SHA %s",
    async (commit_sha) => {
      vi.mocked(fetch).mockResolvedValue(
        Response.json({
          schema_version: 1,
          commit_sha,
          jobs: [{ name: "Build", outcome: "passed" }],
        }),
      );
      expect(
        await fetchCiExternalStatus("https://example.com/status", {
          commitSha: "a".repeat(40),
        }),
      ).toBeNull();
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }),
      );
    },
  );
});

describe("resolveCiManifests", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("merges GitLab adapter results with file manifest", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 42,
              sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              status: "success",
            },
          ]),
          {
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { name: "lint", status: "success", web_url: "https://gitlab.example/job/1" },
          ]),
          { status: 200 },
        ),
      );

    const manifest = await resolveCiManifests({
      commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      gitlabToken: "token",
      gitlabProjectId: "123",
      gitlabApiUrl: "https://gitlab.example/api/v4",
    });

    expect(
      manifest?.jobs.some((job) => job.name === "lint" && job.outcome === "passed"),
    ).toBe(true);
  });
});

describe("passed manifest outcome", () => {
  it("treats external passed jobs as pass when absent from GitHub Checks", () => {
    const summary = evaluateRequiredChecks(
      [],
      {
        required_checks: ["GitLab Test"],
        optional_checks: [],
        missing_required: "fail",
      },
      parseCiManifest({
        schema_version: 1,
        jobs: [{ name: "GitLab Test", outcome: "passed" }],
      }),
    );
    expect(summary.allRequiredPassed).toBe(true);
    expect(summary.checks[0]?.status).toBe("pass");
  });
});
