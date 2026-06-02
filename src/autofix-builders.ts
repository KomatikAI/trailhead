// Default autofix content builders (ADR-010). Maps a planned fix code to the
// concrete file edits that resolve it. Builders are pure: (item, files, ctx) →
// FileEdit[]. The executor commits the result via an injected GitWriter.

import type {
  AutofixBuilderRegistry,
  AutofixContentBuilder,
  FileEdit,
} from "./autofix-executor.js";
import { fileContent, normalizePath } from "./submission-checks/helpers.js";
import { planCatalogHeal } from "./healers/catalog.js";

/**
 * contract_integrity → append the generated stub entities to each affected
 * catalog-info.yaml (full-content edit = current file + heal append). Only LOCAL
 * missing entities produce edits; cross-repo refs stay suggestions (no edit).
 */
export const contractIntegrityBuilder: AutofixContentBuilder = (_item, files, ctx) => {
  const plan = planCatalogHeal(files, ctx.catalogKnownEntities);
  const edits: FileEdit[] = [];
  for (const healEdit of plan.edits) {
    const original = files.find((f) => normalizePath(f.filename) === healEdit.file);
    if (!original) continue;
    edits.push({
      path: healEdit.file,
      content: fileContent(original) + healEdit.append,
    });
  }
  return edits;
};

export const DEFAULT_AUTOFIX_BUILDERS: AutofixBuilderRegistry = {
  "submission.contract_integrity": contractIntegrityBuilder,
};
