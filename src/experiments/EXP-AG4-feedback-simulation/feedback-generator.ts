/**
 * EXP-AG4: Synthetic Feedback Generator
 *
 * Generates sequences of feedback events that mimic real Trailhead gate
 * interactions. Each scenario models a distinct acceptance/rejection
 * trajectory. A configurable noise factor introduces realistic variation
 * so the simulation doesn't produce artificially clean curves.
 *
 * The generator is deterministic given the same seed — runs are reproducible.
 *
 * Date: 2026-06-01
 * Author: Edison (rd-platform)
 */

import type {
  FeedbackScenario,
  SimulatedAgent,
  SimulationRound,
  TrustFeedbackOutcome,
} from "./types.js";

// ---------------------------------------------------------------------------
// Canonical Scenario Library
// ---------------------------------------------------------------------------

export const CANONICAL_SCENARIOS: FeedbackScenario[] = [
  {
    id: "clean-01",
    kind: "clean_accept",
    description: "Clean submission with no issues — passes all checks on first try",
    outcomeSequence: ["ci_pass"],
    expectedDirection: "improve",
    riskFactors: [],
    remediationRounds: 0,
  },
  {
    id: "warn-01",
    kind: "warn_then_accept",
    description:
      "Submission triggers a security warning; accepted after human review",
    outcomeSequence: ["human_review", "ci_pass"],
    expectedDirection: "stable",
    riskFactors: ["workflow_security", "sensitive_files"],
    remediationRounds: 0,
  },
  {
    id: "reject-fix-01",
    kind: "reject_fix_accept",
    description: "CI failure on first submission, one fix cycle, accepted second round",
    outcomeSequence: ["ci_fail", "rounds_to_green"],
    expectedDirection: "improve",
    riskFactors: ["test_coverage", "ci_integrity"],
    remediationRounds: 1,
  },
  {
    id: "reject-fix-02",
    kind: "reject_fix_accept",
    description: "Duplicate logic detected, refactored once, accepted",
    outcomeSequence: ["ci_fail", "ci_pass"],
    expectedDirection: "improve",
    riskFactors: ["duplicate_logic"],
    remediationRounds: 1,
  },
  {
    id: "multi-01",
    kind: "multi_reject",
    description:
      "Two CI failures before rounds_to_green — agent needed multiple fix cycles",
    outcomeSequence: ["ci_fail", "ci_fail", "rounds_to_green"],
    expectedDirection: "degrade",
    riskFactors: ["test_coverage", "ci_integrity", "pr_scope"],
    remediationRounds: 2,
  },
  {
    id: "multi-02",
    kind: "multi_reject",
    description:
      "Security alert + CI failures across three remediation cycles, finally accepted",
    outcomeSequence: ["ci_fail", "ci_fail", "ci_fail", "ci_pass"],
    expectedDirection: "degrade",
    riskFactors: ["security_alerts", "ci_integrity"],
    remediationRounds: 3,
  },
  {
    id: "block-01",
    kind: "permanent_block",
    description:
      "Secret detected in diff — blocked outright, scenario ends without acceptance",
    outcomeSequence: ["ci_fail"],
    expectedDirection: "degrade",
    riskFactors: ["sensitive_files", "security_alerts"],
    remediationRounds: 0,
  },
  {
    id: "regress-01",
    kind: "regress_recover",
    description:
      "Quality degrades for several rounds (supply chain issue) then recovers",
    outcomeSequence: ["ci_pass", "ci_fail", "ci_fail", "rounds_to_green", "ci_pass"],
    expectedDirection: "stable",
    riskFactors: ["supply_chain"],
    remediationRounds: 2,
  },
  {
    id: "rollback-01",
    kind: "multi_reject",
    description: "Accepted and deployed, then reverted on post-deploy regression",
    outcomeSequence: ["ci_pass", "revert"],
    expectedDirection: "degrade",
    riskFactors: ["ci_integrity", "test_coverage"],
    remediationRounds: 0,
  },
  {
    id: "rollback-recover-01",
    kind: "regress_recover",
    description: "Rollback followed by a clean recovery with improved tests",
    outcomeSequence: ["revert", "rollback", "rounds_to_green", "ci_pass"],
    expectedDirection: "improve",
    riskFactors: ["ci_integrity"],
    remediationRounds: 1,
  },
];

// ---------------------------------------------------------------------------
// Quality Score Mapping
// ---------------------------------------------------------------------------

/** Maps an outcome to a base quality score (0–100). Higher = cleaner. */
const OUTCOME_BASE_SCORES: Record<TrustFeedbackOutcome, number> = {
  ci_pass: 95,
  rounds_to_green: 70,
  human_review: 60,
  ci_fail: 30,
  revert: 15,
  rollback: 10,
};

/** Each extra remediation round reduces quality by this many points. */
const REMEDIATION_ROUND_PENALTY = 8;

/**
 * Compute a quality score for a given outcome and remediation count.
 * Score is clamped to [0, 100].
 */
export function computeQualityScore(
  outcome: TrustFeedbackOutcome,
  remediationRounds: number,
): number {
  const base = OUTCOME_BASE_SCORES[outcome];
  const penalty = remediationRounds * REMEDIATION_ROUND_PENALTY;
  return Math.max(0, Math.min(100, base - penalty));
}

// ---------------------------------------------------------------------------
// Seeded Pseudo-Random Number Generator
// ---------------------------------------------------------------------------

/**
 * LCG-based deterministic PRNG (no external deps, reproducible across runs).
 * Parameters from Numerical Recipes (Knuth §3.6).
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    // Ensure the state is a 32-bit unsigned integer
    this.state = (seed >>> 0) || 1;
  }

  /** Returns a float in [0, 1) */
  next(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  /** Returns an integer in [min, max) */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  /** Returns true with probability p */
  bool(p: number): boolean {
    return this.next() < p;
  }
}

// ---------------------------------------------------------------------------
// Noise Injection
// ---------------------------------------------------------------------------

const OUTCOME_LIST: TrustFeedbackOutcome[] = [
  "ci_pass",
  "rounds_to_green",
  "human_review",
  "ci_fail",
  "revert",
  "rollback",
];

/**
 * Optionally drift an outcome one step toward a neighbouring outcome.
 * The list is ordered from best to worst; noise drifts toward the nearest
 * neighbour with probability noiseFactor.
 */
export function applyOutcomeNoise(
  outcome: TrustFeedbackOutcome,
  noiseFactor: number,
  rng: SeededRandom,
): TrustFeedbackOutcome {
  if (noiseFactor <= 0 || !rng.bool(noiseFactor)) return outcome;
  const idx = OUTCOME_LIST.indexOf(outcome);
  const shift = rng.bool(0.5) ? 1 : -1;
  const newIdx = Math.max(0, Math.min(OUTCOME_LIST.length - 1, idx + shift));
  return OUTCOME_LIST[newIdx];
}

// ---------------------------------------------------------------------------
// Generator Configuration
// ---------------------------------------------------------------------------

export interface GeneratorConfig {
  /** 0.0 = deterministic replay; higher values inject realistic noise */
  noiseFactor: number;
  /** RNG seed — fix this to get reproducible runs */
  seed: number;
  /** How many rounds to run per agent-scenario pair */
  roundsPerScenario: number;
}

export const DEFAULT_GENERATOR_CONFIG: GeneratorConfig = {
  noiseFactor: 0.1,
  seed: 42,
  roundsPerScenario: 20,
};

// ---------------------------------------------------------------------------
// FeedbackGenerator
// ---------------------------------------------------------------------------

export class FeedbackGenerator {
  private readonly rng: SeededRandom;
  readonly config: GeneratorConfig;

  constructor(config: Partial<GeneratorConfig> = {}) {
    this.config = { ...DEFAULT_GENERATOR_CONFIG, ...config };
    this.rng = new SeededRandom(this.config.seed);
  }

  /**
   * Generate `repetitions` rounds for a single agent running through a
   * scenario. Successive repetitions accumulate the agent's learning boost
   * so later rounds reflect improved behaviour.
   *
   * @param agent        The simulated agent
   * @param scenario     Feedback scenario to replay
   * @param repetitions  How many times to cycle through the scenario
   * @param baseRound    Offset added to roundIndex for global ordering
   */
  generateRoundsForAgent(
    agent: SimulatedAgent,
    scenario: FeedbackScenario,
    repetitions: number,
    baseRound: number = 0,
  ): SimulationRound[] {
    const rounds: SimulationRound[] = [];
    const seqLen = scenario.outcomeSequence.length;

    for (let rep = 0; rep < repetitions; rep++) {
      const roundIndex = baseRound + rep;

      // Learning boost: acceptance probability grows as agent accumulates experience
      const adaptBoost = agent.learningRate * (rep / Math.max(repetitions - 1, 1)) * 0.3;
      const effectiveAcceptRate = Math.min(1, agent.baseAcceptanceRate + adaptBoost);

      // Cycle through the scenario's outcome sequence
      const seqIdx = rep % seqLen;
      let baseOutcome = scenario.outcomeSequence[seqIdx];

      // High-performing agents sometimes skip a ci_fail once they've learned enough
      if (
        baseOutcome === "ci_fail" &&
        effectiveAcceptRate > 0.8 &&
        this.rng.bool(effectiveAcceptRate - 0.5)
      ) {
        baseOutcome = "rounds_to_green";
      }

      const outcome = applyOutcomeNoise(baseOutcome, this.config.noiseFactor, this.rng);

      // Remediation rounds consumed: persistent agents keep retrying failures
      const isFailure = outcome === "ci_fail" || outcome === "revert" || outcome === "rollback";
      const remediationRoundsUsed = isFailure
        ? Math.round(scenario.remediationRounds * agent.persistence)
        : 0;

      // Acceptance: ci_pass, rounds_to_green, and human_review all count as accepted
      const accepted =
        outcome === "ci_pass" ||
        outcome === "rounds_to_green" ||
        outcome === "human_review";

      // Simulate timestamps spaced 1 minute apart in experiment time
      const timestamp = new Date(
        Date.now() + roundIndex * 60_000,
      ).toISOString();

      rounds.push({
        roundIndex,
        agentId: agent.agentId,
        scenarioId: scenario.id,
        outcome,
        remediationRoundsUsed,
        qualityScore: computeQualityScore(outcome, remediationRoundsUsed),
        accepted,
        timestamp,
      });
    }

    return rounds;
  }
}
