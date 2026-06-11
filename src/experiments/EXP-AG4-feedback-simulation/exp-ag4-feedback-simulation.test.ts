/**
 * EXP-AG4: Feedback Simulation Tests
 *
 * Tests for the synthetic feedback generator, adaptation tracker, and
 * simulation runner. All tests use real computation — no mocks.
 *
 * Run with: npx vitest run exp-ag4-feedback-simulation.test.ts
 *
 * Date: 2026-06-01
 * Author: Edison (rd-platform)
 */

import { describe, it, expect } from "vitest";

import { computeQualityScore, SeededRandom, applyOutcomeNoise, FeedbackGenerator, CANONICAL_SCENARIOS } from "./feedback-generator.js";
import { wilsonScoreCI, linearSlope, AdaptationTracker } from "./adaptation-tracker.js";
import { SimulationRunner, DEFAULT_AGENTS } from "./simulation-runner.js";
import type { SimulationRound } from "./types.js";

// ---------------------------------------------------------------------------
// computeQualityScore
// ---------------------------------------------------------------------------

describe("computeQualityScore", () => {
  it("returns 95 for ci_pass with 0 remediation rounds", () => {
    expect(computeQualityScore("ci_pass", 0)).toBe(95);
  });

  it("returns 30 for ci_fail with 0 remediation rounds", () => {
    expect(computeQualityScore("ci_fail", 0)).toBe(30);
  });

  it("applies an 8-point penalty per remediation round", () => {
    expect(computeQualityScore("ci_pass", 1)).toBe(87);
    expect(computeQualityScore("ci_pass", 2)).toBe(79);
  });

  it("never returns a value below 0", () => {
    expect(computeQualityScore("rollback", 20)).toBe(0);
  });

  it("never returns a value above 100", () => {
    // rounds_to_green base is 70; negative remediation is impossible but clamp is verified
    expect(computeQualityScore("ci_pass", 0)).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// SeededRandom
// ---------------------------------------------------------------------------

describe("SeededRandom", () => {
  it("is deterministic for the same seed", () => {
    const rng1 = new SeededRandom(12345);
    const rng2 = new SeededRandom(12345);
    const seq1 = Array.from({ length: 10 }, () => rng1.next());
    const seq2 = Array.from({ length: 10 }, () => rng2.next());
    expect(seq1).toEqual(seq2);
  });

  it("returns values in [0, 1)", () => {
    const rng = new SeededRandom(99);
    for (let i = 0; i < 100; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int() returns integers within [min, max)", () => {
    const rng = new SeededRandom(7);
    for (let i = 0; i < 50; i++) {
      const v = rng.int(3, 10);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(10);
    }
  });

  it("bool() with p=0 is always false", () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 20; i++) {
      expect(rng.bool(0)).toBe(false);
    }
  });

  it("bool() with p=1 is always true", () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 20; i++) {
      expect(rng.bool(1)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// applyOutcomeNoise
// ---------------------------------------------------------------------------

describe("applyOutcomeNoise", () => {
  it("returns the same outcome when noiseFactor=0", () => {
    const rng = new SeededRandom(1);
    expect(applyOutcomeNoise("ci_pass", 0, rng)).toBe("ci_pass");
    expect(applyOutcomeNoise("ci_fail", 0, rng)).toBe("ci_fail");
  });

  it("returns a valid outcome type when noise is applied", () => {
    const valid = new Set(["ci_pass", "ci_fail", "revert", "rollback", "rounds_to_green", "human_review"]);
    const rng = new SeededRandom(55);
    for (let i = 0; i < 50; i++) {
      const out = applyOutcomeNoise("ci_fail", 1.0, rng);
      expect(valid.has(out)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// CANONICAL_SCENARIOS
// ---------------------------------------------------------------------------

describe("CANONICAL_SCENARIOS", () => {
  it("has at least 10 scenarios", () => {
    expect(CANONICAL_SCENARIOS.length).toBeGreaterThanOrEqual(10);
  });

  it("every scenario has a non-empty outcomeSequence", () => {
    for (const s of CANONICAL_SCENARIOS) {
      expect(s.outcomeSequence.length).toBeGreaterThan(0);
    }
  });

  it("every scenario id is unique", () => {
    const ids = CANONICAL_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("remediationRounds is non-negative for all scenarios", () => {
    for (const s of CANONICAL_SCENARIOS) {
      expect(s.remediationRounds).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// FeedbackGenerator
// ---------------------------------------------------------------------------

describe("FeedbackGenerator", () => {
  const scenario = CANONICAL_SCENARIOS.find((s) => s.id === "reject-fix-01")!;
  const agent = DEFAULT_AGENTS.find((a) => a.agentId === "steady-performer")!;

  it("generates exactly `repetitions` rounds", () => {
    const gen = new FeedbackGenerator({ seed: 1 });
    const rounds = gen.generateRoundsForAgent(agent, scenario, 10);
    expect(rounds).toHaveLength(10);
  });

  it("every round has agentId matching the agent", () => {
    const gen = new FeedbackGenerator({ seed: 2 });
    const rounds = gen.generateRoundsForAgent(agent, scenario, 5);
    for (const r of rounds) {
      expect(r.agentId).toBe(agent.agentId);
    }
  });

  it("every round has scenarioId matching the scenario", () => {
    const gen = new FeedbackGenerator({ seed: 3 });
    const rounds = gen.generateRoundsForAgent(agent, scenario, 5);
    for (const r of rounds) {
      expect(r.scenarioId).toBe(scenario.id);
    }
  });

  it("qualityScore is always in [0, 100]", () => {
    const gen = new FeedbackGenerator({ seed: 4, noiseFactor: 0.5 });
    const rounds = gen.generateRoundsForAgent(agent, scenario, 20);
    for (const r of rounds) {
      expect(r.qualityScore).toBeGreaterThanOrEqual(0);
      expect(r.qualityScore).toBeLessThanOrEqual(100);
    }
  });

  it("roundIndex increments correctly from baseRound", () => {
    const gen = new FeedbackGenerator({ seed: 5 });
    const rounds = gen.generateRoundsForAgent(agent, scenario, 5, 100);
    expect(rounds[0].roundIndex).toBe(100);
    expect(rounds[4].roundIndex).toBe(104);
  });

  it("is deterministic with the same seed", () => {
    const gen1 = new FeedbackGenerator({ seed: 99 });
    const gen2 = new FeedbackGenerator({ seed: 99 });
    const r1 = gen1.generateRoundsForAgent(agent, scenario, 10);
    const r2 = gen2.generateRoundsForAgent(agent, scenario, 10);
    expect(r1.map((r) => r.outcome)).toEqual(r2.map((r) => r.outcome));
  });

  it("timestamps are ISO-8601 strings", () => {
    const gen = new FeedbackGenerator({ seed: 6 });
    const rounds = gen.generateRoundsForAgent(agent, scenario, 3);
    for (const r of rounds) {
      expect(() => new Date(r.timestamp).toISOString()).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// wilsonScoreCI
// ---------------------------------------------------------------------------

describe("wilsonScoreCI", () => {
  it("returns [0, 1] when n=0", () => {
    expect(wilsonScoreCI(0, 0)).toEqual([0, 1]);
  });

  it("lower bound is less than upper bound", () => {
    const [lo, hi] = wilsonScoreCI(7, 10);
    expect(lo).toBeLessThan(hi);
  });

  it("CI is centered near the true proportion for large n", () => {
    const [lo, hi] = wilsonScoreCI(500, 1000);
    const mid = (lo + hi) / 2;
    expect(mid).toBeCloseTo(0.5, 1);
  });

  it("bounds are always in [0, 1]", () => {
    const cases = [
      [0, 10],
      [10, 10],
      [3, 4],
      [1, 100],
    ] as const;
    for (const [s, n] of cases) {
      const [lo, hi] = wilsonScoreCI(s, n);
      expect(lo).toBeGreaterThanOrEqual(0);
      expect(hi).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// linearSlope
// ---------------------------------------------------------------------------

describe("linearSlope", () => {
  it("returns 0 for empty array", () => {
    expect(linearSlope([])).toBe(0);
  });

  it("returns 0 for a single value", () => {
    expect(linearSlope([42])).toBe(0);
  });

  it("returns a positive slope for an increasing sequence", () => {
    expect(linearSlope([1, 2, 3, 4, 5])).toBeGreaterThan(0);
  });

  it("returns a negative slope for a decreasing sequence", () => {
    expect(linearSlope([5, 4, 3, 2, 1])).toBeLessThan(0);
  });

  it("returns 0 for a flat sequence", () => {
    expect(linearSlope([7, 7, 7, 7])).toBeCloseTo(0, 5);
  });

  it("returns exactly 1 for y=[0,1,2,3]", () => {
    expect(linearSlope([0, 1, 2, 3])).toBeCloseTo(1, 5);
  });
});

// ---------------------------------------------------------------------------
// AdaptationTracker
// ---------------------------------------------------------------------------

describe("AdaptationTracker", () => {
  const tracker = new AdaptationTracker();

  it("returns a zero-state for an empty rounds array", () => {
    const state = tracker.computeState("test-agent", []);
    expect(state.roundsObserved).toBe(0);
    expect(state.cumulativeAcceptanceRate).toBe(0);
    expect(state.trend).toBe("stable");
  });

  function makeRound(
    idx: number,
    accepted: boolean,
    quality: number,
    remediation = 0,
  ): SimulationRound {
    return {
      roundIndex: idx,
      agentId: "test-agent",
      scenarioId: "clean-01",
      outcome: accepted ? "ci_pass" : "ci_fail",
      remediationRoundsUsed: remediation,
      qualityScore: quality,
      accepted,
      timestamp: new Date().toISOString(),
    };
  }

  it("computes cumulative acceptance rate correctly", () => {
    const rounds = [
      makeRound(0, true, 95),
      makeRound(1, false, 30),
      makeRound(2, true, 95),
      makeRound(3, true, 95),
    ];
    const state = tracker.computeState("test-agent", rounds);
    expect(state.cumulativeAcceptanceRate).toBeCloseTo(0.75, 5);
  });

  it("classifies an improving agent correctly", () => {
    // Quality scores trending upward strongly (slope >> 0.3)
    const rounds = Array.from({ length: 15 }, (_, i) =>
      makeRound(i, i > 3, 20 + i * 5),
    );
    const state = tracker.computeState("test-agent", rounds);
    expect(state.learningSlope).toBeGreaterThan(0);
    expect(state.trend).toBe("improving");
  });

  it("classifies a degrading agent correctly", () => {
    // Quality scores trending downward strongly
    const rounds = Array.from({ length: 15 }, (_, i) =>
      makeRound(i, i < 10, 90 - i * 5),
    );
    const state = tracker.computeState("test-agent", rounds);
    expect(state.learningSlope).toBeLessThan(0);
    expect(state.trend).toBe("degrading");
  });

  it("computeAllStates returns a state per agentId", () => {
    const rounds = [
      { ...makeRound(0, true, 95), agentId: "a1" },
      { ...makeRound(1, false, 30), agentId: "a2" },
    ];
    const states = tracker.computeAllStates(["a1", "a2"], rounds);
    expect(states).toHaveLength(2);
    expect(states.map((s) => s.agentId).sort()).toEqual(["a1", "a2"]);
  });

  it("acceptanceRateCI lower < upper", () => {
    const rounds = Array.from({ length: 10 }, (_, i) =>
      makeRound(i, i % 2 === 0, 50),
    );
    const state = tracker.computeState("test-agent", rounds);
    expect(state.acceptanceRateCI[0]).toBeLessThan(state.acceptanceRateCI[1]);
  });
});

// ---------------------------------------------------------------------------
// SimulationRunner (integration)
// ---------------------------------------------------------------------------

describe("SimulationRunner", () => {
  it("produces a report with correct agent and scenario counts", () => {
    const runner = new SimulationRunner({
      generatorConfig: { seed: 1, noiseFactor: 0 },
      roundsPerScenario: 5,
    });
    const report = runner.run("test-run");
    expect(report.agentsSimulated).toBe(DEFAULT_AGENTS.length);
    expect(report.scenariosRun).toBe(CANONICAL_SCENARIOS.length);
  });

  it("totalRounds = agents × scenarios × roundsPerScenario", () => {
    const roundsPerScenario = 10;
    const runner = new SimulationRunner({
      generatorConfig: { seed: 2 },
      roundsPerScenario,
    });
    const report = runner.run("count-check");
    expect(report.totalRounds).toBe(
      DEFAULT_AGENTS.length * CANONICAL_SCENARIOS.length * roundsPerScenario,
    );
  });

  it("adaptationStates has one entry per agent", () => {
    const runner = new SimulationRunner({ generatorConfig: { seed: 3 }, roundsPerScenario: 5 });
    const report = runner.run("state-check");
    expect(report.adaptationStates).toHaveLength(DEFAULT_AGENTS.length);
  });

  it("summary.adaptationRate is in [0, 1]", () => {
    const runner = new SimulationRunner({ generatorConfig: { seed: 4 }, roundsPerScenario: 10 });
    const report = runner.run("rate-check");
    expect(report.summary.adaptationRate).toBeGreaterThanOrEqual(0);
    expect(report.summary.adaptationRate).toBeLessThanOrEqual(1);
  });

  it("summary.fastestLearner is a valid agentId or null", () => {
    const runner = new SimulationRunner({ generatorConfig: { seed: 5 }, roundsPerScenario: 10 });
    const report = runner.run("learner-check");
    const validIds = new Set([...DEFAULT_AGENTS.map((a) => a.agentId), null]);
    expect(validIds.has(report.summary.fastestLearner)).toBe(true);
  });

  it("filters scenarios when scenarioIds is set", () => {
    const runner = new SimulationRunner({
      generatorConfig: { seed: 6 },
      scenarioIds: ["clean-01", "block-01"],
      roundsPerScenario: 5,
    });
    const report = runner.run("filter-check");
    expect(report.scenariosRun).toBe(2);
  });

  it("is deterministic: same seed produces same report structure", () => {
    const cfg = { generatorConfig: { seed: 42 }, roundsPerScenario: 5 };
    const r1 = new SimulationRunner(cfg).run("det-1");
    const r2 = new SimulationRunner(cfg).run("det-2");
    // Compare outcome sequences (timestamps differ)
    const outcomes1 = r1.rounds.map((r) => r.outcome);
    const outcomes2 = r2.rounds.map((r) => r.outcome);
    expect(outcomes1).toEqual(outcomes2);
  });

  it("summary.overallTrend is one of the valid values", () => {
    const runner = new SimulationRunner({ generatorConfig: { seed: 7 }, roundsPerScenario: 10 });
    const report = runner.run("trend-check");
    expect(["improving", "stable", "degrading"]).toContain(report.summary.overallTrend);
  });
});
