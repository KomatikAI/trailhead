import type { AutofixBuilderRegistry, AutofixContentBuilder } from "./autofix-executor.js";
/**
 * contract_integrity → append the generated stub entities to each affected
 * catalog-info.yaml (full-content edit = current file + heal append). Only LOCAL
 * missing entities produce edits; cross-repo refs stay suggestions (no edit).
 */
export declare const contractIntegrityBuilder: AutofixContentBuilder;
export declare const DEFAULT_AUTOFIX_BUILDERS: AutofixBuilderRegistry;
