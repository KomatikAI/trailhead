import type { SubmissionFileInfo } from "../submission-checks/types.js";
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
/**
 * Plan the catalog self-heal for a PR: auto-declare missing LOCAL entities,
 * and surface cross-repo refs as suggestions.
 */
export declare function planCatalogHeal(files: SubmissionFileInfo[], knownEntities?: Set<string>): CatalogHealPlan;
