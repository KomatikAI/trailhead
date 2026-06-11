/**
 * EXP-AG4: Simulation Runner
 *
 * Orchestrates the full feedback simulation experiment.
 *
 * Runs multiple simulated agents through multiple feedback scenarios,
 * collects per-round data, computes adaptation states, and produces a
 * consolidated SimulationReport.
 *
 * Entry point for the experiment:
 *   const runner = new SimulationRunner();
 *   const report = runner.run("exp-ag4");
 *   console.log(report.summary);
 *
 * Date: 2026-06-01
 * Author: Edison (rd-platform)
 */

import type {
  SimulatedAgent,
  SimulationReport,
  SimulationRound,
  AdaptationTrend,
} from "./types.js";
import {
  FeedbackGenerator,
  CANONICAL_SCENARIOS,
  type GeneratorConfig,
} from "./feedback-generator.js";
import { AdaptationTracker } from "./adaptation-tracker.js";

// ---------------------------------------------------------------------------
// Default Agent Profiles
// ---------------------------------------------------------------------------

/**
 * Five archetypal simulated agents covering the spectrum of learning behaviours.
 * These are not mocks — they are parametric profiles used as simulation inputs.
 */
export const DEFAULT_AGENTS: SimulatedAgent[] = [
  {
    agentId: "fast-learner",
    learningRate: 0.85,
    persistence: 0.9,
    baseAcceptanceRate: 0.6,
  },
  {
    agentId: "steady-performer",
    learningRate: 0.5,
    persistence: 0.7,
    baseAcceptanceRate: 0.75,
  },
  {
    agentId: "slow-adapter",
    learningRate: 0.2,
    persistence: 0.8,
    baseAcceptanceRate: 0.65,
  },
  {
    agentId: "high-volume",
    learningRate: 0.4,
    persistence: 0.95,
    baseAcceptanceRate: 0.55,
  },
  {
    agentId: "cautious",
    learningRate: 0.6,
    persistence: 0.3,
    baseAcceptanceRate: 0.9,
  },
];

// ---------------------------------------------------------------------------
// Runner Configuration
// ---------------------------------------------------------------------------

export interface RunnerConfig {
  /** Override the feedback generator config */
  generatorConfig?: Partial<GeneratorConfig>;
  /** Agent profiles to simulate (defaults to DEFAULT_AGENTS) */
  agents?: SimulatedAgent[];
  /** If set, only run scenarios whose id is in this list */
  scenarioIds?: string[];
  /** How many times each agent repeats each scenario (builds the learning curve) */
  roundsPerScenario?: number;
}

const DEFAULT_RUNNER_CONFIG: Required<RunnerConfig> = {
  generatorConfig: {},
  agents: DEFAULT_AGENTS,
  scenarioIds: [],
  roundsPerScenario: 20,
};

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the mean first-acceptance round index across all agent-scenario pairs.
 * Returns 0 when no round was ever accepted.
 */
function meanTimeToAccept(rounds: SimulationRound[]): number {
  const firstAccept = new Map<string, number>();

  for (const round of rounds) {
    const key = `${round.agentId}::${round.scenarioId}`;
    if (round.accepted && !firstAccept.has(key)) {
      firstAccept.set(key, round.roundIndex);
    }
  }

  const values = [...firstAccept.values()];
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Return the trend that appears most frequently across all agents. */
function dominantTrend(trends: AdaptationTrend[]): AdaptationTrend {
  if (trends.length === 0) return "stable";
  const counts: Record<AdaptationTrend, number> = {
    improving: 0,
    stable: 0,
    degrading: 0,
  };
  for (const t of trends) counts[t]++;
  if (counts.improving >= counts.degrading && counts.improving >= counts.stable)
    return "improving";
  if (counts.degrading > counts.stable) return "degrading";
  return "stable";
}

// ---------------------------------------------------------------------------
// SimulationRunner
// ---------------------------------------------------------------------------

export class SimulationRunner {
  private readonly config: Required<RunnerConfig>;

  constructor(config: RunnerConfig = {}) {
    this.config = { ...DEFAULT_RUNNER_CONFIG, ...config };
  }

  /**
   * Execute the simulation and return a full SimulationReport.
   *
   * @param experimentId  Label for this run (stored in the report)
   */
  run(experimentId: string = "exp-ag4"): SimulationReport {
    const startTime = Date.now();

    const generator = new FeedbackGenerator({
      ...this.config.generatorConfig,
      roundsPerScenario: this.config.roundsPerScenario,
    });

    const tracker = new AdaptationTracker();

    // Filter scenarios if caller requested a subset
    const scenarios =
      this.config.scenarioIds.length > 0
        ? CANONICAL_SCENARIOS.filter((s) =>
            this.config.scenarioIds.includes(s.id),
          )
        : CANONICAL_SCENARIOS;

    // Generate rounds: for each agent, run every scenario
    const allRounds: SimulationRound[] = [];
    let globalRoundOffset = 0;

    for (const agent of this.config.agents) {
      for (const scenario of scenarios) {
        const rounds = generator.generateRoundsForAgent(
          agent,
          scenario,
          this.config.roundsPerScenario,
          globalRoundOffset,
        );
        allRounds.push(...rounds);
        globalRoundOffset += this.config.roundsPerScenario;
      }
    }

    // Compute adaptation states for every agent
    const agentIds = this.config.agents.map((a) => a.agentId);
    const adaptationStates = tracker.computeAllStates(agentIds, allRounds);

    // Build summary statistics
    const sortedBySlope = [...adaptationStates].sort(
      (a, b) => b.learningSlope - a.learningSlope,
    );
    const fastestLearner = sortedBySlope[0]?.agentId ?? null;

    const sortedByRemediation = [...adaptationStates].sort(
      (a, b) => b.averageRemediationRounds - a.averageRemediationRounds,
    );
    const mostPersistent = sortedByRemediation[0]?.agentId ?? null;

    const overallTrend = dominantTrend(adaptationStates.map((s) => s.trend));
    const improvingCount = adaptationStates.filter(
      (s) => s.trend === "improving",
    ).length;
    const adaptationRate =
      adaptationStates.length > 0
        ? improvingCount / adaptationStates.length
        : 0;

    return {
      experimentId,
      runAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      scenariosRun: scenarios.length,
      agentsSimulated: this.config.agents.length,
      totalRounds: allRounds.length,
      rounds: allRounds,
      adaptationStates,
      summary: {
        fastestLearner,
        mostPersistent,
        overallTrend,
        meanTimeToAccept: meanTimeToAccept(allRounds),
        adaptationRate,
      },
    };
  }
}
