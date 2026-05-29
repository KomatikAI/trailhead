// Registry of detectors that require fleet self-test fixture coverage (A8).

import { SUBMISSION_CHECK_CODES } from "./submission-remediation.js";

/** Risk factor types with remediation factorCues — keep in sync with remediation.ts */
export const REMEDIATION_RISK_FACTOR_TYPES = [
  "test_coverage",
  "sensitive_files",
  "ci_integrity",
  "workflow_security",
  "prompt_injection_risk",
  "pr_scope",
  "duplicate_logic",
  "security_alerts",
  "supply_chain",
] as const;

export type RemediationRiskFactorType = (typeof REMEDIATION_RISK_FACTOR_TYPES)[number];

export interface AgentFixtureManifest {
  version: number;
  fixtures: string[];
  coveredSubmissionCodes: string[];
  coveredRiskFactors: string[];
  coveredScenarios: string[];
}

export function assertFixtureRegistryComplete(manifest: AgentFixtureManifest): string[] {
  const errors: string[] = [];

  for (const code of SUBMISSION_CHECK_CODES) {
    if (!manifest.coveredSubmissionCodes.includes(code)) {
      errors.push(`Missing manifest coverage for submission check: ${code}`);
    }
  }

  for (const factor of REMEDIATION_RISK_FACTOR_TYPES) {
    if (!manifest.coveredRiskFactors.includes(factor)) {
      errors.push(`Missing manifest coverage for remediation risk factor: ${factor}`);
    }
  }

  for (const scenario of manifest.coveredScenarios) {
    if (!manifest.fixtures.includes(scenario)) {
      errors.push(
        `Manifest lists covered scenario "${scenario}" with no fixture directory`,
      );
    }
  }

  return errors;
}
