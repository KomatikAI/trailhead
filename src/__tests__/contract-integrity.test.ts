import { describe, expect, it } from "vitest";
import { detectContractIntegrity } from "../submission-checks/contract-integrity.js";
import type {
  SubmissionCheckContext,
  SubmissionFileInfo,
} from "../submission-checks/types.js";

function ctx(
  files: SubmissionFileInfo[],
  catalogKnownEntities?: Set<string>,
): SubmissionCheckContext {
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
    catalogKnownEntities,
  };
}

function catalog(filename: string, content: string): SubmissionFileInfo {
  return { filename, content, status: "added" };
}

// A satellite consuming a platform API it doesn't declare locally (the Wave 1 case).
const SATELLITE = `
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
  consumesApis: [identity, komatik-v3-prebuild]
  dependsOn: [component:default/pipeline-engine-v3]
`;

describe("contract_integrity (ADR-010)", () => {
  it("returns null when there are no catalog files", () => {
    expect(detectContractIntegrity(ctx([catalog("src/index.ts", "export {}")]))).toBeNull();
  });

  it("flags a cross-repo contract ref as DANGLING when an org index lacks it (pre-Wave-1)", () => {
    // Org index exists but does NOT publish komatik-v3-prebuild yet.
    const index = new Set(["identity", "pipeline-engine-v3"]);
    const res = detectContractIntegrity(ctx([catalog("catalog-info.yaml", SATELLITE)], index));
    expect(res).not.toBeNull();
    expect(res!.code).toBe("contract_integrity");
    expect(res!.severity).toBe("warn");
    expect(res!.detail).toContain("komatik-v3-prebuild");
    // identity + pipeline-engine-v3 ARE in the index → not flagged
    expect(res!.detail).not.toContain('"identity"');
  });

  it("resolves cleanly once the org index publishes the API (post-Wave-1)", () => {
    const index = new Set(["identity", "komatik-v3-prebuild", "pipeline-engine-v3"]);
    expect(
      detectContractIntegrity(ctx([catalog("catalog-info.yaml", SATELLITE)], index)),
    ).toBeNull();
  });

  it("reports cross-repo refs as ADVISORY (unverified) when no org index is configured", () => {
    const res = detectContractIntegrity(ctx([catalog("catalog-info.yaml", SATELLITE)]));
    expect(res).not.toBeNull();
    expect(res!.severity).toBe("advisory");
    expect(res!.detail).toContain("UNVERIFIED");
  });

  it("WARNs on a local structural ref (system/subcomponentOf) even with no index", () => {
    const broken = `
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: trace-drift
spec:
  type: library
  owner: komatik
  system: trace
  subcomponentOf: trace
`;
    // `trace` is neither declared in-PR nor in any index → structural warn.
    const res = detectContractIntegrity(ctx([catalog("catalog-info.yaml", broken)]));
    expect(res).not.toBeNull();
    expect(res!.severity).toBe("warn");
    expect(res!.detail).toContain("trace");
  });

  it("passes when local refs resolve against in-PR declarations (Trace absorption)", () => {
    const traceCatalog = `
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
  owner: komatik
  system: trace
---
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: trace-drift
spec:
  type: library
  owner: komatik
  system: trace
  subcomponentOf: trace
`;
    expect(
      detectContractIntegrity(ctx([catalog("catalog-info.yaml", traceCatalog)])),
    ).toBeNull();
  });

  it("flags a providesApis that declares no matching API entity", () => {
    const provider = `
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: pack
spec:
  type: service
  owner: komatik
  system: pack
  providesApis: [komatik-pack-meter]
---
apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: pack
spec:
  owner: komatik
`;
    // System 'pack' is declared so `system: pack` resolves, but the API entity
    // 'komatik-pack-meter' is never declared → owned-ref warn.
    const res = detectContractIntegrity(ctx([catalog("catalog-info.yaml", provider)]));
    expect(res).not.toBeNull();
    expect(res!.severity).toBe("warn");
    expect(res!.detail).toContain("komatik-pack-meter");
  });
});
