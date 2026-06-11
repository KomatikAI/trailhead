/**
 * EXP-AG4: Feedback Simulation Types
 *
 * Hypothesis: "If we build a synthetic feedback generator that replays
 * acceptance/rejection scenarios, we can measure per-agent adaptation rates
 * and identify which feedback signals produce the most durable improvement
 * in submission quality."
 *
 * This module defines the core schema for scenarios, agent profiles,
 * simulation rounds, and adaptation metrics.
 *
 * Date: 2026-06-01
 * Author: Edison (rd-platform)
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Outcome types (mirrored from agent-trust-feedback.ts for experiment isolation)
// ---------------------------------------------------------------------------

export const TrustFeedbackOutcome = z.enum([
  "ci_pass",
  "ci_fail",
  "revert",
  "rollback",
  "rounds_to_green",
  "human_review",
]);
export type TrustFeedbackOutcome = z.infer<typeof TrustFeedbackOutcome>;

// ---------------------------------------------------------------------------
// Scenario Definitions
// ---------------------------------------------------------------------------

export const ScenarioKind = z.enum([
  "clean_accept",      // Passes all checks on first submission
  "warn_then_accept",  // Warnings raised; ultimately accepted
  "reject_fix_accept", // One rejection → one fix round → accept
  "multi_reject",      // 2+ rejection rounds before accept
  "permanent_block",   // Critical block — never accepted (security/policy)
  "regress_recover",   // Quality dips then recovers to baseline
]);
export type ScenarioKind = z.infer<typeof ScenarioKind>;

export const FeedbackScenarioSchema = z.object({
  /** Unique scenario identifier */
  id: z.string(),
  kind: ScenarioKind,
  description: z.string(),
  /** Ordered outcome sequence the agent experiences; cycles when scenario repeats */
  outcomeSequence: z.array(TrustFeedbackOutcome).min(1),
  /** Whether this scenario is expected to improve, degrade, or leave stable the agent acceptance rate */
  expectedDirection: z.enum(["improve", "degrade", "stable"]),
  /** Risk factor labels characterising this scenario */
  riskFactors: z.array(z.string()),
  /** Number of remediation rounds the scenario requires (0 = no fix cycle) */
  remediationRounds: z.number().int().min(0),
});
export type FeedbackScenario = z.infer<typeof FeedbackScenarioSchema>;

// ---------------------------------------------------------------------------
// Agent Simulation Configuration
// ---------------------------------------------------------------------------

export const SimulatedAgentSchema = z.object({
  agentId: z.string(),
  /** How fast does the agent improve from feedback? 0.0 = no adaptation, 1.0 = perfect learner */
  learningRate: z.number().min(0).max(1),
  /** How long does the agent keep retrying failures? 0.0 = stops at first fail, 1.0 = always retries */
  persistence: z.number().min(0).max(1),
  /** Baseline probability of a clean pass before any adaptation */
  baseAcceptanceRate: z.number().min(0).max(1),
});
export type SimulatedAgent = z.infer<typeof SimulatedAgentSchema>;

// ---------------------------------------------------------------------------
// Round Data
// ---------------------------------------------------------------------------

export const SimulationRoundSchema = z.object({
  roundIndex: z.number().int().min(0),
  agentId: z.string(),
  scenarioId: z.string(),
  outcome: TrustFeedbackOutcome,
  /** Remediation rounds the agent actually consumed for this round */
  remediationRoundsUsed: z.number().int().min(0),
  /** Inferred quality score 0–100 (higher = cleaner submission) */
  qualityScore: z.number().min(0).max(100),
  /** True when the round ended in acceptance (ci_pass, rounds_to_green, or human_review) */
  accepted: z.boolean(),
  /** ISO-8601 timestamp of this simulated round */
  timestamp: z.string(),
});
export type SimulationRound = z.infer<typeof SimulationRoundSchema>;

// ---------------------------------------------------------------------------
// Adaptation State
// ---------------------------------------------------------------------------

export const AdaptationTrendSchema = z.enum(["improving", "stable", "degrading"]);
export type AdaptationTrend = z.infer<typeof AdaptationTrendSchema>;

export const AdaptationStateSchema = z.object({
  agentId: z.string(),
  roundsObserved: z.number().int().min(0),
  /** Rolling-window acceptance rate (last ROLLING_WINDOW rounds) */
  recentAcceptanceRate: z.number().min(0).max(1),
  /** Cumulative acceptance rate over all rounds */
  cumulativeAcceptanceRate: z.number().min(0).max(1),
  /** Mean remediation rounds consumed across all rounds */
  averageRemediationRounds: z.number().min(0),
  /** Quality score at each round (chronological) */
  learningCurve: z.array(z.number()),
  /** Least-squares slope of the learning curve (quality score units per round) */
  learningSlope: z.number(),
  trend: AdaptationTrendSchema,
  /** Wilson score 95 % CI on the acceptance rate [lower, upper] */
  acceptanceRateCI: z.tuple([z.number(), z.number()]),
});
export type AdaptationState = z.infer<typeof AdaptationStateSchema>;

// ---------------------------------------------------------------------------
// Simulation Report
// ---------------------------------------------------------------------------

export const SimulationSummarySchema = z.object({
  /** agentId with the steepest positive learning slope (null if no agents) */
  fastestLearner: z.string().nullable(),
  /** agentId with the highest average remediation rounds (most persistent) */
  mostPersistent: z.string().nullable(),
  /** Dominant trend across all agents */
  overallTrend: AdaptationTrendSchema,
  /** Mean number of rounds (per agent-scenario pair) until first acceptance */
  meanTimeToAccept: z.number().min(0),
  /** Fraction of agents whose trend is "improving" */
  adaptationRate: z.number().min(0).max(1),
});
export type SimulationSummary = z.infer<typeof SimulationSummarySchema>;

export const SimulationReportSchema = z.object({
  experimentId: z.string(),
  runAt: z.string(),
  durationMs: z.number().min(0),
  scenariosRun: z.number().int().min(0),
  agentsSimulated: z.number().int().min(0),
  totalRounds: z.number().int().min(0),
  rounds: z.array(SimulationRoundSchema),
  adaptationStates: z.array(AdaptationStateSchema),
  summary: SimulationSummarySchema,
});
export type SimulationReport = z.infer<typeof SimulationReportSchema>;
