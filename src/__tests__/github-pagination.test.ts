import { afterEach, describe, expect, it, vi } from "vitest";
import { collectGitHubPages, fetchGitHubJsonPages } from "../github-pagination.js";

describe("GitHub pagination", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("collects every page for a 214-file pull request", async () => {
    const pages = [
      Array.from({ length: 100 }, (_, index) => index),
      Array.from({ length: 100 }, (_, index) => index + 100),
      Array.from({ length: 14 }, (_, index) => index + 200),
    ];
    const fetchPage = vi.fn(async (page: number) => pages[page - 1] ?? []);

    const result = await collectGitHubPages(fetchPage);

    expect(result.items).toHaveLength(214);
    expect(result.pages).toBe(3);
    expect(result.complete).toBe(true);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("marks a full safety-ceiling page as incomplete", async () => {
    const result = await collectGitHubPages(
      async () => Array.from({ length: 100 }, (_, index) => index),
      { maxPages: 2 },
    );

    expect(result.items).toHaveLength(200);
    expect(result.complete).toBe(false);
  });

  it("sets GitHub's supported page parameters on fetch requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [1, 2] });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchGitHubJsonPages<number>(
      "https://api.github.com/repos/acme/repo/pulls/7/files?ignored=kept",
      { headers: { Authorization: "Bearer test" } },
    );

    expect(result.items).toEqual([1, 2]);
    const requested = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requested.searchParams.get("per_page")).toBe("100");
    expect(requested.searchParams.get("page")).toBe("1");
    expect(requested.searchParams.get("ignored")).toBe("kept");
  });
});
