// Catalog self-heal lane (ADR-010) for the contract_integrity detector.
//
// When a catalog-info.yaml reference doesn't resolve, the in-repo-fixable case is
// a LOCAL structural ref — `spec.system` / `spec.subcomponentOf` pointing at an
// entity that simply isn't declared in the same repo's catalog. The fix is to add
// a minimal stub for that entity, which this healer generates as YAML to append.
//
// Cross-repo refs (consumesApis / dependsOn / providesApis to something another
// repo owns) can't be fixed in this PR — the fix belongs in the owning repo. For
// those we emit a human-actionable suggestion rather than an edit. (Opening the
// cross-repo PR is a follow-up that needs a cross-repo PR opener the fixer lacks.)

import yaml from "js-yaml";
import {
  analyzeCatalogRefs,
  type ContractRefFinding,
} from "../submission-checks/contract-integrity.js";
import type { SubmissionCheckContext } from "../submission-checks/types.js";
import { fileContent, normalizePath } from "../submission-checks/helpers.js";

export interface CatalogHealEdit {
  /** catalog-info.yaml to append to. */
  file: string;
  /** YAML to append (one or more `---`-separated stub entities). */
  append: string;
  /** Entity names declared by this edit. */
  entities: string[];
}

export interface CatalogHealPlan {
  /** In-repo edits that auto-declare missing local entities. */
  edits: CatalogHealEdit[];
  /** Cross-repo / owned refs that need a declaration in another repo. */
  suggestions: string[];
}

/** Best-effort owner for stubs: reuse a sibling entity's owner, else "unknown". */
function ownerHint(content: string): string {
  try {
    let owner: string | undefined;
    yaml.loadAll(content, (doc) => {
      if (owner) return;
      const spec = (doc as Record<string, unknown>)?.spec as
        | Record<string, unknown>
        | undefined;
      if (typeof spec?.owner === "string") owner = spec.owner;
    });
    return owner ?? "unknown";
  } catch {
    return "unknown";
  }
}

function systemStub(name: string, owner: string): string {
  return [
    "apiVersion: backstage.io/v1alpha1",
    "kind: System",
    "metadata:",
    `  name: ${name}`,
    `  description: "TODO: auto-declared by Trailhead self-heal (contract_integrity)"`,
    "spec:",
    `  owner: ${owner}`,
  ].join("\n");
}

function componentStub(name: string, owner: string): string {
  return [
    "apiVersion: backstage.io/v1alpha1",
    "kind: Component",
    "metadata:",
    `  name: ${name}`,
    `  description: "TODO: auto-declared by Trailhead self-heal (contract_integrity)"`,
    "spec:",
    "  type: service",
    "  lifecycle: experimental",
    `  owner: ${owner}`,
  ].join("\n");
}

/**
 * Plan the catalog self-heal for a PR: auto-declare missing LOCAL entities,
 * and surface cross-repo refs as suggestions.
 */
export function planCatalogHeal(ctx: SubmissionCheckContext): CatalogHealPlan {
  const analysis = analyzeCatalogRefs(ctx);
  if (!analysis) return { edits: [], suggestions: [] };

  const local = analysis.findings.filter((f) => f.kind === "local");
  const crossRepo = analysis.findings.filter((f) => f.kind !== "local");

  // Group local findings by file, dedupe by entity name (a System ref wins over
  // a Component ref for the same name — a System is the broader container).
  const byFile = new Map<string, Map<string, ContractRefFinding>>();
  for (const f of local) {
    const fileMap = byFile.get(f.file) ?? new Map<string, ContractRefFinding>();
    const existing = fileMap.get(f.name);
    if (!existing || (existing.field !== "system" && f.field === "system")) {
      fileMap.set(f.name, f);
    }
    byFile.set(f.file, fileMap);
  }

  const edits: CatalogHealEdit[] = [];
  for (const [file, entityMap] of byFile) {
    const original = ctx.files.find((cf) => normalizePath(cf.filename) === file);
    const owner = original ? ownerHint(fileContent(original)) : "unknown";
    const stubs: string[] = [];
    const entities: string[] = [];
    for (const finding of entityMap.values()) {
      const stub =
        finding.field === "system"
          ? systemStub(finding.name, owner)
          : componentStub(finding.name, owner);
      stubs.push(stub);
      entities.push(finding.name);
    }
    if (stubs.length === 0) continue;
    const append = "\n---\n" + stubs.join("\n---\n") + "\n";
    edits.push({ file, append, entities });
  }

  const suggestions = crossRepo.map(
    (f) =>
      `Declare ${f.kind === "owned" ? "API" : "the referenced entity"} "${f.name}" in its owning repo's catalog-info.yaml (referenced via spec.${f.field} in ${f.file}).`,
  );

  return { edits, suggestions };
}
