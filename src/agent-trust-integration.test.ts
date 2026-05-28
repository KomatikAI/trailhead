/**
 * Tests for Agent Trust Integration into Trailhead Gate
 * 
 * These tests verify that the agent trust scoring correctly adjusts
 * risk thresholds based on historical agent performance.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeAgentTrustAdjustment,
  applyTrustAdjustment,
  integrateAgentTrustIntoGate,
  MockOutcomeStore,
  type AgentOutcomeRecord,
} from "./agent-trust-integration.js";
import type { PrProvenance } from "./types.js";

describe("Agent Trust Integration", () => {
  describe("computeAgentTrustAdjustment", () => {
    it("returns null when provenance is null", async () => {
      const store = new MockOutcomeStore();
      const result = await computeAgentTrustAdjustment(null, store);
      
      expect(result).toEqual({
        agentId: "unknown",
        provenanceType: "unknown",
        trustBand: "untrusted",
        thresholdAdjustment: 0,
        sampleCount: 0,
        escapeRate: 0,
        confidence: "low",
        reason: "No provenance detected — defaulting to standard threshold",
      });
    });

    it("returns untrusted when no historical data exists", async () => {
      const store = new MockOutcomeStore();
      const provenance: PrProvenance = {
        type: "codex",
        confidence: 0.9,
        source: "author/branch/commit-signals",
      };

      const result = await computeAgentTrustAdjustment(provenance, store);

      expect(result).toEqual({
        agentId: "codex",
        provenanceType: "codex",
        trustBand: "untrusted",
        thresholdAdjustment: 0,
        sampleCount: 0,
        escapeRate: 0,
        confidence: "low",
        reason: "No historical outcome data — using default threshold",
      });
    });

    it("computes high trust for agent with low escape rate", async () => {
      const store = new MockOutcomeStore();
      store.addSampleRecords();

      const provenance: PrProvenance = {
        type: "custom-bot",
        confidence: 0.86,
        source: "agent/rd-satellite",
      };

      const result = await computeAgentTrustAdjustment(provenance, store);

      expect(result).toBeDefined();
      expect(result?.agentId).toBe("rd-satellite");
      expect(result?.trustBand).toBe("high");
      expect(result?.thresholdAdjustment).toBe(-12); // High trust = lower threshold
      expect(result?.sampleCount).toBe(3);
      expect(result?.confidence).toBe("low"); // Only 3 samples
      expect(result?.escapeRate).toBe(0); // No escapes
    });

    it("computes low trust for agent with high escape rate", async () => {
      const store = new MockOutcomeStore();
      store.addSampleRecords();

      const provenance: PrProvenance = {
        type: "claude",
        confidence: 0.92,
        source: "author/branch/commit-signals",
      };

      const result = await computeAgentTrustAdjustment(provenance, store);

      expect(result).toBeDefined();
      expect(result?.agentId).toBe("claude-session-123");
      expect(result?.trustBand).toBe("low");
      expect(result?.thresholdAdjustment).toBe(25); // Low trust + high escape = +25
      expect(result?.sampleCount).toBe(2);
      expect(result?.escapeRate).toBe(0.5); // 1 escape out of 2
    });

    it("correctly identifies human provenance", async () => {
      const store = new MockOutcomeStore();
      store.addSampleRecords();

      const provenance: PrProvenance = {
        type: "human",
        confidence: 0.95,
        source: "author/branch/commit-signals",
      };

      const result = await computeAgentTrustAdjustment(provenance, store);

      expect(result).toBeDefined();
      expect(result?.agentId).toBe("human");
      expect(result?.provenanceType).toBe("human");
      // Humans typically have good track records
      expect(result?.trustBand).toBe("high");
      expect(result?.thresholdAdjustment).toBe(-12);
    });

    it("includes escape rate penalty in threshold adjustment", async () => {
      // Create records with high escape rate
      const records: AgentOutcomeRecord[] = [
        {
          id: "rec-1",
          agentId: "test-agent",
          provenanceType: "claude",
          repo: "test/repo",
          evaluationId: "eval-001",
          gateDecision: "allow",
          actualOutcome: "hotfix",
          riskScore: 50,
          timestamp: "2026-05-20T10:00:00.000Z",
        },
        {
          id: "rec-2",
          agentId: "test-agent",
          provenanceType: "claude",
          repo: "test/repo",
          evaluationId: "eval-002",
          gateDecision: "allow",
          actualOutcome: "revert",
          riskScore: 45,
          timestamp: "2026-05-21T10:00:00.000Z",
        },
      ];

      const store = new MockOutcomeStore(records);

      const provenance: PrProvenance = {
        type: "claude",
        confidence: 0.9,
        source: "author/branch/commit-signals",
      };

      const result = await computeAgentTrustAdjustment(provenance, store);

      expect(result).toBeDefined();
      expect(result?.escapeRate).toBe(1.0); // 2 escapes out of 2
      // Base adjustment for low trust is +10, plus +15 for escapeRate > 0.1
      expect(result?.thresholdAdjustment).toBe(25);
    });
  });

  describe("applyTrustAdjustment", () => {
    it("applies positive adjustment correctly", () => {
      const result = applyTrustAdjustment(70, 15);
      expect(result).toBe(85);
    });

    it("applies negative adjustment correctly", () => {
      const result = applyTrustAdjustment(70, -12);
      expect(result).toBe(58);
    });

    it("clamps to minimum threshold", () => {
      const result = applyTrustAdjustment(70, -50);
      expect(result).toBe(30); // Minimum is 30
    });

    it("clamps to maximum threshold", () => {
      const result = applyTrustAdjustment(70, 40);
      expect(result).toBe(95); // Maximum is 95
    });

    it("returns base when adjustment is zero", () => {
      const result = applyTrustAdjustment(70, 0);
      expect(result).toBe(70);
    });
  });

  describe("integrateAgentTrustIntoGate", () => {
    it("returns base threshold when disabled", async () => {
      const store = new MockOutcomeStore();
      store.addSampleRecords();

      const result = await integrateAgentTrustIntoGate({
        provenance: { type: "human", confidence: 0.9, source: "test" },
        baseRiskThreshold: 70,
        outcomeStore: store,
        enabled: false,
      });

      expect(result.adjustedThreshold).toBe(70);
      expect(result.adjustment).toBeNull();
      expect(result.findings).toEqual([]);
    });

    it("applies trust adjustment when enabled", async () => {
      const store = new MockOutcomeStore();
      store.addSampleRecords();

      const result = await integrateAgentTrustIntoGate({
        provenance: { type: "custom-bot", confidence: 0.86, source: "agent/rd-satellite" },
        baseRiskThreshold: 70,
        outcomeStore: store,
        enabled: true,
      });

      expect(result.adjustedThreshold).toBe(58); // 70 - 12
      expect(result.adjustment).toBeDefined();
      expect(result.adjustment?.trustBand).toBe("high");
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toContain("Agent trust: **high**");
      expect(result.findings[0]).toContain("threshold adjusted from 70 → 58");
    });

    it("includes warning for high escape rate", async () => {
      const store = new MockOutcomeStore();
      store.addSampleRecords();

      const result = await integrateAgentTrustIntoGate({
        provenance: { type: "claude", confidence: 0.92, source: "test" },
        baseRiskThreshold: 70,
        outcomeStore: store,
        enabled: true,
      });

      expect(result.findings).toHaveLength(2);
      expect(result.findings[0]).toContain("Agent trust: **low**");
      expect(result.findings[1]).toContain("⚠️ **High escape rate**");
    });

    it("handles unknown provenance gracefully", async () => {
      const store = new MockOutcomeStore();

      const result = await integrateAgentTrustIntoGate({
        provenance: { type: "unknown", confidence: 0.2, source: "not-detected" },
        baseRiskThreshold: 70,
        outcomeStore: store,
        enabled: true,
      });

      expect(result.adjustedThreshold).toBe(70); // No adjustment for unknown
      expect(result.adjustment?.trustBand).toBe("untrusted");
    });
  });

  describe("Trust band assignment", () => {
    it("assigns high trust for low escape rate with sufficient samples", () => {
      const records: AgentOutcomeRecord[] = [
        // Create 20 records with 0 escapes
        ...Array.from({ length: 20 }, (_, i) => ({
          id: `rec-${i}`,
          agentId: "trusted-agent",
          provenanceType: "human" as const,
          repo: "test/repo",
          evaluationId: `eval-${i}`,
          gateDecision: "allow" as const,
          actualOutcome: "success" as const,
          riskScore: 30,
          timestamp: `2026-05-${(i % 30) + 1}T10:00:00.000Z`,
        })),
      ];

      const store = new MockOutcomeStore(records);

      (async () => {
        const result = await computeAgentTrustAdjustment(
          { type: "human", confidence: 0.95, source: "test" },
          store,
        );
        expect(result?.trustBand).toBe("high");
        expect(result?.escapeRate).toBe(0);
      })();
    });

    it("assigns medium trust for moderate performance", () => {
      const records: AgentOutcomeRecord[] = [
        // 15 records with 1 escape (6.7% escape rate)
        ...Array.from({ length: 14 }, (_, i) => ({
          id: `rec-${i}`,
          agentId: "moderate-agent",
          provenanceType: "codex" as const,
          repo: "test/repo",
          evaluationId: `eval-${i}`,
          gateDecision: "allow" as const,
          actualOutcome: "success" as const,
          riskScore: 30,
          timestamp: `2026-05-${(i % 30) + 1}T10:00:00.000Z`,
        })),
        {
          id: "rec-14",
          agentId: "moderate-agent",
          provenanceType: "codex",
          repo: "test/repo",
          evaluationId: "eval-14",
          gateDecision: "allow",
          actualOutcome: "hotfix",
          riskScore: 60,
          timestamp: "2026-05-20T10:00:00.000Z",
        },
      ];

      const store = new MockOutcomeStore(records);

      (async () => {
        const result = await computeAgentTrustAdjustment(
          { type: "codex", confidence: 0.9, source: "test" },
          store,
        );
        expect(result?.trustBand).toBe("medium");
        expect(result?.escapeRate).toBe(0.067); // 1/15
      })();
    });
  });

  describe("Confidence levels", () => {
    it("returns high confidence for 20+ samples", async () => {
      const records = Array.from({ length: 25 }, (_, i) => ({
        id: `rec-${i}`,
        agentId: "sample-agent",
        provenanceType: "human" as const,
        repo: "test/repo",
        evaluationId: `eval-${i}`,
        gateDecision: "allow" as const,
        actualOutcome: "success" as const,
        riskScore: 30,
        timestamp: `2026-05-${(i % 30) + 1}T10:00:00.000Z`,
      }));

      const store = new MockOutcomeStore(records);
      const result = await computeAgentTrustAdjustment(
        { type: "human", confidence: 0.95, source: "test" },
        store,
      );

      expect(result?.confidence).toBe("high");
    });

    it("returns medium confidence for 10-19 samples", async () => {
      const records = Array.from({ length: 15 }, (_, i) => ({
        id: `rec-${i}`,
        agentId: "sample-agent",
        provenanceType: "human" as const,
        repo: "test/repo",
        evaluationId: `eval-${i}`,
        gateDecision: "allow" as const,
        actualOutcome: "success" as const,
        riskScore: 30,
        timestamp: `2026-05-${(i % 30) + 1}T10:00:00.000Z`,
      }));

      const store = new MockOutcomeStore(records);
      const result = await computeAgentTrustAdjustment(
        { type: "human", confidence: 0.95, source: "test" },
        store,
      );

      expect(result?.confidence).toBe("medium");
    });

    it("returns low confidence for fewer than 10 samples", async () => {
      const records = Array.from({ length: 5 }, (_, i) => ({
        id: `rec-${i}`,
        agentId: "sample-agent",
        provenanceType: "human" as const,
        repo: "test/repo",
        evaluationId: `eval-${i}`,
        gateDecision: "allow" as const,
        actualOutcome: "success" as const,
        riskScore: 30,
        timestamp: `2026-05-${(i % 30) + 1}T10:00:00.000Z`,
      }));

      const store = new MockOutcomeStore(records);
      const result = await computeAgentTrustAdjustment(
        { type: "human", confidence: 0.95, source: "test" },
        store,
      );

      expect(result?.confidence).toBe("low");
    });
  });
});
