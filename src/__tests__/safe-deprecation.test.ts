import { describe, expect, it } from "vitest";
import { detectSafeDeprecation } from "../submission-checks/safe-deprecation.js";
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
  status: "added",
});

describe("safe_deprecation (ADR-010)", () => {
  it("returns null when nothing is deprecated", () => {
    const c = `
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: trace
spec:
  type: service
  lifecycle: production
  owner: komatik
  system: trace
`;
    expect(detectSafeDeprecation(ctx([catalog(c)]))).toBeNull();
  });

  it("flags a LIVE entity that still depends on a deprecated one (zombie wire)", () => {
    const c = `
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: watchtower
spec:
  type: service
  lifecycle: deprecated
  owner: komatik
  system: trace
---
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: dashboard
spec:
  type: service
  lifecycle: production
  owner: komatik
  system: trace
  dependsOn: [component:default/watchtower]
`;
    const res = detectSafeDeprecation(ctx([catalog(c)]));
    expect(res).not.toBeNull();
    expect(res!.code).toBe("safe_deprecation");
    expect(res!.severity).toBe("warn");
    expect(res!.detail).toContain("dashboard");
    expect(res!.detail).toContain("watchtower");
  });

  it("does NOT flag a deprecated entity pointing at a live one (correct absorption)", () => {
    // The Trace absorption shape: a deprecated sub-component points UP to the
    // live parent. That's fine — the corpse references the survivor, not vice versa.
    const c = `
apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: trace
spec:
  owner: komatik
---
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: trace
spec:
  type: service
  lifecycle: production
  owner: komatik
  system: trace
---
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: trace-watchtower
spec:
  type: library
  lifecycle: deprecated
  owner: komatik
  system: trace
  subcomponentOf: trace
`;
    expect(detectSafeDeprecation(ctx([catalog(c)]))).toBeNull();
  });

  it("returns null when there are no catalog files", () => {
    expect(detectSafeDeprecation(ctx([{ filename: "src/x.ts", content: "export {}" }]))).toBeNull();
  });
});
