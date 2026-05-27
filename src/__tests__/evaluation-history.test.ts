import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchPreviousEvaluationForPr,
  resolveKomatikListUrl,
} from "../evaluation-history.js";

describe("resolveKomatikListUrl", () => {
  it("maps trailhead store URL to evaluations list", () => {
    expect(resolveKomatikListUrl("https://komatik.ai/api/trailhead/store")).toBe(
      "https://komatik.ai/api/trailhead/evaluations",
    );
    expect(resolveKomatikListUrl("https://komatik.ai/api/deployguard/store")).toBe(
      "https://komatik.ai/api/trailhead/evaluations",
    );
  });

  it("returns null for unrelated store URLs", () => {
    expect(resolveKomatikListUrl("https://api.trailhead.dev/v1/evaluations")).toBeNull();
  });
});

describe("fetchPreviousEvaluationForPr", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.EVALUATION_STORE_SECRET;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.EVALUATION_STORE_SECRET;
  });

  it("loads previous evaluation from Cloud list API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          evaluations: [
            {
              id: "eval-current",
              remediation: { loop_round: 1, fixes: [] },
            },
            {
              id: "eval-prev",
              remediation: {
                schema: "trailhead.remediation.v1",
                loop_round: 0,
                fixes: [
                  {
                    code: "ci.failed",
                    severity: "blocking",
                    title: "x",
                    detail: "x",
                    files: [],
                  },
                ],
                blocking_count: 1,
                warn_count: 0,
                advisory_count: 0,
                autofix_eligible_count: 0,
                max_loop_rounds: 3,
                fixes_resolved: [],
                fixes_introduced: [],
                next_action: "fix_and_retry",
                release_ready: false,
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const previous = await fetchPreviousEvaluationForPr({
      repoId: "KomatikAI/komatik",
      prNumber: 42,
      excludeEvaluationId: "eval-current",
      storeUrl: "https://api.trailhead.dev/v1/evaluations",
      apiKey: "th_test_key",
    });

    expect(previous?.id).toBe("eval-prev");
    expect(previous?.remediation?.loop_round).toBe(0);
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("pr_number=42");
  });

  it("loads previous evaluation from komatik.ai list API", async () => {
    process.env.EVALUATION_STORE_SECRET = "internal-secret";
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          evaluations: [
            {
              id: "eval-current",
              loop_round: 1,
              fixes_resolved: [],
              fixes_introduced: [],
            },
            {
              id: "eval-prev",
              loop_round: 0,
              fixes_resolved: [],
              fixes_introduced: ["ci.failed"],
              remediation: {
                schema: "trailhead.remediation.v1",
                loop_round: 0,
                fixes: [],
                blocking_count: 1,
                warn_count: 0,
                advisory_count: 0,
                autofix_eligible_count: 0,
                max_loop_rounds: 3,
                fixes_resolved: [],
                fixes_introduced: ["ci.failed"],
                next_action: "fix_and_retry",
                release_ready: false,
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const previous = await fetchPreviousEvaluationForPr({
      repoId: "KomatikAI/cairn",
      prNumber: 28,
      excludeEvaluationId: "eval-current",
      storeUrl: "https://komatik.ai/api/trailhead/store",
    });

    expect(previous?.id).toBe("eval-prev");
    expect(previous?.remediation?.loop_round).toBe(0);
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("/api/trailhead/evaluations");
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("repo_id=KomatikAI%2Fcairn");
  });

  it("falls back to Supabase when Cloud list URL is unavailable", async () => {
    process.env.SUPABASE_URL = "https://abc.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: "eval-prev",
            loop_round: 1,
            fixes_resolved: ["ci.failed"],
            fixes_introduced: [],
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const previous = await fetchPreviousEvaluationForPr({
      repoId: "KomatikAI/komatik",
      prNumber: 7,
      storeUrl: "https://legacy.example/store",
    });

    expect(previous?.id).toBe("eval-prev");
    expect(previous?.remediation?.loop_round).toBe(1);
  });
});
