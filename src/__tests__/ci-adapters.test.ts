import { describe, it, expect } from "vitest";
import {
  circleCiJobsToManifestJobs,
  mapCircleCiJobStatus,
  fetchCircleCiManifest,
} from "../ci-adapters/circleci.js";
import {
  fetchGitLabCiManifest,
  gitLabJobsToManifestJobs,
  mapGitLabJobStatus,
} from "../ci-adapters/gitlab.js";
import { vi } from "vitest";

describe("GitLab adapter", () => {
  it("maps GitLab job statuses to manifest outcomes", () => {
    expect(mapGitLabJobStatus("success")).toBe("passed");
    expect(mapGitLabJobStatus("failed")).toBe("failed");
    expect(mapGitLabJobStatus("running")).toBe("pending");
  });

  it("converts GitLab jobs to manifest jobs", () => {
    const jobs = gitLabJobsToManifestJobs([
      { name: "rspec", status: "success", web_url: "https://gitlab.example/job/1" },
    ]);
    expect(jobs[0]?.outcome).toBe("passed");
    expect(jobs[0]?.details_url).toContain("gitlab.example");
  });
});

describe("external provider identity and complete results", () => {
  const sha = "a".repeat(40);
  const circle = { token: "test-token", projectSlug: "gh/owner/repo", commitSha: sha };
  const gitlab = {
    token: "test-token",
    projectId: "owner/repo",
    apiUrl: "https://gitlab.example/api/v4",
    commitSha: sha,
  };
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("collects all CircleCI workflows/pages and preserves a same-named failure", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({
          items: [{ id: "short", vcs: { revision: "aaaaaaa" } }],
          next_page_token: "next",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ items: [{ id: "correct", vcs: { revision: sha } }] }),
      )
      .mockResolvedValueOnce(
        Response.json({ items: [{ id: "one", name: "one" }], next_page_token: "more" }),
      )
      .mockResolvedValueOnce(Response.json({ items: [{ id: "two", name: "two" }] }))
      .mockResolvedValueOnce(
        Response.json({
          items: [{ name: "Test", status: "success" }],
          next_page_token: "jobs",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ items: [{ name: "Build", status: "success" }] }),
      )
      .mockResolvedValueOnce(
        Response.json({ items: [{ name: "Test", status: "failed" }] }),
      );
    const result = await fetchCircleCiManifest(circle);
    expect(result?.commit_sha).toBe(sha);
    expect(result?.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Test", outcome: "failed" }),
        expect.objectContaining({ name: "Build", outcome: "passed" }),
      ]),
    );
    expect(fetch).toHaveBeenCalledTimes(7);
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain("page-token=next");
    expect(String(vi.mocked(fetch).mock.calls[2][0])).toContain("pipeline/correct/");
  });
  it("rejects abbreviated CircleCI revisions", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ items: [{ id: "wrong", vcs: { revision: "aaaaaaa" } }] }),
    );
    expect(await fetchCircleCiManifest(circle)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("uses the latest rerun of each workflow and stops after locating the pipeline", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({
          items: [{ id: "pipeline", vcs: { revision: sha } }],
          next_page_token: "unrelated-old-pipelines",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          items: [
            { id: "old", name: "tests", created_at: "2026-10-22T10:00:00Z" },
            { id: "new", name: "tests", created_at: "2026-10-22T11:00:00Z" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ items: [{ name: "Test", status: "success" }] }),
      );
    expect((await fetchCircleCiManifest(circle))?.jobs[0].outcome).toBe("passed");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(String(vi.mocked(fetch).mock.calls[2][0])).toContain("workflow/new/job");
  });
  it("never returns partial CircleCI jobs when a page fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({ items: [{ id: "one", vcs: { revision: sha } }] }),
      )
      .mockResolvedValueOnce(Response.json({ items: [{ id: "workflow", name: "test" }] }))
      .mockResolvedValueOnce(
        Response.json({
          items: [{ name: "Test", status: "success" }],
          next_page_token: "more",
        }),
      )
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    expect(await fetchCircleCiManifest(circle)).toBeNull();
  });
  it("stops repeated CircleCI pagination tokens", async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      Response.json({ items: [], next_page_token: "same" }),
    );
    expect(await fetchCircleCiManifest(circle)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("refuses a GitLab pipeline whose returned SHA does not match", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json([{ id: 1, sha: "b".repeat(40) }]));
    expect(await fetchGitLabCiManifest(gitlab)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("includes failing GitLab jobs beyond page one", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json([{ id: 1, sha }]))
      .mockResolvedValueOnce(
        Response.json([{ name: "Build", status: "success" }], {
          headers: { "x-next-page": "2" },
        }),
      )
      .mockResolvedValueOnce(Response.json([{ name: "Test", status: "failed" }]));
    const result = await fetchGitLabCiManifest(gitlab);
    expect(result?.jobs[1].outcome).toBe("failed");
    expect(String(vi.mocked(fetch).mock.calls[2][0])).toContain("page=2");
    for (const call of vi.mocked(fetch).mock.calls)
      expect(call[1]).toMatchObject({
        redirect: "error",
        signal: expect.any(AbortSignal),
      });
  });
  it("rejects unsafe provider URLs and short requested SHAs before sending tokens", async () => {
    expect(
      await fetchCircleCiManifest({ ...circle, apiUrl: "http://example.com" }),
    ).toBeNull();
    expect(
      await fetchGitLabCiManifest({
        ...gitlab,
        apiUrl: "https://user:secret@example.com",
      }),
    ).toBeNull();
    expect(await fetchGitLabCiManifest({ ...gitlab, commitSha: "aaaaaaa" })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves a GitLab failure when jobs collide by name", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json([{ id: 1, sha }]))
      .mockResolvedValueOnce(
        Response.json([
          { name: "Test", status: "failed" },
          { name: "test", status: "success" },
        ]),
      );
    expect((await fetchGitLabCiManifest(gitlab))?.jobs).toEqual([
      expect.objectContaining({ name: "Test", outcome: "failed" }),
    ]);
  });
  it("rejects incomplete GitLab pages instead of retaining earlier successes", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json([{ id: 1, sha }]))
      .mockResolvedValueOnce(
        Response.json([{ name: "Build", status: "success" }], {
          headers: { "x-next-page": "2" },
        }),
      )
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    expect(await fetchGitLabCiManifest(gitlab)).toBeNull();
  });
});

describe("CircleCI adapter", () => {
  it("maps CircleCI job statuses to manifest outcomes", () => {
    expect(mapCircleCiJobStatus("success")).toBe("passed");
    expect(mapCircleCiJobStatus("failed")).toBe("failed");
    expect(mapCircleCiJobStatus("running")).toBe("pending");
    expect(mapCircleCiJobStatus("not_run")).toBe("pending");
  });

  it("converts CircleCI jobs to manifest jobs", () => {
    const jobs = circleCiJobsToManifestJobs([
      { name: "build", status: "success", web_url: "https://circleci.com/job/1" },
    ]);
    expect(jobs[0]?.outcome).toBe("passed");
  });
});
