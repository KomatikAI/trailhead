/**
 * ADR-011 periphery: availability stance (§4), the cannot-evaluate brief (§1),
 * the store row (§3), and the delta (§1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatEvaluationDelta } from "../release-brief.js";
import { parsePreviousEvaluationRow } from "../loop-bookkeeping.js";
import { fetchPreviousEvaluationForPr } from "../evaluation-history.js";
import {
  buildEvaluationStoreRow,
  mentionsUnknownAdr011Column,
  storeEvaluation,
} from "../notify.js";
import {
  buildCannotEvaluateBrief,
  buildReleaseBrief,
  getResolvedAvailabilityStance,
  setResolvedAvailabilityStance,
} from "../gate.js";
import type { GateEvaluation } from "../types.js";

vi.mock("@actions/core", () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  setFailed: vi.fn(),
  setOutput: vi.fn(),
  getInput: vi.fn().mockReturnValue(""),
}));

vi.mock("@actions/github", () => ({
  context: {
    repo: { owner: "test-owner", repo: "test-repo" },
    payload: {},
  },
  getOctokit: () => ({ rest: {} }),
}));

function makeEvaluation(overrides: Partial<GateEvaluation> = {}): GateEvaluation {
  return {
    id: "dg-test",
    repoId: "test-owner/test-repo",
    commitSha: "abc1234567890",
    healthScore: 100,
    riskScore: 42,
    gateDecision: "allow",
    healthChecks: [],
    riskFactors: [],
    evaluationMs: 10,
    prNumber: 7,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// formatEvaluationDelta (ADR-011 §1)
// ---------------------------------------------------------------------------

describe("formatEvaluationDelta", () => {
  it("renders verdict, risk and finding movement in one line", () => {
    expect(
      formatEvaluationDelta(
        { verdict: "block", riskScore: 90, findingIds: ["a", "b", "c", "d"] },
        { verdict: "allow", riskScore: 42, findingIds: ["d", "e"] },
      ),
    ).toBe("vs previous: block -> allow, risk 90 -> 42, 3 findings resolved, 1 new");
  });

  it("uses the singular form for a single resolved finding", () => {
    expect(formatEvaluationDelta({ findingIds: ["a"] }, { findingIds: [] })).toBe(
      "vs previous: 1 finding resolved",
    );
  });

  it("says 'no change' when comparable fields are all equal", () => {
    expect(
      formatEvaluationDelta(
        { verdict: "allow", riskScore: 10, findingIds: ["a"] },
        { verdict: "allow", riskScore: 10, findingIds: ["a"] },
      ),
    ).toBe("vs previous: no change");
  });

  it("omits fields the previous snapshot did not carry", () => {
    expect(
      formatEvaluationDelta({ riskScore: 80 }, { verdict: "allow", riskScore: 20 }),
    ).toBe("vs previous: risk 80 -> 20");
  });

  it("returns undefined when nothing is comparable", () => {
    expect(
      formatEvaluationDelta({}, { verdict: "allow", riskScore: 20 }),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parsePreviousEvaluationRow (widened snapshot)
// ---------------------------------------------------------------------------

describe("parsePreviousEvaluationRow — ADR-011 delta fields", () => {
  it("reads snake_case store columns", () => {
    const snapshot = parsePreviousEvaluationRow({
      id: "eval-1",
      risk_score: 90,
      gate_decision: "block",
      release_ready: false,
      enumerated_findings: [{ id: "ci_integrity/1" }, { id: "ci_integrity/2" }],
    });

    expect(snapshot).toMatchObject({
      id: "eval-1",
      riskScore: 90,
      gateDecision: "block",
      releaseReady: false,
      findingIds: ["ci_integrity/1", "ci_integrity/2"],
    });
  });

  it("reads camelCase payloads from the cloud list API", () => {
    const snapshot = parsePreviousEvaluationRow({
      id: "eval-2",
      riskScore: 12,
      gateDecision: "allow",
      releaseReady: true,
    });

    expect(snapshot?.riskScore).toBe(12);
    expect(snapshot?.gateDecision).toBe("allow");
    expect(snapshot?.releaseReady).toBe(true);
  });

  it("falls back to the stored release brief's findings", () => {
    const snapshot = parsePreviousEvaluationRow({
      id: "eval-3",
      release_brief: { findings: [{ id: "supply_chain/1" }] },
    });

    expect(snapshot?.findingIds).toEqual(["supply_chain/1"]);
  });

  it("leaves delta fields undefined when the store did not return them", () => {
    const snapshot = parsePreviousEvaluationRow({ id: "eval-4", remediation: {} });

    expect(snapshot?.id).toBe("eval-4");
    expect(snapshot?.riskScore).toBeUndefined();
    expect(snapshot?.gateDecision).toBeUndefined();
    expect(snapshot?.findingIds).toBeUndefined();
  });

  it("ignores an out-of-enum gate_decision", () => {
    expect(
      parsePreviousEvaluationRow({ id: "eval-5", gate_decision: "cannot_evaluate" })
        ?.gateDecision,
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Supabase select widening + narrow retry
// ---------------------------------------------------------------------------

describe("fetchPreviousEvaluationForPr — Supabase delta select", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.SUPABASE_URL = "https://db.example.com";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("selects the delta columns and returns them on the snapshot", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify([{ id: "eval-prev", risk_score: 88, gate_decision: "block" }]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const snapshot = await fetchPreviousEvaluationForPr({
      repoId: "test-owner/test-repo",
      prNumber: 7,
    });

    const requestedUrl = vi.mocked(fetch).mock.calls[0]?.[0] as string;
    expect(requestedUrl).toContain("risk_score");
    expect(requestedUrl).toContain("release_brief");
    expect(snapshot?.riskScore).toBe(88);
    expect(snapshot?.gateDecision).toBe("block");
  });

  it("retries with the pre-ADR-011 narrow select when the store lacks the columns", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("column does not exist", { status: 400 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: "eval-prev", loop_round: 2 }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const snapshot = await fetchPreviousEvaluationForPr({
      repoId: "test-owner/test-repo",
      prNumber: 7,
    });

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    const retryUrl = vi.mocked(fetch).mock.calls[1]?.[0] as string;
    expect(retryUrl).not.toContain("release_brief");
    expect(snapshot?.id).toBe("eval-prev");
    // Loop bookkeeping still works — the whole point of the fallback.
    expect(snapshot?.remediation?.loop_round).toBe(2);
  });

  it("returns null when both selects fail", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockResolvedValueOnce(new Response("boom", { status: 500 }));

    await expect(
      fetchPreviousEvaluationForPr({ repoId: "test-owner/test-repo", prNumber: 7 }),
    ).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Store row (ADR-011 §1 + §3)
// ---------------------------------------------------------------------------

describe("buildEvaluationStoreRow — ADR-011 columns", () => {
  it("carries the release brief and enumerated findings", () => {
    const row = buildEvaluationStoreRow(
      makeEvaluation({
        enumeratedFindings: [
          { id: "ci_integrity/1", title: "workflow bypass", severity: "blocking" },
        ],
        releaseBrief: {
          verdict: "block",
          findings: [],
          inputs: [],
          actions: [],
        },
      }),
    );

    expect(row.enumerated_findings).toEqual([
      { id: "ci_integrity/1", title: "workflow bypass", severity: "blocking" },
    ]);
    expect(row.release_brief).toMatchObject({ verdict: "block" });
  });

  it("nulls both when the evaluation has neither", () => {
    const row = buildEvaluationStoreRow(makeEvaluation());
    expect(row.release_brief).toBeNull();
    expect(row.enumerated_findings).toBeNull();
  });

  it("records the override scope explicitly, defaulting pre-ADR-011 audits to full", () => {
    const row = buildEvaluationStoreRow(
      makeEvaluation({
        policyOverride: {
          source: "label",
          owner: "dave",
          reason: "promotion train",
          linkedTicket: "",
          expiresAt: "",
          appliedAt: "2026-08-08T00:00:00.000Z",
          changes: {},
        },
      }),
    );

    expect(row.policy_override).toMatchObject({ scope: "full", owner: "dave" });
  });

  it("preserves an explicit risk_only scope", () => {
    const row = buildEvaluationStoreRow(
      makeEvaluation({
        policyOverride: {
          source: "label",
          owner: "dave",
          reason: "risk accepted",
          linkedTicket: "",
          expiresAt: "",
          appliedAt: "2026-08-08T00:00:00.000Z",
          scope: "risk_only",
          changes: {},
        },
      }),
    );

    expect(row.policy_override).toMatchObject({ scope: "risk_only" });
  });
});

describe("mentionsUnknownAdr011Column", () => {
  it("recognises a PostgREST unknown-column body", () => {
    expect(
      mentionsUnknownAdr011Column(
        `{"code":"PGRST204","message":"Could not find the 'release_brief' column"}`,
      ),
    ).toBe(true);
  });

  it("recognises the signature in a non-JSON body", () => {
    expect(
      mentionsUnknownAdr011Column(
        "Could not find the 'enumerated_findings' column of 'trailhead_evaluations' in the schema cache",
      ),
    ).toBe(true);
  });

  it("does not match unrelated failures", () => {
    expect(mentionsUnknownAdr011Column(`{"code":"42501","message":"denied"}`)).toBe(
      false,
    );
  });

  it("does not match an unrelated 400 that merely names the column", () => {
    expect(
      mentionsUnknownAdr011Column(
        `{"code":"42501","message":"permission denied for column release_brief"}`,
      ),
    ).toBe(false);
    expect(
      mentionsUnknownAdr011Column(
        `{"code":"23514","message":"new row violates check constraint on enumerated_findings"}`,
      ),
    ).toBe(false);
    expect(
      mentionsUnknownAdr011Column("upstream connect error while writing release_brief"),
    ).toBe(false);
  });

  it("does not match a schema-cache miss for some other column", () => {
    expect(
      mentionsUnknownAdr011Column(
        `{"code":"PGRST204","message":"Could not find the 'trust_profile' column"}`,
      ),
    ).toBe(false);
  });
});

describe("storeEvaluation — Supabase fallback without the ADR-011 columns", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.SUPABASE_URL = "https://db.example.com";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("strips the new columns and retries once, rather than losing the evaluation", async () => {
    vi.mocked(fetch)
      // storeViaApi attempt (maxRetries: 0) — fails so the Supabase path runs.
      .mockRejectedValueOnce(new Error("no cloud store"))
      .mockResolvedValueOnce(
        new Response(
          `{"code":"PGRST204","message":"Could not find the 'release_brief' column"}`,
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(new Response("", { status: 201 }));

    const stored = await storeEvaluation(
      "https://store.example.com/v1/evaluations",
      makeEvaluation({
        releaseBrief: { verdict: "allow", findings: [], inputs: [], actions: [] },
      }),
      { maxRetries: 0 },
    );

    expect(stored).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
    const retryBody = JSON.parse(
      vi.mocked(fetch).mock.calls[2]?.[1]?.body as string,
    ) as Record<string, unknown>;
    expect(retryBody).not.toHaveProperty("release_brief");
    expect(retryBody).not.toHaveProperty("enumerated_findings");
    expect(retryBody.id).toBe("dg-test");
  });

  it("does not retry for unrelated insert failures, even ones naming the column", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("no cloud store"))
      .mockResolvedValueOnce(
        new Response(
          `{"code":"42501","message":"permission denied for column release_brief"}`,
          { status: 400 },
        ),
      );

    await expect(
      storeEvaluation("https://store.example.com/v1/evaluations", makeEvaluation(), {
        maxRetries: 0,
      }),
    ).resolves.toBe(false);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Availability stance + cannot-evaluate brief (ADR-011 §4 / §1)
// ---------------------------------------------------------------------------

describe("availability stance stash", () => {
  afterEach(() => {
    setResolvedAvailabilityStance(null);
  });

  it("defaults to null — no per-context stance means unchanged fail-mode behaviour", () => {
    setResolvedAvailabilityStance(null);
    expect(getResolvedAvailabilityStance()).toBeNull();
  });

  it("round-trips a resolved stance", () => {
    setResolvedAvailabilityStance("fail_closed");
    expect(getResolvedAvailabilityStance()).toBe("fail_closed");
  });
});

describe("buildCannotEvaluateBrief", () => {
  it("states the reason and the fail-closed consequence", () => {
    const brief = buildCannotEvaluateBrief("store unreachable", "fail_closed");

    expect(brief.verdict).toBe("cannot_evaluate");
    expect(brief.cannotEvaluateReason).toBe("store unreachable");
    expect(brief.findings).toEqual([]);
    expect(brief.inputs).toEqual([]);
    expect(brief.actions.map((a) => a.kind)).toEqual(["fix", "wait"]);
    expect(brief.actions[1]?.detail).toContain("fail_closed");
    expect(brief.actions[1]?.detail).toContain("admin merge");
  });

  it("states the fail-open consequence instead when the stance is open", () => {
    const brief = buildCannotEvaluateBrief("token missing", "fail_open");
    expect(brief.actions[1]?.detail).toContain("fail_open");
    expect(brief.actions[1]?.detail).toContain("successful cannot-evaluate custom check");
    expect(brief.actions[1]?.detail).toContain("publication failure");
  });
});

// ---------------------------------------------------------------------------
// buildReleaseBrief delta wiring
// ---------------------------------------------------------------------------

describe("buildReleaseBrief — delta from the previous evaluation", () => {
  it("sets the delta when a previous snapshot carries comparable fields", () => {
    const brief = buildReleaseBrief(
      makeEvaluation({
        gateDecision: "allow",
        riskScore: 42,
        enumeratedFindings: [{ id: "b", title: "b", severity: "warn" }],
      }),
      70,
      undefined,
      { id: "prev", riskScore: 90, gateDecision: "block", findingIds: ["a", "b"] },
    );

    expect(brief.delta).toBe(
      "vs previous: block -> allow, risk 90 -> 42, 1 finding resolved",
    );
  });

  it("omits the delta when there is no previous evaluation", () => {
    expect(buildReleaseBrief(makeEvaluation(), 70).delta).toBeUndefined();
  });

  it("omits the delta when the previous row carried no comparable fields", () => {
    expect(
      buildReleaseBrief(makeEvaluation(), 70, undefined, { id: "prev" }).delta,
    ).toBeUndefined();
  });
});
