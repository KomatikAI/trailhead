import { describe, expect, it } from "vitest";
import { detectImportResolution } from "../submission-checks/detectors.js";
import type { SubmissionCheckContext } from "../submission-checks/types.js";
import { prPathSet } from "../submission-checks/helpers.js";
import {
  buildRenamePatterns,
  buildSlugOnlyPatterns,
} from "../submission-checks/detector-policy.js";

function ctx(
  files: Array<{ filename: string; content: string }>,
  repoPaths?: string[],
): SubmissionCheckContext {
  const normalized = files.map((f) => ({ filename: f.filename, content: f.content }));
  return {
    files: normalized,
    prPaths: prPathSet(normalized),
    komatikInstance: true,
    staleTerms: [],
    authRouteAllowlist: [],
    maxFileLines: 1000,
    declaredPackages: new Set(),
    namingAllowlist: {},
    pathIgnorePatterns: [],
    renamePatterns: buildRenamePatterns(undefined, { includeKomatikDefaults: true }),
    slugOnlyPatterns: buildSlugOnlyPatterns(undefined),
    detectorPolicy: {},
    repoPaths: repoPaths ? new Set(repoPaths) : undefined,
  };
}

const HARNESS = {
  filename: "src/arena/harness.ts",
  content: `import { Mode } from "./types";\nexport const x = 1;\n`,
};

describe("detectImportResolution", () => {
  it("does NOT false-block an import to an existing, unchanged sibling (the bug)", () => {
    // ./types resolves to src/arena/types.ts which exists in the repo but is not
    // part of this PR's changed files.
    const r = detectImportResolution(
      ctx([HARNESS], ["src/arena/types.ts", "src/arena/harness.ts"]),
    );
    expect(r).toBeNull();
  });

  it("stays dormant when repo ground truth is unavailable", () => {
    expect(detectImportResolution(ctx([HARNESS]))).toBeNull();
  });

  it("still blocks a genuinely unresolvable import (not in PR or repo)", () => {
    const r = detectImportResolution(ctx([HARNESS], ["src/arena/harness.ts"]));
    expect(r?.code).toBe("import_resolution");
    expect(r?.severity).toBe("blocking");
    expect(r?.files).toContain("src/arena/harness.ts");
  });

  it("resolves an import to another file changed in the same PR", () => {
    const r = detectImportResolution(
      ctx(
        [
          HARNESS,
          { filename: "src/arena/types.ts", content: "export type Mode = string;" },
        ],
        ["src/arena/harness.ts", "src/arena/types.ts"],
      ),
    );
    expect(r).toBeNull();
  });
});
