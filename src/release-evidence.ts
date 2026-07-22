import { z } from "zod";
import type { HealthCheckResult, ReleaseEvidenceConfig } from "./types.js";

const RELEASE_EVIDENCE_TIMEOUT_MS = 10_000;
const MAX_RELEASE_EVIDENCE_BYTES = 1_000_000;

const ReleaseEvidenceCheck = z.object({
  id: z.string().min(1),
  status: z.enum(["pass", "fail", "pending"]),
  summary: z.string().min(1).max(1_000),
  evidence_url: z.string().url().optional(),
});

const ReleaseEvidenceDocument = z.object({
  schema_version: z.literal(1),
  subject: z.string().min(1),
  generated_at: z.string().datetime({ offset: true }),
  evidence_url: z.string().url().optional(),
  checks: z.array(ReleaseEvidenceCheck),
});

export type ReleaseEvidenceDocument = z.infer<typeof ReleaseEvidenceDocument>;

export interface ReleaseEvidenceEvaluation {
  active: boolean;
  shouldBlock: boolean;
  findings: string[];
  healthChecks: HealthCheckResult[];
}

interface EvaluateReleaseEvidenceOptions {
  now?: number;
  fetchImpl?: typeof fetch;
}

function markdownEvidenceLink(url: string | undefined): string {
  return url ? ` ([evidence](${url}))` : "";
}

function failureEvaluation(
  config: ReleaseEvidenceConfig,
  summary: string,
  latencyMs: number,
): ReleaseEvidenceEvaluation {
  return {
    active: true,
    shouldBlock: config.mode === "block",
    findings: [`Release evidence requires action: ${summary}`],
    healthChecks: [
      {
        target: "release-evidence:document",
        status: config.mode === "block" ? "block" : "warn",
        latencyMs,
        detail: { summary, sourceUrl: config.url },
      },
    ],
  };
}

function uniqueRequiredChecks(config: ReleaseEvidenceConfig): string[] {
  return [...new Set(config.required_checks)];
}

/**
 * Evaluate a service-owned release evidence document for the current
 * environment. Every required condition produces its own health check and,
 * when not passing, its own actionable policy finding.
 */
export async function evaluateReleaseEvidence(
  config: ReleaseEvidenceConfig | undefined,
  environment: string | undefined,
  options: EvaluateReleaseEvidenceOptions = {},
): Promise<ReleaseEvidenceEvaluation> {
  if (
    !config ||
    config.enabled === false ||
    !environment ||
    !config.environments.includes(environment)
  ) {
    return { active: false, shouldBlock: false, findings: [], healthChecks: [] };
  }

  const startedAt = Date.now();
  let sourceUrl: URL;
  try {
    sourceUrl = new URL(config.url);
  } catch {
    return failureEvaluation(config, `configured URL is invalid: ${config.url}`, 0);
  }
  if (sourceUrl.protocol !== "https:") {
    return failureEvaluation(config, "configured URL must use HTTPS", 0);
  }

  try {
    const response = await (options.fetchImpl ?? fetch)(sourceUrl, {
      method: "GET",
      headers: {
        Accept: "application/vnd.trailhead.release-evidence+json, application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(RELEASE_EVIDENCE_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      return failureEvaluation(
        config,
        `endpoint returned HTTP ${response.status} (${config.url})`,
        latencyMs,
      );
    }

    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_RELEASE_EVIDENCE_BYTES) {
      return failureEvaluation(
        config,
        "document exceeds the 1 MB safety limit",
        latencyMs,
      );
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(text);
    } catch {
      return failureEvaluation(config, "endpoint did not return valid JSON", latencyMs);
    }

    const parsed = ReleaseEvidenceDocument.safeParse(decoded);
    if (!parsed.success) {
      return failureEvaluation(
        config,
        `document does not match schema_version 1: ${parsed.error.issues[0]?.message ?? "invalid document"}`,
        latencyMs,
      );
    }

    const document = parsed.data;
    if (config.expected_subject && document.subject !== config.expected_subject) {
      return failureEvaluation(
        config,
        `subject mismatch: expected "${config.expected_subject}", received "${document.subject}"`,
        latencyMs,
      );
    }

    const now = options.now ?? Date.now();
    const generatedAt = Date.parse(document.generated_at);
    const maxAgeMs = config.max_age_minutes * 60_000;
    if (generatedAt > now + 60_000 || now - generatedAt > maxAgeMs) {
      return failureEvaluation(
        config,
        `document is stale; generated_at=${document.generated_at}, max_age=${config.max_age_minutes}m${markdownEvidenceLink(document.evidence_url)}`,
        latencyMs,
      );
    }

    const duplicateIds = new Set<string>();
    const checksById = new Map<string, z.infer<typeof ReleaseEvidenceCheck>>();
    for (const check of document.checks) {
      if (checksById.has(check.id)) duplicateIds.add(check.id);
      checksById.set(check.id, check);
    }
    if (duplicateIds.size > 0) {
      return failureEvaluation(
        config,
        `document contains duplicate check IDs: ${[...duplicateIds].join(", ")}`,
        latencyMs,
      );
    }

    const findings: string[] = [];
    const healthChecks: HealthCheckResult[] = [];
    let hasFailure = false;

    for (const id of uniqueRequiredChecks(config)) {
      const check = checksById.get(id);
      if (!check) {
        hasFailure = true;
        findings.push(
          `Release evidence "${id}" requires action: required check is missing.`,
        );
        healthChecks.push({
          target: `release-evidence:${id}`,
          status: config.mode === "block" ? "block" : "warn",
          latencyMs,
          detail: {
            summary: "required check is missing",
            sourceUrl: config.url,
            generatedAt: document.generated_at,
          },
        });
        continue;
      }

      const passed = check.status === "pass";
      if (!passed) {
        hasFailure = true;
        findings.push(
          `Release evidence "${id}" requires action: ${check.summary}${markdownEvidenceLink(check.evidence_url ?? document.evidence_url)}.`,
        );
      }
      healthChecks.push({
        target: `release-evidence:${id}`,
        status: passed ? "allow" : config.mode === "block" ? "block" : "warn",
        latencyMs,
        detail: {
          summary: check.summary,
          evidenceUrl: check.evidence_url ?? document.evidence_url,
          sourceUrl: config.url,
          generatedAt: document.generated_at,
          evidenceStatus: check.status,
        },
      });
    }

    return {
      active: true,
      shouldBlock: hasFailure && config.mode === "block",
      findings,
      healthChecks,
    };
  } catch (error) {
    return failureEvaluation(
      config,
      `endpoint could not be evaluated: ${error instanceof Error ? error.message : String(error)}`,
      Date.now() - startedAt,
    );
  }
}
