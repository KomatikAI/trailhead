import * as core from "@actions/core";
import * as github from "@actions/github";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CURRENT_CONFIG_SCHEMA_VERSION,
  parseRepoConfigContent,
  parseYaml,
  SUPPORTED_CONFIG_SCHEMA_VERSIONS,
} from "./config-core.js";
import type { RepoConfig as RepoConfigType } from "./types.js";

const CONFIG_MIGRATION_GUIDE_URL =
  "https://github.com/KomatikAI/trailhead/blob/main/docs/migration-v3-to-v4.md";
const KNOWN_TOP_LEVEL_KEYS = new Set([
  "schema_version",
  "gate",
  "contexts",
  "sensitivity",
  "weights",
  "profiles",
  "thresholds",
  "ignore",
  "consumer_registry",
  "freeze",
  "environments",
  "services",
  "security",
  "canary",
  "escalation",
  "policies",
]);

function warnUnknownTopLevelKeys(raw: unknown, configPath: string): void {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;

  for (const key of Object.keys(raw as Record<string, unknown>)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      core.warning(
        `${configPath}: unknown top-level key "${key}" will be ignored. ` +
          `See migration guide: ${CONFIG_MIGRATION_GUIDE_URL}`,
      );
    }
  }
}

function validateSchemaVersion(
  parsedConfig: RepoConfigType,
  configPath: string,
): RepoConfigType | null {
  if (!SUPPORTED_CONFIG_SCHEMA_VERSIONS.has(parsedConfig.schema_version)) {
    core.warning(
      `${configPath}: unsupported schema_version=${parsedConfig.schema_version}. ` +
        `Supported: ${[...SUPPORTED_CONFIG_SCHEMA_VERSIONS].join(", ")}. ` +
        `Migration guide: ${CONFIG_MIGRATION_GUIDE_URL}`,
    );
    return null;
  }

  if (parsedConfig.schema_version > CURRENT_CONFIG_SCHEMA_VERSION) {
    core.warning(
      `${configPath}: schema_version=${parsedConfig.schema_version} is newer than ` +
        `supported ${CURRENT_CONFIG_SCHEMA_VERSION}. Some features may be ignored.`,
    );
  }

  return parsedConfig;
}

export async function loadRepoConfig(token?: string): Promise<RepoConfigType | null> {
  const localConfig = await loadLocalRepoConfig();
  if (localConfig) return localConfig;

  if (!token) return null;

  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    const configPath = await findConfigPath(octokit, owner, repo);
    if (!configPath) return null;

    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: configPath,
    });

    if (Array.isArray(data) || data.type !== "file" || !data.content) {
      return null;
    }

    const content = Buffer.from(data.content, "base64").toString("utf-8");
    const raw = parseYaml(content);
    warnUnknownTopLevelKeys(raw, configPath);
    const parsedConfig = parseRepoConfigContent(content);
    if (!parsedConfig) {
      core.warning(`${configPath} parse error — using defaults`);
      return null;
    }

    const validated = validateSchemaVersion(parsedConfig, configPath);
    if (!validated) return null;

    core.debug(`Loaded ${configPath}: ${JSON.stringify(validated)}`);
    return validated;
  } catch (error) {
    const msg = String(error);
    if (!msg.includes("404") && !msg.includes("Not Found")) {
      core.debug(`Trailhead config load failed: ${msg}`);
    }
    return null;
  }
}

async function loadLocalRepoConfig(): Promise<RepoConfigType | null> {
  const workspace = process.env.GITHUB_WORKSPACE;
  if (!workspace) return null;

  for (const configPath of [".trailhead.yml", ".deployguard.yml"]) {
    try {
      const content = await readFile(path.join(workspace, configPath), "utf-8");
      const raw = parseYaml(content);
      warnUnknownTopLevelKeys(raw, configPath);
      const parsedConfig = parseRepoConfigContent(content);

      if (!parsedConfig) {
        core.warning(`${configPath} parse error — using defaults`);
        return null;
      }

      const validated = validateSchemaVersion(parsedConfig, configPath);
      if (!validated) return null;

      core.debug(`Loaded local ${configPath}: ${JSON.stringify(validated)}`);
      return validated;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        core.debug(`Local Trailhead config load failed: ${error}`);
        return null;
      }
    }
  }

  return null;
}

async function findConfigPath(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
): Promise<string | null> {
  for (const path of [".trailhead.yml", ".deployguard.yml"]) {
    try {
      await octokit.rest.repos.getContent({ owner, repo, path });
      return path;
    } catch (error) {
      const msg = String(error);
      if (!msg.includes("404") && !msg.includes("Not Found")) {
        throw error;
      }
    }
  }
  return null;
}

export { matchesGlobs } from "./risk-engine.js";
