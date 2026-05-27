import fs from "node:fs";
import path from "node:path";
import { matchesGlobs } from "./risk-engine.js";
import type {
  ConsumerRegistry,
  RepoConfig,
  RiskFactor,
  ServiceConsumer,
} from "./types.js";
import { ConsumerRegistry as ConsumerRegistrySchema } from "./types.js";

export type { ServiceConsumer, ServiceConsumerRef, ConsumerRegistry } from "./types.js";

export interface FileChange {
  filename: string;
}

export interface ResolvedConsumer {
  id: string;
  repo?: string;
  branch?: string;
  notify_webhook?: string;
}

export interface CrossRepoServiceImpact {
  serviceName: string;
  touchedFiles: string[];
  consumers: ResolvedConsumer[];
  notify_webhook?: string;
}

export interface CrossRepoImpactResult {
  factor: RiskFactor | null;
  findings: string[];
  affectedConsumers: string[];
  services: CrossRepoServiceImpact[];
}

export function parseConsumerRegistry(raw: unknown): ConsumerRegistry {
  return ConsumerRegistrySchema.parse(raw);
}

export function loadConsumerRegistryFile(filePath: string): ConsumerRegistry | null {
  try {
    const resolved = path.resolve(filePath);
    const contents = fs.readFileSync(resolved, "utf8");
    return parseConsumerRegistry(JSON.parse(contents));
  } catch {
    return null;
  }
}

export function mergeConsumerRegistries(
  ...registries: Array<ConsumerRegistry | null | undefined>
): ConsumerRegistry {
  const merged: ConsumerRegistry = {};
  for (const registry of registries) {
    if (!registry) continue;
    Object.assign(merged, registry);
  }
  return merged;
}

export function formatConsumerLabel(consumer: ResolvedConsumer): string {
  if (consumer.repo) {
    const branch = consumer.branch ? `@${consumer.branch}` : "";
    return `\`${consumer.repo}${branch}\``;
  }
  return `\`${consumer.id}\``;
}

function resolveConsumer(
  consumer: ServiceConsumer,
  registry: ConsumerRegistry,
): ResolvedConsumer {
  if (typeof consumer === "string") {
    const entry = registry[consumer];
    if (entry) {
      return {
        id: entry.name ?? consumer,
        repo: entry.repo,
        branch: entry.branch,
        notify_webhook: entry.notify_webhook,
      };
    }
    return { id: consumer };
  }

  return {
    id: consumer.name ?? consumer.repo,
    repo: consumer.repo,
    branch: consumer.branch,
    notify_webhook: consumer.notify_webhook,
  };
}

export function detectCrossRepoImpact(
  files: FileChange[],
  repoConfig: RepoConfig | null,
  externalRegistry?: ConsumerRegistry | null,
): CrossRepoImpactResult {
  const cfg = repoConfig?.policies?.cross_repo_impact;
  const empty: CrossRepoImpactResult = {
    factor: null,
    findings: [],
    affectedConsumers: [],
    services: [],
  };
  if (!cfg?.enabled) return empty;

  const registry = mergeConsumerRegistries(
    externalRegistry,
    repoConfig?.consumer_registry,
  );
  const affectedConsumers = new Set<string>();
  const findings: string[] = [];
  const services: CrossRepoServiceImpact[] = [];

  for (const [serviceName, service] of Object.entries(repoConfig?.services ?? {})) {
    const contractPatterns = service.contracts ?? [];
    if (contractPatterns.length === 0) continue;

    const touchedFiles = files
      .filter((f) => matchesGlobs(f.filename, contractPatterns))
      .map((f) => f.filename);
    if (touchedFiles.length === 0) continue;

    const resolvedConsumers = (service.consumers ?? []).map((consumer) =>
      resolveConsumer(consumer, registry),
    );
    for (const consumer of resolvedConsumers) {
      affectedConsumers.add(
        consumer.repo
          ? `${consumer.repo}${consumer.branch ? `@${consumer.branch}` : ""}`
          : consumer.id,
      );
    }

    services.push({
      serviceName,
      touchedFiles,
      consumers: resolvedConsumers,
      notify_webhook: service.notify_webhook,
    });

    findings.push(
      `Contract surface changed for service "${serviceName}" (${touchedFiles.length} file(s)).`,
    );
  }

  if (findings.length === 0) return empty;

  const consumerLabels = [...affectedConsumers];
  return {
    factor: {
      type: "cross_repo_impact",
      score: Math.min(100, 30 + consumerLabels.length * 15),
      detail: {
        findings,
        affectedConsumers: consumerLabels,
        services: services.map((service) => ({
          service: service.serviceName,
          touchedFiles: service.touchedFiles,
          consumers: service.consumers.map((consumer) => ({
            id: consumer.id,
            repo: consumer.repo,
            branch: consumer.branch,
          })),
        })),
        description: "Potential downstream consumer impact from contract changes",
      },
    },
    findings,
    affectedConsumers: consumerLabels,
    services,
  };
}

export interface CrossRepoWebhookContext {
  repoId: string;
  commitSha: string;
  prNumber?: number;
}

export interface CrossRepoWebhookDelivery {
  url: string;
  serviceName: string;
  consumer?: ResolvedConsumer;
}

export function collectCrossRepoWebhookDeliveries(
  impact: CrossRepoImpactResult,
): CrossRepoWebhookDelivery[] {
  const deliveries: CrossRepoWebhookDelivery[] = [];
  const seen = new Set<string>();

  for (const service of impact.services) {
    if (service.notify_webhook && !seen.has(service.notify_webhook)) {
      seen.add(service.notify_webhook);
      deliveries.push({ url: service.notify_webhook, serviceName: service.serviceName });
    }
    for (const consumer of service.consumers) {
      if (!consumer.notify_webhook || seen.has(consumer.notify_webhook)) continue;
      seen.add(consumer.notify_webhook);
      deliveries.push({
        url: consumer.notify_webhook,
        serviceName: service.serviceName,
        consumer,
      });
    }
  }

  return deliveries;
}

export async function sendCrossRepoImpactWebhooks(
  impact: CrossRepoImpactResult,
  context: CrossRepoWebhookContext,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const deliveries = collectCrossRepoWebhookDeliveries(impact);
  if (deliveries.length === 0) return;

  await Promise.all(
    deliveries.map(async (delivery) => {
      const service = impact.services.find(
        (item) => item.serviceName === delivery.serviceName,
      );
      if (!service) return;

      const payload = {
        event: "contract_change",
        source_repo: context.repoId,
        commit_sha: context.commitSha,
        pr_number: context.prNumber,
        service: delivery.serviceName,
        touched_files: service.touchedFiles,
        consumers: service.consumers.map((consumer) => ({
          id: consumer.id,
          repo: consumer.repo,
          branch: consumer.branch,
        })),
        target_consumer: delivery.consumer
          ? {
              id: delivery.consumer.id,
              repo: delivery.consumer.repo,
              branch: delivery.consumer.branch,
            }
          : undefined,
        timestamp: new Date().toISOString(),
      };

      try {
        await fetchImpl(delivery.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        // fail-open: satellite notification must not block merge gate
      }
    }),
  );
}

export function formatCrossRepoImpactSection(
  impact: CrossRepoImpactResult | undefined,
): string[] {
  if (!impact || impact.services.length === 0) return [];

  const lines = [`### Cross-Repo Impact`, ``];
  for (const service of impact.services) {
    lines.push(
      `**${service.serviceName}** — ${service.touchedFiles.length} contract file(s) changed`,
    );
    if (service.consumers.length > 0) {
      lines.push(
        `- Downstream: ${service.consumers.map((consumer) => formatConsumerLabel(consumer)).join(", ")}`,
      );
    }
    if (service.notify_webhook) {
      lines.push(`- Satellite webhook configured for this service`);
    }
    lines.push(``);
  }
  return lines;
}
