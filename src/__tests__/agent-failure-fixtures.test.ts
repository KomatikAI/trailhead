import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertFixtureRegistryComplete,
  type AgentFixtureManifest,
} from "../agent-fixture-registry.js";
import { buildRemediation } from "../remediation.js";
import type { BuildRemediationInput } from "../remediation.js";
import type { GateEvaluation, Remediation, RiskFactor } from "../types.js";
import { applyLabelOverrideToEvaluation, resolveLabelOverride } from "../override.js";
import type { ReleaseReadyResult } from "../release-ready.js";

const fixturesRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "agent-failures",
);

interface RemediationExpected {
  release_ready: boolean;
  blocking_count: number;
  warn_count: number;
  advisory_count?: number;
  loop_round: number;
  max_loop_rounds?: number;
  next_action: Remediation["next_action"];
  fix_codes: Array<{ code: string; severity: string }>;
  fixes_introduced: string[];
  fixes_resolved: string[];
}

interface RemediationScenario {
  id: string;
  kind: "remediation";
  description?: string;
  input: BuildRemediationInput;
}

interface RemediationSequenceScenario {
  id: string;
  kind: "remediation-sequence";
  description?: string;
  steps: Array<{
    label: string;
    input: BuildRemediationInput;
    expectedFile: string;
  }>;
}

interface OverrideScenario {
  id: string;
  kind: "override";
  description?: string;
  input: {
    labels: string[];
    comments: Array<{ body: string; author?: string }>;
    config: { enabled: boolean; maxPerWeek: number };
    recentOverrideCount: number | null;
    releaseResult: ReleaseReadyResult;
    gateDecision: GateEvaluation["gateDecision"];
    prNumber: number;
  };
  expected: {
    kind: "applied" | "rejected";
    code?: string;
    release_ready?: boolean;
    policy_override_source?: string;
  };
}

function loadJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

function normalizeRemediation(remediation: Remediation): RemediationExpected {
  return {
    release_ready: remediation.release_ready,
    blocking_count: remediation.blocking_count,
    warn_count: remediation.warn_count,
    advisory_count: remediation.advisory_count,
    loop_round: remediation.loop_round,
    max_loop_rounds: remediation.max_loop_rounds,
    next_action: remediation.next_action,
    fix_codes: remediation.fixes
      .map((fix) => ({ code: fix.code, severity: fix.severity }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    fixes_introduced: [...remediation.fixes_introduced].sort(),
    fixes_resolved: [...remediation.fixes_resolved].sort(),
  };
}

function assertRemediationMatches(
  actual: Remediation,
  expected: RemediationExpected,
  label: string,
): void {
  expect(normalizeRemediation(actual), label).toEqual({
    ...expected,
    fix_codes: [...expected.fix_codes].sort((a, b) => a.code.localeCompare(b.code)),
    fixes_introduced: [...expected.fixes_introduced].sort(),
    fixes_resolved: [...expected.fixes_resolved].sort(),
  });
}

const manifest = loadJson<AgentFixtureManifest>(path.join(fixturesRoot, "manifest.json"));

describe("A8 agent fixture registry guard", () => {
  it("manifest covers all registered submission and risk-factor detectors", () => {
    const errors = assertFixtureRegistryComplete(manifest);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  it("every manifest fixture has a scenario.json", () => {
    for (const fixtureId of manifest.fixtures) {
      expect(
        existsSync(path.join(fixturesRoot, fixtureId, "scenario.json")),
        `missing scenario for ${fixtureId}`,
      ).toBe(true);
    }
  });

  it("fixture directories match manifest entries", () => {
    const dirs = readdirSync(fixturesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(dirs).toEqual([...manifest.fixtures].sort());
  });
});

describe("A8 fleet agent failure fixtures", () => {
  for (const fixtureId of manifest.fixtures) {
    const scenarioPath = path.join(fixturesRoot, fixtureId, "scenario.json");
    const scenario = loadJson<
      RemediationScenario | RemediationSequenceScenario | OverrideScenario
    >(scenarioPath);

    if (scenario.kind === "remediation") {
      it(`remediation fixture: ${fixtureId}`, () => {
        const expected = loadJson<RemediationExpected>(
          path.join(fixturesRoot, fixtureId, "remediation.expected.json"),
        );
        const remediation = buildRemediation(scenario.input);
        assertRemediationMatches(remediation, expected, fixtureId);
      });
      continue;
    }

    if (scenario.kind === "remediation-sequence") {
      it(`loop sequence fixture: ${fixtureId}`, () => {
        let previous: BuildRemediationInput["previousEvaluation"] = null;

        for (const step of scenario.steps) {
          const remediation = buildRemediation({
            ...step.input,
            previousEvaluation: previous,
          });
          const expected = loadJson<RemediationExpected>(
            path.join(fixturesRoot, fixtureId, step.expectedFile),
          );
          assertRemediationMatches(remediation, expected, `${fixtureId}/${step.label}`);
          previous = {
            id: step.input.evaluation.id,
            remediation,
          };
        }
      });
      continue;
    }

    if (scenario.kind === "override") {
      it(`override fixture: ${fixtureId}`, () => {
        const outcome = resolveLabelOverride({
          labels: scenario.input.labels,
          comments: scenario.input.comments,
          config: scenario.input.config,
          recentOverrideCount: scenario.input.recentOverrideCount,
          releaseResult: scenario.input.releaseResult,
          gateDecision: scenario.input.gateDecision,
          prNumber: scenario.input.prNumber,
        });

        if (scenario.expected.kind === "applied") {
          expect(outcome.kind).toBe("applied");
          if (outcome.kind !== "applied") return;

          const evaluation = applyLabelOverrideToEvaluation(
            {
              id: "eval-override",
              repoId: "KomatikAI/trailhead",
              commitSha: "abc123",
              healthScore: 100,
              riskScore: 90,
              gateDecision: scenario.input.gateDecision,
              healthChecks: [],
              riskFactors: [] as RiskFactor[],
              evaluationMs: 1,
              releaseReady: false,
            },
            outcome.audit,
          );

          expect(evaluation.releaseReady).toBe(scenario.expected.release_ready);
          expect(evaluation.policyOverride?.source).toBe(
            scenario.expected.policy_override_source,
          );
          return;
        }

        expect(outcome.kind).toBe("rejected");
        if (outcome.kind !== "rejected") return;
        expect(outcome.code).toBe(scenario.expected.code);
      });
    }
  }
});
