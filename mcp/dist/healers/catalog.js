// Catalog self-heal lane (ADR-010) for the contract_integrity detector.
//
// When a catalog-info.yaml reference doesn't resolve, the in-repo-fixable case is
// a LOCAL structural ref — `spec.system` / `spec.subcomponentOf` pointing at an
// entity that simply isn't declared in the same repo's catalog. The fix is to add
// a minimal stub for that entity, which this healer generates as YAML to append.
//
// Cross-repo refs (consumesApis / dependsOn / providesApis to something another
// repo owns) can't be fixed in this PR — the fix belongs in the owning repo. For
// those we emit a human-actionable suggestion rather than an edit here. When an
// api_owners map resolves the owning repo, the cross-repo PR opener
// (cross-repo-opener.ts) turns those suggestions into actual declaration PRs in
// that repo; otherwise the suggestion stands.
import yaml from "js-yaml";
import { analyzeCatalogRefs, } from "../submission-checks/contract-integrity.js";
import { fileContent, normalizePath } from "../submission-checks/helpers.js";
/** Best-effort owner for stubs: reuse a sibling entity's owner, else "unknown". */
function ownerHint(content) {
    try {
        let owner;
        yaml.loadAll(content, (doc) => {
            if (owner)
                return;
            const spec = doc?.spec;
            if (typeof spec?.owner === "string")
                owner = spec.owner;
        });
        return owner ?? "unknown";
    }
    catch {
        return "unknown";
    }
}
function systemStub(name, owner) {
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
function componentStub(name, owner) {
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
export function planCatalogHeal(files, knownEntities) {
    const analysis = analyzeCatalogRefs(files, knownEntities);
    if (!analysis)
        return { edits: [], suggestions: [] };
    const local = analysis.findings.filter((f) => f.kind === "local");
    const crossRepo = analysis.findings.filter((f) => f.kind !== "local");
    // Group local findings by file, dedupe by entity name (a System ref wins over
    // a Component ref for the same name — a System is the broader container).
    const byFile = new Map();
    for (const f of local) {
        const fileMap = byFile.get(f.file) ?? new Map();
        const existing = fileMap.get(f.name);
        if (!existing || (existing.field !== "system" && f.field === "system")) {
            fileMap.set(f.name, f);
        }
        byFile.set(f.file, fileMap);
    }
    const edits = [];
    for (const [file, entityMap] of byFile) {
        const original = files.find((cf) => normalizePath(cf.filename) === file);
        const owner = original ? ownerHint(fileContent(original)) : "unknown";
        const stubs = [];
        const entities = [];
        for (const finding of entityMap.values()) {
            const stub = finding.field === "system"
                ? systemStub(finding.name, owner)
                : componentStub(finding.name, owner);
            stubs.push(stub);
            entities.push(finding.name);
        }
        if (stubs.length === 0)
            continue;
        const append = "\n---\n" + stubs.join("\n---\n") + "\n";
        edits.push({ file, append, entities });
    }
    const suggestions = crossRepo.map((f) => `Declare ${f.kind === "owned" ? "API" : "the referenced entity"} "${f.name}" in its owning repo's catalog-info.yaml (referenced via spec.${f.field} in ${f.file}).`);
    return { edits, suggestions };
}
