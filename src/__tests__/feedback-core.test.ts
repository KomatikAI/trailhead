import { describe, expect, it } from "vitest";
import {
  aggregateDetectorNoise,
  buildDigestPayload,
  generateTuningYaml,
  recommendPolicyTuning,
  type DetectorFeedbackRecord,
} from "../feedback-core.js";

function record(overrides: Partial<DetectorFeedbackRecord> = {}): DetectorFeedbackRecord {
  return {
    id: "fb-1",
    orgId: "komatik",
    detector: "supply_chain",
    disposition: "false_positive",
    timestamp: "2026-05-20T12:00:00.000Z",
    ...overrides,
  };
}

describe("feedback-core", () => {
  it("aggregates detector noise and flags >15% FP", () => {
    const rows = [
      record({ detector: "supply_chain", disposition: "false_positive" }),
      record({ id: "2", detector: "supply_chain", disposition: "false_positive" }),
      record({ id: "3", detector: "supply_chain", disposition: "true_positive" }),
      record({ id: "4", detector: "ci_integrity", disposition: "true_positive" }),
    ];
    const noise = aggregateDetectorNoise(rows, { fpThreshold: 15 });
    expect(noise.detectors[0].detector).toBe("supply_chain");
    expect(noise.detectors[0].falsePositiveRate).toBe(66.7);
    expect(noise.detectors[0].noisy).toBe(true);
    expect(noise.detectors.find((d) => d.detector === "ci_integrity")?.noisy).toBe(false);
  });

  it("recommends tuning for noisy detectors", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      record({
        id: `fp-${i}`,
        detector: "duplicate_logic",
        disposition: "false_positive",
      }),
    );
    const tuning = recommendPolicyTuning(rows, { falsePositiveThreshold: 15 });
    expect(tuning.recommendations).toHaveLength(1);
    expect(tuning.recommendations[0].detector).toBe("duplicate_logic");
  });

  it("exports tuning as YAML snippet", () => {
    const yaml = generateTuningYaml(
      [
        {
          detector: "supply_chain",
          recommendation: "warn mode",
          expectedImpact: "less noise",
          confidence: "high",
          falsePositiveRate: 40,
          samples: 20,
        },
      ],
      "KomatikAI/trailhead",
    );
    expect(yaml).toContain("supply_chain:");
    expect(yaml).toContain("mode: warn");
    expect(yaml).toContain("KomatikAI/trailhead");
  });

  it("builds digest for noisy detectors", () => {
    const noise = aggregateDetectorNoise([record(), record({ id: "2" })], {
      fpThreshold: 15,
    });
    const digest = buildDigestPayload(noise, "Komatik");
    expect(digest.noisyDetectors.length).toBe(1);
    expect(digest.subject).toContain("Komatik");
  });
});
