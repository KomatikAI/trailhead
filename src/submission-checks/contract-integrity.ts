// Contract Integrity detector (ADR-010) — validates that Backstage
// catalog-info.yaml references resolve to declared entities.
//
// Catches the "dangling contract reference" failure class: a repo declares it
// CONSUMES an API (spec.consumesApis) that no repo PUBLISHES, or points at a
// System / parent Component that doesn't exist. Each such PR is internally valid
// and green; the break only exists across the system's contracts — which is
// exactly what ordinary CI can't see.
//
// Resolution universe = entities declared across the catalog files in this PR,
// unioned with an optional org catalog index (ctx.catalogKnownEntities). Local
// structural refs (system / subcomponentOf) and owned refs (providesApis) must
// resolve and warn when they don't; cross-repo contract refs (consumesApis /
// dependsOn) warn only when an index is configured, otherwise advise.

import yaml from "js-yaml";
import type { SubmissionCheckResult } from "../types.js";
import type { SubmissionCheckContext, SubmissionFileInfo } from "./types.js";
import { fileContent, normalizePath } from "./helpers.js";

const CATALOG_FILE = /(?:^|\/)catalog-info\.ya?ml$/i;

type RefKind = "local" | "owned" | "contract";

interface Finding {
  file: string;
  field: string;
  ref: string;
  name: string;
  kind: RefKind;
}

function isCatalogFile(file: SubmissionFileInfo): boolean {
  return CATALOG_FILE.test(normalizePath(file.filename));
}

/** Backstage entity ref → bare name. "component:default/foo" → "foo". */
function refName(ref: string): string {
  let s = String(ref).trim();
  const colon = s.indexOf(":");
  if (colon >= 0) s = s.slice(colon + 1); // strip "kind:"
  const slash = s.lastIndexOf("/");
  if (slash >= 0) s = s.slice(slash + 1); // strip "namespace/"
  return s;
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") return [value];
  return [];
}

/** Parse every YAML doc in a catalog file; tolerate malformed docs (that's syntax_validity's job). */
function parseDocs(content: string): Array<Record<string, unknown>> {
  const docs: Array<Record<string, unknown>> = [];
  try {
    yaml.loadAll(content, (doc) => {
      if (doc && typeof doc === "object") docs.push(doc as Record<string, unknown>);
    });
  } catch {
    // unparseable catalog — leave to syntax_validity; we simply can't analyze it
  }
  return docs;
}

function entityName(doc: Record<string, unknown>): string | null {
  const meta = doc.metadata as Record<string, unknown> | undefined;
  const name = meta?.name;
  return typeof name === "string" ? name : null;
}

export function detectContractIntegrity(
  ctx: SubmissionCheckContext,
): SubmissionCheckResult | null {
  const catalogFiles = ctx.files.filter(isCatalogFile);
  if (catalogFiles.length === 0) return null;

  // Parse once; remember which file each doc came from.
  const parsed = catalogFiles.map((file) => ({
    file,
    docs: parseDocs(fileContent(file)),
  }));

  // 1. Build the resolution universe: in-PR declarations ∪ configured org index.
  const declared = new Set<string>();
  for (const { docs } of parsed) {
    for (const doc of docs) {
      const name = entityName(doc);
      if (name) declared.add(name);
    }
  }
  const known = new Set<string>(declared);
  for (const name of ctx.catalogKnownEntities ?? []) known.add(name);
  const hasOrgIndex = (ctx.catalogKnownEntities?.size ?? 0) > 0;

  // 2. Walk references and collect anything that doesn't resolve.
  const findings: Finding[] = [];
  const checkRef = (
    file: SubmissionFileInfo,
    field: string,
    ref: string,
    kind: RefKind,
  ) => {
    const name = refName(ref);
    if (!name || known.has(name)) return;
    findings.push({ file: normalizePath(file.filename), field, ref, name, kind });
  };

  for (const { file, docs } of parsed) {
    for (const doc of docs) {
      const spec = (doc.spec ?? {}) as Record<string, unknown>;
      if (typeof spec.system === "string") checkRef(file, "system", spec.system, "local");
      if (typeof spec.subcomponentOf === "string")
        checkRef(file, "subcomponentOf", spec.subcomponentOf, "local");
      for (const ref of asArray(spec.providesApis))
        checkRef(file, "providesApis", ref, "owned");
      for (const ref of asArray(spec.consumesApis))
        checkRef(file, "consumesApis", ref, "contract");
      for (const ref of asArray(spec.dependsOn))
        checkRef(file, "dependsOn", ref, "contract");
    }
  }

  if (findings.length === 0) return null;

  // 3. Severity: local/owned refs are structural (always warn). Cross-repo
  //    contract refs warn only when an org index makes "dangling" decidable;
  //    without one they're advisory ("unverified") to avoid single-repo FPs.
  const structural = findings.filter((f) => f.kind !== "contract");
  const contract = findings.filter((f) => f.kind === "contract");
  const severity: SubmissionCheckResult["severity"] =
    structural.length > 0 || hasOrgIndex ? "warn" : "advisory";

  const lines = findings.map(
    (f) => `${f.file}: spec.${f.field} → "${f.ref}" (no declared entity "${f.name}")`,
  );
  const detailParts = [lines.join("; ")];
  if (contract.length > 0 && !hasOrgIndex) {
    detailParts.push(
      "Cross-repo contract refs are UNVERIFIED — supply submission.contract_integrity.known_entities (an org catalog index) to enforce.",
    );
  }

  return {
    code: "contract_integrity",
    severity,
    title:
      severity === "warn"
        ? "Dangling catalog contract reference"
        : "Unverified catalog contract reference",
    detail: detailParts.join(" "),
    files: [...new Set(findings.map((f) => f.file))],
    suggested_action:
      "Declare the referenced entity in the owning repo's catalog-info.yaml (or fix the reference). " +
      "For cross-repo contracts, ensure the publishing repo declares the API and that it is in the org catalog index.",
    autofix_eligible: false,
  };
}
