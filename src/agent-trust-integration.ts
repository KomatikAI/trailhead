/**
 * Integration of EXP-AG7 Agent Provenance Trust Scorer into Trailhead Gate
 * 
 * This module wires the agent trust scorer into Trailhead's risk evaluation pipeline.
 * It computes trust metrics for the PR author/agent and adjusts the risk threshold
 * accordingly before making the final gate decision.
 * 
 * Usage: Import and call `computeAgentTrustAdjustment` during gate evaluation,
 * then apply the returned threshold adjustment to the effective risk threshold.
 */

import * as core from "@actions/core";
import { classifyProvenance, computeAgentTrustMetrics, type AgentOutcomeRecord } from "./agent-trust-scorer.js";
import type { PrProvenance } from "./types.js";

// ---------------------------------------------------------------------------
// Agent Trust Metrics Storage Interface
// ---------------------------------------------------------------------------

/**
 * Interface for loading historical agent outcome records.
 * In production, this would query a database or cache of past PR outcomes.
 */
export interface AgentOutcomeStore {
  /**
   * Fetch historical outcome records for a given agent or all agents.
   * @param agentId Optional agent ID to filter by; if null, returns all records
   * @returns Array of outcome records
   */
  getRecords(agentId?: string): Promise<AgentOutcomeRecord[]>;
  
  /**
   * Store a new outcome record after deployment.
   * Called via webhook when a deployment completes.
   */
  storeRecord(record: AgentOutcomeRecord): Promise<void>;
}

// ---------------------------------------------------------------------------
// Agent Trust Adjustment Logic
// ---------------------------------------------------------------------------

/**
 * Result of computing agent trust adjustment
 */
export interface AgentTrustAdjustment {
  /** The agent ID that was evaluated */
  agentId: string;
  /** The provenance type detected */
  provenanceType: "human" | "codex" | "claude" | "cursor" | "custom-bot" | "unknown";
  /** Trust band assignment */
  trustBand: "high" | "medium" | "low" | "untrusted";
  /** Recommended threshold adjustment (positive = raise threshold/stricter, negative = lower/lenient) */
  thresholdAdjustment: number;
  /** Number of historical samples used */
  sampleCount: number;
  /** Escape rate (false negatives / total) */
  escapeRate: number;
  /** Confidence level based on sample size */
  confidence: "high" | "medium" | "low";
  /** Human-readable explanation */
  reason: string;
}

/**
 * Compute agent trust adjustment for a given PR provenance.
 * 
 * This function:
 * 1. Classifies the provenance from PR signals
 * 2. Loads historical outcome records for that agent
 * 3. Computes trust metrics (escape rate, false positive rate, etc.)
 * 4. Returns a threshold adjustment recommendation
 * 
 * @param provenance - The detected PR provenance
 * @param store - The outcome store to fetch historical data
 * @returns AgentTrustAdjustment or null if insufficient data
 */
export async function computeAgentTrustAdjustment(
  provenance: PrProvenance | null,
  store: AgentOutcomeStore,
): Promise<AgentTrustAdjustment | null> {
  // If no provenance detected, return untrusted with no adjustment
  if (!provenance) {
    return {
      agentId: "unknown",
      provenanceType: "unknown",
      trustBand: "untrusted",
      thresholdAdjustment: 0,
      sampleCount: 0,
      escapeRate: 0,
      confidence: "low",
      reason: "No provenance detected — defaulting to standard threshold",
    };
  }

  // Map provenance type to agent ID format
  const agentId = mapProvenanceToAgentId(provenance);
  
  // Load historical records for this agent
  const records = await store.getRecords(agentId);
  
  if (records.length === 0) {
    // No historical data — return untrusted with default adjustment
    return {
      agentId,
      provenanceType: provenance.type,
      trustBand: "untrusted",
      thresholdAdjustment: 0,
      sampleCount: 0,
      escapeRate: 0,
      confidence: "low",
      reason: "No historical outcome data — using default threshold",
    };
  }

  // Compute trust metrics from historical outcomes
  const metrics = computeAgentTrustMetrics(records, agentId);
  
  if (!metrics) {
    return {
      agentId,
      provenanceType: provenance.type,
      trustBand: "untrusted",
      thresholdAdjustment: 0,
      sampleCount: records.length,
      escapeRate: 0,
      confidence: "low",
      reason: "Could not compute metrics from available records",
    };
  }

  // Determine confidence based on sample size
  let confidence: "high" | "medium" | "low" = "low";
  if (metrics.totalReviews >= 20) {
    confidence = "high";
  } else if (metrics.totalReviews >= 10) {
    confidence = "medium";
  }

  // Build human-readable reason
  const reason = buildTrustReason(metrics);

  return {
    agentId,
    provenanceType: provenance.type,
    trustBand: metrics.trustBand,
    thresholdAdjustment: metrics.recommendedThresholdAdjustment,
    sampleCount: metrics.totalReviews,
    escapeRate: metrics.escapeRate,
    confidence,
    reason,
  };
}

/**
 * Map PR provenance to an agent ID format suitable for lookup.
 */
function mapProvenanceToAgentId(provenance: PrProvenance): string {
  switch (provenance.type) {
    case "human":
      return "human";
    case "codex":
      return "codex";
    case "claude":
      return "claude";
    case "cursor":
      return "cursor";
    case "custom-bot":
      // For custom bots, we'd want to extract the specific agent name
      // For now, return a generic identifier
      return "custom-agent";
    case "unknown":
      return "unknown";
    default:
      return "unknown";
  }
}

/**
 * Build a human-readable explanation for the trust band assignment.
 */
function buildTrustReason(metrics: import("./agent-trust-scorer.js").AgentTrustMetrics): string {
  const parts: string[] = [];
  
  parts.push(`${metrics.trustBand} trust agent`);
  parts.push(`escape rate: ${metrics.escapeRate}%`);
  parts.push(`false positive rate: ${metrics.falsePositiveRate}%`);
  parts.push(`${metrics.totalReviews} historical reviews`);
  
  if (metrics.escapeRate > 0.1) {
    parts.push("WARNING: High escape rate — stricter review recommended");
  }
  
  if (metrics.reverts > 0 || metrics.hotfixes > 0) {
    parts.push(`${metrics.reverts} reverts, ${metrics.hotfixes} hotfixes recorded`);
  }
  
  return parts.join("; ");
}

/**
 * Apply agent trust adjustment to the risk threshold.
 * 
 * @param baseThreshold - The base risk threshold (e.g., 70)
 * @param adjustment - The adjustment value from computeAgentTrustAdjustment
 * @returns The adjusted threshold, clamped to [30, 95]
 */
export function applyTrustAdjustment(
  baseThreshold: number,
  adjustment: number,
): number {
  return Math.max(30, Math.min(95, baseThreshold + adjustment));
}

// ---------------------------------------------------------------------------
// Integration with Trailhead Gate
// ---------------------------------------------------------------------------

/**
 * Parameters for integrating agent trust into gate evaluation.
 */
export interface AgentTrustGateParams {
  /** The detected provenance of the PR */
  provenance: PrProvenance | null;
  /** The base risk threshold from config */
  baseRiskThreshold: number;
  /** The outcome store for fetching historical data */
  outcomeStore: AgentOutcomeStore;
  /** Whether to enable agent trust adjustment */
  enabled: boolean;
}

/**
 * Result of agent trust gate integration.
 */
export interface AgentTrustGateResult {
  /** The adjusted risk threshold to use */
  adjustedThreshold: number;
  /** Details about the agent trust evaluation */
  adjustment: AgentTrustAdjustment | null;
  /** Policy findings to include in PR comment */
  findings: string[];
}

/**
 * Integrate agent trust scoring into Trailhead gate evaluation.
 * 
 * This should be called during the gate evaluation process, after
 * provenance detection but before the final gate decision.
 * 
 * @param params - Integration parameters
 * @returns Gate result with adjusted threshold
 */
export async function integrateAgentTrustIntoGate(
  params: AgentTrustGateParams,
): Promise<AgentTrustGateResult> {
  const findings: string[] = [];
  
  if (!params.enabled) {
    return {
      adjustedThreshold: params.baseRiskThreshold,
      adjustment: null,
      findings: [],
    };
  }

  // Compute the trust adjustment
  const adjustment = await computeAgentTrustAdjustment(
    params.provenance,
    params.outcomeStore,
  );

  if (!adjustment) {
    return {
      adjustedThreshold: params.baseRiskThreshold,
      adjustment: null,
      findings: [],
    };
  }

  // Apply the adjustment to the threshold
  const adjustedThreshold = applyTrustAdjustment(
    params.baseRiskThreshold,
    adjustment.thresholdAdjustment,
  );

  // Build findings for PR comment
  if (adjustment.trustBand !== "untrusted") {
    findings.push(
      `Agent trust: **${adjustment.trustBand}** (${adjustment.provenanceType}, ` +
      `${adjustment.sampleCount} samples, ${adjustment.confidence} confidence). ` +
      `Threshold adjusted from ${params.baseRiskThreshold} → ${adjustedThreshold} ` +
      `(adjustment: ${adjustment.thresholdAdjustment > 0 ? "+" : ""}${adjustment.thresholdAdjustment}).`,
    );
    
    if (adjustment.escapeRate > 0.1) {
      findings.push(
        `⚠️ **High escape rate** (${(adjustment.escapeRate * 100).toFixed(1)}%) — ` +
        `stricter review recommended for this agent.`,
      );
    }
  }

  core.debug(
    `Agent trust adjustment: ${adjustment.agentId} → ${adjustment.trustBand} trust, ` +
    `threshold ${params.baseRiskThreshold} → ${adjustedThreshold} (${adjustment.reason})`,
  );

  return {
    adjustedThreshold,
    adjustment,
    findings,
  };
}

// ---------------------------------------------------------------------------
// Mock Store for Testing
// ---------------------------------------------------------------------------

/**
 * Mock implementation of AgentOutcomeStore for testing.
 * In production, this would be replaced with a real database-backed store.
 */
export class MockOutcomeStore implements AgentOutcomeStore {
  private records: AgentOutcomeRecord[] = [];

  constructor(initialRecords?: AgentOutcomeRecord[]) {
    this.records = initialRecords ?? [];
  }

  async getRecords(agentId?: string): Promise<AgentOutcomeRecord[]> {
    if (agentId) {
      return this.records.filter((r) => r.agentId === agentId);
    }
    return this.records;
  }

  async storeRecord(record: AgentOutcomeRecord): Promise<void> {
    this.records.push(record);
  }

  /**
   * Add sample records for testing.
   */
  addSampleRecords(): void {
    this.records = [
      // High trust agent (rd-satellite)
      {
        id: "rec-1",
        agentId: "rd-satellite",
        provenanceType: "custom-bot",
        repo: "KomatikAI/trailhead",
        evaluationId: "eval-001",
        gateDecision: "allow",
        actualOutcome: "success",
        riskScore: 25,
        timestamp: "2026-05-20T10:00:00.000Z",
      },
      {
        id: "rec-2",
        agentId: "rd-satellite",
        provenanceType: "custom-bot",
        repo: "KomatikAI/trailhead",
        evaluationId: "eval-002",
        gateDecision: "warn",
        actualOutcome: "success",
        riskScore: 65,
        timestamp: "2026-05-21T10:00:00.000Z",
      },
      {
        id: "rec-3",
        agentId: "rd-satellite",
        provenanceType: "custom-bot",
        repo: "KomatikAI/trailhead",
        evaluationId: "eval-003",
        gateDecision: "allow",
        actualOutcome: "no_incident",
        riskScore: 30,
        timestamp: "2026-05-22T10:00:00.000Z",
      },
      // Medium trust agent (frontend-dev)
      {
        id: "rec-4",
        agentId: "frontend-dev",
        provenanceType: "human",
        repo: "KomatikAI/trailhead",
        evaluationId: "eval-004",
        gateDecision: "allow",
        actualOutcome: "success",
        riskScore: 15,
        timestamp: "2026-05-22T10:00:00.000Z",
      },
      {
        id: "rec-5",
        agentId: "frontend-dev",
        provenanceType: "human",
        repo: "KomatikAI/trailhead",
        evaluationId: "eval-005",
        gateDecision: "allow",
        actualOutcome: "no_incident",
        riskScore: 20,
        timestamp: "2026-05-23T10:00:00.000Z",
      },
      // Low trust agent (claude-session)
      {
        id: "rec-6",
        agentId: "claude-session-123",
        provenanceType: "claude",
        repo: "KomatikAI/trailhead",
        evaluationId: "eval-006",
        gateDecision: "warn",
        actualOutcome: "hotfix",
        riskScore: 55,
        timestamp: "2026-05-23T10:00:00.000Z",
      },
      {
        id: "rec-7",
        agentId: "claude-session-123",
        provenanceType: "claude",
        repo: "KomatikAI/trailhead",
        evaluationId: "eval-007",
        gateDecision: "allow",
        actualOutcome: "revert",
        riskScore: 45,
        timestamp: "2026-05-24T10:00:00.000Z",
      },
    ];
  }
}
