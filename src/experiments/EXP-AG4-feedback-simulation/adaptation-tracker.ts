/**
 * EXP-AG4: Adaptation Tracker
 *
 * Computes adaptation metrics from a sequence of simulation rounds.
 * Answers: "Is this agent getting better, worse, or staying the same?"
 *
 * Uses:
 *  - Wilson score confidence interval for acceptance rate estimation
 *  - Least-squares linear regression to derive the learning slope
 *  - Rolling window for recency-weighted acceptance rate
 *
 * Date: 2026-06-01
 * Author: Edison (rd-platform)
 */

import type { AdaptationState, AdaptationTrend, SimulationRound } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of most-recent rounds used for the rolling acceptance rate */
const ROLLING_WINDOW = 5;

/**
 * Learning slope thresholds (quality-score units per round).
 * A slope above IMPROVE_THRESHOLD → "improving".
 * A slope below DEGRADE_THRESHOLD → "degrading".
 */
const IMPROVE_THRESHOLD = 0.3;
const DEGRADE_THRESHOLD = -0.3;

// ---------------------------------------------------------------------------
// Wilson Score Confidence Interval
// ---------------------------------------------------------------------------

/**
 * Compute a Wilson score confidence interval for a proportion.
 *
 * @param successes  Number of successes
 * @param n          Total observations
 * @param z          z-score for the desired confidence level (1.96 ≈ 95 %)
 * @returns [lower, upper] clamped to [0, 1]
 */
export function wilsonScoreCI(
  successes: number,
  n: number,
  z: number = 1.96,
): [number, number] {
  if (n === 0) return [0, 1];
  const p = successes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

// ---------------------------------------------------------------------------
// Linear Regression (least-squares slope)
// ---------------------------------------------------------------------------

/**
 * Compute the least-squares slope of y versus x where x = [0, 1, …, n-1].
 * Returns 0 when fewer than 2 data points are available.
 *
 * Formula: slope = Σ((xᵢ - x̄)(yᵢ - ȳ)) / Σ((xᵢ - x̄)²)
 */
export function linearSlope(y: number[]): number {
  const n = y.length;
  if (n < 2) return 0;

  const xMean = (n - 1) / 2;
  const yMean = y.reduce((acc, v) => acc + v, 0) / n;

  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - xMean;
    sxy += dx * (y[i] - yMean);
    sxx += dx * dx;
  }

  return sxx === 0 ? 0 : sxy / sxx;
}

// ---------------------------------------------------------------------------
// Trend Classification
// ---------------------------------------------------------------------------

function classifyTrend(slope: number): AdaptationTrend {
  if (slope >= IMPROVE_THRESHOLD) return "improving";
  if (slope <= DEGRADE_THRESHOLD) return "degrading";
  return "stable";
}

// ---------------------------------------------------------------------------
// AdaptationTracker
// ---------------------------------------------------------------------------

export class AdaptationTracker {
  /**
   * Compute the adaptation state for a single agent from their rounds.
   *
   * Rounds should be sorted chronologically (ascending `roundIndex`).
   * If rounds is empty, a zero-state is returned.
   */
  computeState(agentId: string, rounds: SimulationRound[]): AdaptationState {
    if (rounds.length === 0) {
      return {
        agentId,
        roundsObserved: 0,
        recentAcceptanceRate: 0,
        cumulativeAcceptanceRate: 0,
        averageRemediationRounds: 0,
        learningCurve: [],
        learningSlope: 0,
        trend: "stable",
        acceptanceRateCI: [0, 1],
      };
    }

    // --- Acceptance rates ---
    const totalAccepted = rounds.filter((r) => r.accepted).length;
    const cumulativeAcceptanceRate = totalAccepted / rounds.length;

    const recentRounds = rounds.slice(-ROLLING_WINDOW);
    const recentAccepted = recentRounds.filter((r) => r.accepted).length;
    const recentAcceptanceRate = recentAccepted / recentRounds.length;

    // --- Remediation ---
    const averageRemediationRounds =
      rounds.reduce((sum, r) => sum + r.remediationRoundsUsed, 0) / rounds.length;

    // --- Learning curve and slope ---
    const learningCurve = rounds.map((r) => r.qualityScore);
    const learningSlope = linearSlope(learningCurve);

    // --- Trend ---
    const trend = classifyTrend(learningSlope);

    // --- Wilson CI ---
    const acceptanceRateCI = wilsonScoreCI(totalAccepted, rounds.length);

    return {
      agentId,
      roundsObserved: rounds.length,
      recentAcceptanceRate,
      cumulativeAcceptanceRate,
      averageRemediationRounds,
      learningCurve,
      learningSlope,
      trend,
      acceptanceRateCI,
    };
  }

  /**
   * Compute adaptation states for all agents in a single pass over the rounds
   * array. More efficient than calling computeState() per agent when there are
   * many agents.
   */
  computeAllStates(
    agentIds: string[],
    rounds: SimulationRound[],
  ): AdaptationState[] {
    // Group rounds by agentId
    const byAgent = new Map<string, SimulationRound[]>();
    for (const agentId of agentIds) {
      byAgent.set(agentId, []);
    }
    for (const round of rounds) {
      const bucket = byAgent.get(round.agentId);
      if (bucket) bucket.push(round);
    }

    // Sort each agent's rounds and compute state
    return agentIds.map((agentId) => {
      const agentRounds = (byAgent.get(agentId) ?? []).sort(
        (a, b) => a.roundIndex - b.roundIndex,
      );
      return this.computeState(agentId, agentRounds);
    });
  }
}
