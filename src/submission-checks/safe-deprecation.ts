// Safe Deprecation detector (ADR-010) — catalog coherence on retirement.
//
// When an entity is retired (a Backstage `catalog-info.yaml` doc with
// `spec.lifecycle: deprecated`), nothing still ALIVE should keep depending on it.
// A live component that still `consumesApis` / `dependsOn` / is `subcomponentOf`
// / has `system` pointing at a deprecated entity is a zombie reference — the
// retirement looks done but a live surface still wires to the corpse. This is the
// catalog-level shape of the "incomplete deprecation" incident class.
//
// v1 is catalog-native (fully in-diff, high-confidence). Route/data-surface
// coverage (redirect maps, route globs) needs full repo file contents and is a
// tracked follow-up under ADR-010.

import yaml from "js-yaml";
import type { SubmissionCheckResult } from "../types.js";
import type { SubmissionCheckContext, SubmissionFileInfo } from "./types.js";
import { fileContent, normalizePath } from "./helpers.js";

const CATALOG_FILE = /(?:^|\/)catalog-info\.ya?ml$/i;

function isCatalogFile(file: SubmissionFileInfo): boolean {
  return CATALOG_FILE.test(normalizePath(file.filename));
}

function refName(ref: string): string {
  let s = String(ref).trim();
  const colon = s.indexOf(":");
  if (colon >= 0) s = s.slice(colon + 1);
  const slash = s.lastIndexOf("/");
  if (slash >= 0) s = s.slice(slash + 1);
  return s;
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") return [value];
  return [];
}

function parseDocs(content: string): Array<Record<string, unknown>> {
  const docs: Array<Record<string, unknown>> = [];
  try {
    yaml.loadAll(content, (doc) => {
      if (doc && typeof doc === "object") docs.push(doc as Record<string, unknown>);
    });
  } catch {
    // malformed — leave to syntax_validity
  }
  return docs;
}

function entityName(doc: Record<string, unknown>): string | null {
  const meta = doc.metadata as Record<string, unknown> | undefined;
  return typeof meta?.name === "string" ? meta.name : null;
}

function isRetired(doc: Record<string, unknown>): boolean {
  const spec = (doc.spec ?? {}) as Record<string, unknown>;
  return spec.lifecycle === "deprecated";
}

interface ZombieRef {
  file: string;
  from: string;
  field: string;
  to: string;
}

export function detectSafeDeprecation(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const catalogFiles = ctx.files.filter(isCatalogFile);
  if (catalogFiles.length === 0) return null;

  const parsed = catalogFiles.map((file) => ({
    file,
    docs: parseDocs(fileContent(file)),
  }));

  // 1. Which entities are being retired?
  const retired = new Set<string>();
  for (const { docs } of parsed) {
    for (const doc of docs) {
      const name = entityName(doc);
      if (name && isRetired(doc)) retired.add(name);
    }
  }
  if (retired.size === 0) return null;

  // 2. A LIVE entity that still references a retired one is a zombie wire.
  const zombies: ZombieRef[] = [];
  for (const { file, docs } of parsed) {
    for (const doc of docs) {
      if (isRetired(doc)) continue; // a dying thing may reference another; ignore
      const from = entityName(doc) ?? "(unnamed)";
      const spec = (doc.spec ?? {}) as Record<string, unknown>;
      const check = (field: string, ref: string) => {
        const to = refName(ref);
        if (retired.has(to)) {
          zombies.push({ file: normalizePath(file.filename), from, field, to });
        }
      };
      if (typeof spec.system === "string") check("system", spec.system);
      if (typeof spec.subcomponentOf === "string")
        check("subcomponentOf", spec.subcomponentOf);
      for (const ref of asArray(spec.consumesApis)) check("consumesApis", ref);
      for (const ref of asArray(spec.dependsOn)) check("dependsOn", ref);
    }
  }

  if (zombies.length === 0) return null;

  const lines = zombies.map(
    (z) => `${z.file}: "${z.from}" still ${z.field} → "${z.to}" (deprecated)`,
  );
  return {
    code: "safe_deprecation",
    severity: "warn",
    title: "Live entity depends on a retired one",
    detail: `Deprecation left a live wire to a retired entity: ${lines.join("; ")}.`,
    files: [...new Set(zombies.map((z) => z.file))],
    suggested_action:
      "Repoint the live reference to the surviving/canonical entity, or deprecate the dependent too. " +
      "Also confirm non-catalog surfaces (routes, redirects, listings) for the retired entity are covered.",
    autofix_eligible: false,
  };
}
