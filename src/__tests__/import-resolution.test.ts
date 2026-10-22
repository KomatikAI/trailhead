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
    authRouteHelpers: [],
    retiredRouteAllowlist: [],
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
  it("ignores aliases and import text in generated source templates (#366)", () => {
    const content = [
      'import { readFileSync } from "node:fs";',
      'import { tool } from "@/src/tool";',
      '// import missing from "./comment-only";',
      'const template = `import { initPortal } from "./portal";`;',
      "const example = \"require('./example-only')\";",
    ].join("\n");
    expect(
      detectImportResolution(ctx([{ filename: "src/tool.ts", content }], [])),
    ).toBeNull();
  });

  it.each([
    ['import { x } from "./types.js";', "src/arena/types.ts"],
    ['export * from "./types.js";', "src/arena/types.ts"],
    ['const m = import("./types.js");', "src/arena/types.ts"],
    ['const m = require("./types.js");', "src/arena/types.ts"],
    ['import X from "./view";', "src/arena/view/index.tsx"],
  ])(
    "resolves real imports with TypeScript extension substitution: %s",
    (content, path) => {
      expect(detectImportResolution(ctx([{ ...HARNESS, content }], [path]))).toBeNull();
    },
  );

  it.each(['export * from "./missing";', 'const m = import("./missing");'])(
    "blocks missing real re-exports and dynamic imports: %s",
    (content) => {
      expect(detectImportResolution(ctx([{ ...HARNESS, content }], []))?.severity).toBe(
        "blocking",
      );
    },
  );

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
