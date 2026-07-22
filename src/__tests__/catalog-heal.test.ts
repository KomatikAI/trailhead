import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { planCatalogHeal } from "../healers/catalog.js";
import { detectContractIntegrity } from "../submission-checks/contract-integrity.js";
import { deriveSubmissionFixes } from "../submission-remediation.js";
import { buildAutofixPlan } from "../fixer-core.js";
import type {
  SubmissionCheckContext,
  SubmissionFileInfo,
} from "../submission-checks/types.js";

function ctx(files: SubmissionFileInfo[]): SubmissionCheckContext {
  return {
    files,
    prPaths: new Set(files.map((f) => f.filename)),
    komatikInstance: false,
    staleTerms: [],
    namingAllowlist: {},
    authRouteAllowlist: [],
    authRouteHelpers: [],
    retiredRouteAllowlist: [],
    maxFileLines: 1000,
    declaredPackages: new Set(),
    pathIgnorePatterns: [],
    renamePatterns: [],
    slugOnlyPatterns: [],
    detectorPolicy: {},
  };
}

const catalog = (content: string): SubmissionFileInfo => ({
  filename: "catalog-info.yaml",
  content,
  status: "modified",
});

// A Component pointing at an undeclared System + parent Component (local refs).
const MISSING_LOCAL = `
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: trace-drift
spec:
  type: library
  owner: komatik
  system: trace
  subcomponentOf: trace-core
`;

describe("catalog self-heal lane (ADR-010)", () => {
  it("generates a System stub for a missing spec.system target", () => {
    const plan = planCatalogHeal([catalog(MISSING_LOCAL)]);
    expect(plan.edits).toHaveLength(1);
    const edit = plan.edits[0]!;
    expect(edit.file).toBe("catalog-info.yaml");
    expect(edit.entities).toContain("trace");
    expect(edit.entities).toContain("trace-core");
    // The appended YAML is valid and declares the missing entities.
    type StubDoc = {
      kind: string;
      metadata: { name: string };
      spec: { owner: string };
    };
    const docs = [...yaml.loadAll(edit.append)].filter(Boolean) as StubDoc[];
    const byName = new Map(docs.map((d) => [d.metadata.name, d]));
    expect(byName.get("trace")!.kind).toBe("System");
    expect(byName.get("trace-core")!.kind).toBe("Component");
    // Owner is reused from the sibling entity.
    expect(byName.get("trace")!.spec.owner).toBe("komatik");
  });

  it("applying the stub makes contract_integrity pass (self-heal closes the loop)", () => {
    const plan = planCatalogHeal([catalog(MISSING_LOCAL)]);
    const healed = MISSING_LOCAL + plan.edits[0]!.append;
    // After appending the generated stubs, the local refs now resolve.
    expect(detectContractIntegrity(ctx([catalog(healed)]))).toBeNull();
  });

  it("emits a suggestion (not an edit) for cross-repo refs", () => {
    const crossRepo = `
apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: sundog
spec:
  owner: komatik
---
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: sundog
spec:
  type: service
  owner: komatik
  system: sundog
  consumesApis: [komatik-v3-prebuild]
`;
    const plan = planCatalogHeal([catalog(crossRepo)]);
    expect(plan.edits).toHaveLength(0);
    expect(plan.suggestions.join(" ")).toContain("komatik-v3-prebuild");
  });

  it("detector marks local-fixable findings autofix_eligible", () => {
    const res = detectContractIntegrity(ctx([catalog(MISSING_LOCAL)]));
    expect(res?.autofix_eligible).toBe(true);
  });

  it("detector does NOT mark a pure cross-repo finding autofix_eligible", () => {
    const onlyContract = `
apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: sundog
spec:
  owner: komatik
---
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: sundog
spec:
  type: service
  owner: komatik
  system: sundog
  consumesApis: [komatik-v3-prebuild]
`;
    const res = detectContractIntegrity(ctx([catalog(onlyContract)]));
    expect(res?.autofix_eligible).toBe(false);
  });

  it("flows through remediation as a planned doc-update autofix (lane wired)", () => {
    const check = detectContractIntegrity(ctx([catalog(MISSING_LOCAL)]))!;
    const fixes = deriveSubmissionFixes([check]);
    const fix = fixes.find((f) => f.code === "submission.contract_integrity")!;
    expect(fix.autofix_eligible).toBe(true);
    expect(fix.autofix_class).toBe("doc-update");
    // catalog-info.yaml is not a red-lane path, so the autofix is plannable.
    const plan = buildAutofixPlan(fixes);
    expect(plan.items.some((i) => i.fix.code === "submission.contract_integrity")).toBe(
      true,
    );
    expect(plan.blocked).toHaveLength(0);
  });
});
