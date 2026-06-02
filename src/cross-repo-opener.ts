// Cross-repo PR opener (ADR-010) — the contract_integrity self-heal case that
// can't land as a commit on the gated PR.
//
// The in-repo healer (healers/catalog.ts) fixes a LOCAL dangling ref by
// committing a stub to the SAME PR. But a CROSS-REPO contract ref — a satellite
// declaring `consumesApis: [komatik-v3-prebuild]` for an API that NO repo
// publishes — can only be fixed in the OWNING repo. The gate runs on one repo's
// PR; a commit there can't declare an entity in another repo. This module closes
// that gap: it resolves which repo owns each dangling contract from a configured
// owner map, then opens a PR IN that owning repo declaring the missing API.
//
// Safety mirrors the in-repo autofix: opt-in (`enabled` → dry-run otherwise),
// org-allowlisted (never opens PRs outside the configured owners), deduped by a
// deterministic branch name (same missing API set → same branch → at most one
// open PR), and fail-soft (the caller wraps it so it never blocks the gate). It
// needs a token with write access to the OWNING repos — the Action's default
// GITHUB_TOKEN is scoped to the current repo only, so without a cross-repo token
// the caller passes a client that can't write and this stays in dry-run.

import {
  analyzeCatalogRefs,
  type ContractRefFinding,
} from "./submission-checks/contract-integrity.js";
import type { SubmissionFileInfo } from "./submission-checks/types.js";
import { GithubGitWriter, type GitRestClient } from "./github-git-writer.js";

/** A repo we must open a declaration PR in, with the entities to declare. */
export interface CrossRepoTarget {
  owner: string;
  repo: string;
  /** Entity (API) names this owning repo should declare, deduped + sorted. */
  entities: string[];
}

export interface UnresolvedContractRef {
  name: string;
  field: string;
  file: string;
  reason: string;
}

export type CrossRepoOpenStatus = "opened" | "exists" | "dry-run" | "error" | "skipped";

export interface CrossRepoOpenOutcome {
  owner: string;
  repo: string;
  entities: string[];
  status: CrossRepoOpenStatus;
  branch?: string;
  prNumber?: number;
  prUrl?: string;
  reason?: string;
}

export interface CrossRepoOpenerResult {
  evaluationId: string;
  enabled: boolean;
  outcomes: CrossRepoOpenOutcome[];
  unresolved: UnresolvedContractRef[];
  skippedReason?: string;
}

/** Octokit subset the opener needs: git-data writes + content read + repo/PR ops. */
export interface CrossRepoOpenerClient extends GitRestClient {
  rest: GitRestClient["rest"] & {
    git: GitRestClient["rest"]["git"] & {
      createRef(p: {
        owner: string;
        repo: string;
        ref: string;
        sha: string;
      }): Promise<unknown>;
    };
    repos: {
      get(p: { owner: string; repo: string }): Promise<{
        data: { default_branch: string };
      }>;
      getContent(p: {
        owner: string;
        repo: string;
        path: string;
        ref?: string;
      }): Promise<{ data: unknown }>;
    };
    pulls: {
      list(p: {
        owner: string;
        repo: string;
        state?: "open" | "closed" | "all";
        head?: string;
      }): Promise<{
        data: Array<{ number: number; html_url?: string; head?: { ref?: string } }>;
      }>;
      create(p: {
        owner: string;
        repo: string;
        title: string;
        head: string;
        base: string;
        body: string;
      }): Promise<{ data: { number: number; html_url?: string } }>;
    };
  };
}

export interface RunCrossRepoOpenerOptions {
  client: CrossRepoOpenerClient;
  /** Repo whose PR triggered the gate (source of the dangling consume refs). */
  gatedOwner: string;
  gatedRepo: string;
  /** PR head branch on the gated repo — where we read the consuming catalog. */
  headBranch?: string;
  /** Catalog files changed in the gated PR (the consume declarations live here). */
  catalogPaths: string[];
  evaluationId: string;
  /** Org catalog index — so we surface the SAME dangling refs the gate did. */
  knownEntities?: Set<string>;
  /** entity name → "owner/repo" that should publish it. The resolution registry. */
  apiOwners: Record<string, string>;
  /** Owners we may open PRs in. Defaults to [gatedOwner] (same org only). */
  ownerAllowlist?: string[];
  /** Provenance for the opened PR body. */
  prContext?: { number?: number; url?: string };
  /** When false (default), plan only — open nothing. */
  enabled?: boolean;
}

const COMMIT_PREFIX = "[trailhead-fixer]";
const BRANCH_PREFIX = "trailhead/declare-contracts-";
const STUB_TODO =
  "TODO: auto-declared by Trailhead cross-repo opener (contract_integrity)";

/** Deterministic non-crypto hash (djb2) — stable across runs, no Date/random. */
function stableHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

/** Branch is keyed by owning repo + the missing API set, so identical missing
 * sets converge on one branch (dedup) regardless of which consumer surfaced them. */
function branchFor(target: CrossRepoTarget): string {
  const key = [target.repo, ...[...target.entities].sort()].join("|");
  return `${BRANCH_PREFIX}${stableHash(key)}`;
}

function apiStub(name: string, owner: string): string {
  return [
    "apiVersion: backstage.io/v1alpha1",
    "kind: API",
    "metadata:",
    `  name: ${name}`,
    `  description: "${STUB_TODO}"`,
    "spec:",
    "  type: openapi",
    "  lifecycle: experimental",
    `  owner: ${owner}`,
    `  definition: "TODO: publish the contract definition for ${name}"`,
  ].join("\n");
}

/**
 * Group dangling CROSS-REPO contract refs (consumesApis / dependsOn) by the
 * owning repo from the api_owners map. Refs with no mapped owner, or whose owner
 * is outside the allowlist, are returned as unresolved (suggestion-only).
 */
export function resolveCrossRepoTargets(
  findings: ContractRefFinding[],
  apiOwners: Record<string, string>,
  ownerAllowlist: string[],
): { targets: CrossRepoTarget[]; unresolved: UnresolvedContractRef[] } {
  const unresolved: UnresolvedContractRef[] = [];
  // owner/repo → Set<entity>
  const byRepo = new Map<string, Set<string>>();

  for (const f of findings) {
    if (f.kind !== "contract") continue; // only consumesApis / dependsOn cross a repo
    const mapped = apiOwners[f.name];
    if (!mapped) {
      unresolved.push({
        name: f.name,
        field: f.field,
        file: f.file,
        reason: `No api_owners mapping for "${f.name}" — declare it in the owning repo manually.`,
      });
      continue;
    }
    const slash = mapped.indexOf("/");
    const owner = slash >= 0 ? mapped.slice(0, slash) : "";
    const repo = slash >= 0 ? mapped.slice(slash + 1) : mapped;
    if (!owner || !repo) {
      unresolved.push({
        name: f.name,
        field: f.field,
        file: f.file,
        reason: `Malformed api_owners entry "${mapped}" (expected "owner/repo").`,
      });
      continue;
    }
    if (!ownerAllowlist.includes(owner)) {
      unresolved.push({
        name: f.name,
        field: f.field,
        file: f.file,
        reason: `Owner "${owner}" not in cross-repo opener allowlist — skipped for safety.`,
      });
      continue;
    }
    const key = `${owner}/${repo}`;
    const set = byRepo.get(key) ?? new Set<string>();
    set.add(f.name);
    byRepo.set(key, set);
  }

  const targets: CrossRepoTarget[] = [...byRepo.entries()].map(([key, set]) => {
    const slash = key.indexOf("/");
    return {
      owner: key.slice(0, slash),
      repo: key.slice(slash + 1),
      entities: [...set].sort(),
    };
  });

  return { targets, unresolved };
}

async function readContent(
  client: CrossRepoOpenerClient,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<string | null> {
  try {
    const res = await client.rest.repos.getContent({ owner, repo, path, ref });
    const data = res.data as { content?: string; encoding?: string } | undefined;
    if (data && typeof data.content === "string") {
      const encoding = (data.encoding as BufferEncoding) || "base64";
      return Buffer.from(data.content, encoding).toString("utf8");
    }
    return null;
  } catch {
    return null;
  }
}

async function branchExists(
  client: CrossRepoOpenerClient,
  owner: string,
  repo: string,
  branch: string,
): Promise<boolean> {
  try {
    await client.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
    return true;
  } catch {
    return false;
  }
}

/** Build the owning repo's new catalog-info.yaml content (append, or create). */
function buildCatalogContent(existing: string | null, target: CrossRepoTarget): string {
  const owner = `${target.owner}`;
  const stubs = target.entities.map((name) => apiStub(name, owner)).join("\n---\n");
  if (existing && existing.trim().length > 0) {
    const sep = existing.endsWith("\n") ? "" : "\n";
    return `${existing}${sep}---\n${stubs}\n`;
  }
  return `${stubs}\n`;
}

function prBody(target: CrossRepoTarget, prContext?: { number?: number; url?: string }) {
  const trigger = prContext?.url
    ? `[${prContext.url}](${prContext.url})`
    : prContext?.number
      ? `#${prContext.number}`
      : "a consuming repo's pull request";
  return [
    "## Trailhead cross-repo contract declaration",
    "",
    `${trigger} declares a contract on the following API(s) that **this** repo owns but does not yet publish:`,
    "",
    ...target.entities.map((e) => `- \`${e}\``),
    "",
    "Each was auto-declared as a minimal Backstage `API` stub so the cross-repo " +
      "contract resolves. **Replace the `TODO` fields** with the real owner, " +
      "lifecycle, and contract definition before merging.",
    "",
    `> Opened automatically by the Trailhead cross-repo opener (ADR-010, contract_integrity). Eval-driven; safe to close if the declaration belongs elsewhere.`,
  ].join("\n");
}

async function openDeclarationPR(
  client: CrossRepoOpenerClient,
  target: CrossRepoTarget,
  opts: RunCrossRepoOpenerOptions,
): Promise<CrossRepoOpenOutcome> {
  const { owner, repo, entities } = target;
  const branch = branchFor(target);
  const base = { owner, repo, entities, branch };

  // Resolve the owning repo's default branch (PR base + branch-from point).
  let defaultBranch: string;
  try {
    const meta = await client.rest.repos.get({ owner, repo });
    defaultBranch = meta.data.default_branch;
  } catch (err) {
    return { ...base, status: "error", reason: `repos.get failed: ${String(err)}` };
  }

  // Dedup: an open PR from our deterministic branch already proposes this set.
  try {
    const open = await client.rest.pulls.list({
      owner,
      repo,
      state: "open",
      head: `${owner}:${branch}`,
    });
    const existing = open.data.find((p) => p.head?.ref === branch) ?? open.data[0];
    if (existing) {
      return {
        ...base,
        status: "exists",
        prNumber: existing.number,
        prUrl: existing.html_url,
        reason: "An open declaration PR for this API set already exists.",
      };
    }
  } catch {
    // listing failed — fall through and attempt to create (create will reject dups)
  }

  const existingCatalog = await readContent(
    client,
    owner,
    repo,
    "catalog-info.yaml",
    defaultBranch,
  );
  const newContent = buildCatalogContent(existingCatalog, target);

  if (opts.enabled !== true) {
    return {
      ...base,
      status: "dry-run",
      reason: `Would open a PR on ${owner}/${repo} declaring ${entities.length} API(s). Set the cross-repo opener to enabled to apply.`,
    };
  }

  // Create the branch off default HEAD (unless a prior run already made it).
  try {
    if (!(await branchExists(client, owner, repo, branch))) {
      const head = await client.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${defaultBranch}`,
      });
      await client.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branch}`,
        sha: head.data.object.sha,
      });
    }
  } catch (err) {
    return { ...base, status: "error", reason: `branch create failed: ${String(err)}` };
  }

  // One commit declaring the API(s) on the new branch.
  try {
    const writer = new GithubGitWriter(client, owner, repo);
    await writer.commitFiles({
      branch,
      message: `${COMMIT_PREFIX} cross-repo: declare API contract(s) ${entities.join(", ")} (eval ${opts.evaluationId})`,
      edits: [{ path: "catalog-info.yaml", content: newContent }],
    });
  } catch (err) {
    return { ...base, status: "error", reason: `commit failed: ${String(err)}` };
  }

  // Open the PR.
  try {
    const pr = await client.rest.pulls.create({
      owner,
      repo,
      title: `chore(catalog): declare contract API(s) ${entities.join(", ")} (Trailhead)`,
      head: branch,
      base: defaultBranch,
      body: prBody(target, opts.prContext),
    });
    return {
      ...base,
      status: "opened",
      prNumber: pr.data.number,
      prUrl: pr.data.html_url,
    };
  } catch (err) {
    return { ...base, status: "error", reason: `pulls.create failed: ${String(err)}` };
  }
}

/**
 * Resolve dangling cross-repo contract refs from the gated PR's catalog files
 * and open a declaration PR in each owning repo. Dry-run unless `enabled`.
 * Never throws — returns a structured result (or a skip reason).
 */
export async function runCrossRepoOpener(
  opts: RunCrossRepoOpenerOptions,
): Promise<CrossRepoOpenerResult> {
  const base = { evaluationId: opts.evaluationId, enabled: opts.enabled === true };

  if (Object.keys(opts.apiOwners).length === 0) {
    return {
      ...base,
      outcomes: [],
      unresolved: [],
      skippedReason: "No api_owners configured — nothing to resolve.",
    };
  }
  if (!opts.headBranch) {
    return {
      ...base,
      outcomes: [],
      unresolved: [],
      skippedReason: "No PR head branch — cannot read consuming catalog.",
    };
  }
  const paths = [...new Set(opts.catalogPaths)].filter(Boolean);
  if (paths.length === 0) {
    return {
      ...base,
      outcomes: [],
      unresolved: [],
      skippedReason: "No catalog files in the PR to analyze.",
    };
  }

  // Read the consuming catalog files from the gated PR's head branch.
  const files: SubmissionFileInfo[] = [];
  for (const path of paths) {
    const content = await readContent(
      opts.client,
      opts.gatedOwner,
      opts.gatedRepo,
      path,
      opts.headBranch,
    );
    if (content !== null) files.push({ filename: path, content });
  }

  const analysis = analyzeCatalogRefs(files, opts.knownEntities);
  if (!analysis) {
    return {
      ...base,
      outcomes: [],
      unresolved: [],
      skippedReason: "No analyzable catalog content fetched from the PR head.",
    };
  }

  const allowlist = opts.ownerAllowlist ?? [opts.gatedOwner];
  const { targets, unresolved } = resolveCrossRepoTargets(
    analysis.findings,
    opts.apiOwners,
    allowlist,
  );

  if (targets.length === 0) {
    return {
      ...base,
      outcomes: [],
      unresolved,
      skippedReason:
        unresolved.length > 0
          ? "Dangling contract refs found but none resolved to an allowlisted owner."
          : "No cross-repo contract refs to open PRs for.",
    };
  }

  const outcomes: CrossRepoOpenOutcome[] = [];
  for (const target of targets) {
    try {
      outcomes.push(await openDeclarationPR(opts.client, target, opts));
    } catch (err) {
      outcomes.push({
        owner: target.owner,
        repo: target.repo,
        entities: target.entities,
        status: "error",
        reason: String(err),
      });
    }
  }

  return { ...base, outcomes, unresolved };
}
