import { describe, expect, it, vi } from "vitest";
import { evaluateReleaseEvidence } from "../release-evidence.js";
import type { ReleaseEvidenceConfig } from "../types.js";

const NOW = Date.parse("2026-07-22T20:00:00.000Z");

function config(overrides: Partial<ReleaseEvidenceConfig> = {}): ReleaseEvidenceConfig {
  return {
    enabled: true,
    url: "https://lodge.example.com/api/release-evidence",
    environments: ["production"],
    mode: "block",
    max_age_minutes: 60,
    expected_subject: "lodge-production",
    required_checks: ["deployment.target", "credits.policy", "canary.refund"],
    ...overrides,
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function document(
  checks: Array<{
    id: string;
    status: "pass" | "fail" | "pending";
    summary: string;
    evidence_url?: string;
  }>,
) {
  return {
    schema_version: 1,
    subject: "lodge-production",
    generated_at: "2026-07-22T19:45:00.000Z",
    evidence_url: "https://evidence.example.com/run/42",
    checks,
  };
}

describe("evaluateReleaseEvidence", () => {
  it("is dormant outside configured environments", async () => {
    const fetchImpl = vi.fn();
    const result = await evaluateReleaseEvidence(config(), "staging", {
      now: NOW,
      fetchImpl,
    });

    expect(result).toEqual({
      active: false,
      shouldBlock: false,
      findings: [],
      healthChecks: [],
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("passes when every fresh required condition is proven", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response(
        document([
          { id: "deployment.target", status: "pass", summary: "lodge-web verified" },
          { id: "credits.policy", status: "pass", summary: "1/3-credit policy" },
          { id: "canary.refund", status: "pass", summary: "refund reconciled" },
        ]),
      ),
    );

    const result = await evaluateReleaseEvidence(config(), "production", {
      now: NOW,
      fetchImpl,
    });

    expect(result.active).toBe(true);
    expect(result.shouldBlock).toBe(false);
    expect(result.findings).toEqual([]);
    expect(result.healthChecks).toHaveLength(3);
    expect(result.healthChecks.every((check) => check.status === "allow")).toBe(true);
  });

  it("emits one actionable finding for every failed, pending, or missing condition", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response(
        document([
          {
            id: "deployment.target",
            status: "fail",
            summary: "Vercel project is lyra-web",
            evidence_url: "https://vercel.example.com/wrong-project",
          },
          {
            id: "credits.policy",
            status: "pending",
            summary: "credit enforcement is still shadow-only",
          },
        ]),
      ),
    );

    const result = await evaluateReleaseEvidence(config(), "production", {
      now: NOW,
      fetchImpl,
    });

    expect(result.shouldBlock).toBe(true);
    expect(result.findings).toHaveLength(3);
    expect(result.findings[0]).toContain("Vercel project is lyra-web");
    expect(result.findings[0]).toContain("[evidence]");
    expect(result.findings[1]).toContain("shadow-only");
    expect(result.findings[2]).toContain("required check is missing");
    expect(result.healthChecks.map((check) => check.status)).toEqual([
      "block",
      "block",
      "block",
    ]);
  });

  it("keeps failed evidence non-blocking in warn mode", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(document([])));
    const result = await evaluateReleaseEvidence(
      config({ mode: "warn", required_checks: ["credits.policy"] }),
      "production",
      { now: NOW, fetchImpl },
    );

    expect(result.shouldBlock).toBe(false);
    expect(result.healthChecks[0]?.status).toBe("warn");
  });

  it("fails closed when the document is stale", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({
        ...document([]),
        generated_at: "2026-07-22T10:00:00.000Z",
      }),
    );
    const result = await evaluateReleaseEvidence(config(), "production", {
      now: NOW,
      fetchImpl,
    });

    expect(result.shouldBlock).toBe(true);
    expect(result.findings[0]).toContain("document is stale");
  });

  it("rejects insecure endpoints before issuing a request", async () => {
    const fetchImpl = vi.fn();
    const result = await evaluateReleaseEvidence(
      config({ url: "http://lodge.example.com/api/release-evidence" }),
      "production",
      { now: NOW, fetchImpl },
    );

    expect(result.shouldBlock).toBe(true);
    expect(result.findings[0]).toContain("must use HTTPS");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when the endpoint is unavailable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({}, 503));
    const result = await evaluateReleaseEvidence(config(), "production", {
      now: NOW,
      fetchImpl,
    });

    expect(result.shouldBlock).toBe(true);
    expect(result.findings[0]).toContain("HTTP 503");
  });
});
