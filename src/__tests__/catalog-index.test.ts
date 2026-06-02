import { describe, expect, it } from "vitest";
import { parseCatalogIndex } from "../catalog-index.js";
import { runSubmissionGate } from "../submission-engine.js";
import type { RepoConfig } from "../types.js";

describe("parseCatalogIndex", () => {
  it("extracts the entities array", () => {
    expect(parseCatalogIndex('{"version":1,"entities":["identity","trace"]}')).toEqual([
      "identity",
      "trace",
    ]);
  });

  it("drops non-string / empty entries and tolerates a missing array", () => {
    expect(parseCatalogIndex('{"entities":["a", 2, "", null, "b"]}')).toEqual(["a", "b"]);
    expect(parseCatalogIndex('{"version":1}')).toEqual([]);
  });
});

// A satellite consuming a platform API published in another repo.
const SATELLITE_CATALOG = `
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: sundog
spec:
  type: service
  owner: komatik
  system: sundog
  consumesApis: [komatik-v3-prebuild]
---
apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: sundog
spec:
  owner: komatik
`;

function gateWith(config: Partial<RepoConfig["submission"]>) {
  return runSubmissionGate({
    files: [{ filename: "catalog-info.yaml", content: SATELLITE_CATALOG, status: "added" }],
    repoConfig: { submission: { enabled: true, ...config } } as RepoConfig,
  });
}

describe("contract_integrity wiring via submission config (ADR-010)", () => {
  it("is advisory when no org index is configured", () => {
    const ci = gateWith({}).find((c) => c.code === "contract_integrity");
    expect(ci).toBeTruthy();
    expect(ci!.severity).toBe("advisory");
  });

  it("resolves cleanly once known_entities publishes the API", () => {
    const ci = gateWith({
      contract_integrity: { known_entities: ["komatik-v3-prebuild"] },
    }).find((c) => c.code === "contract_integrity");
    expect(ci).toBeUndefined();
  });

  it("warns (dangling) when an index is configured but lacks the API", () => {
    const ci = gateWith({
      contract_integrity: { known_entities: ["something-else"] },
    }).find((c) => c.code === "contract_integrity");
    expect(ci).toBeTruthy();
    expect(ci!.severity).toBe("warn");
    expect(ci!.detail).toContain("komatik-v3-prebuild");
  });
});
