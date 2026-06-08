import { describe, expect, it } from "vitest";
import { detectCloseOnShipLink } from "../submission-checks/phase0-detectors.js";
import type { SubmissionCheckContext } from "../submission-checks/types.js";
import { prPathSet } from "../submission-checks/helpers.js";
import {
  buildRenamePatterns,
  buildSlugOnlyPatterns,
} from "../submission-checks/detector-policy.js";

function ctx(
  files: Array<{ filename: string; content?: string }>,
  prBody?: string,
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
    prBody,
  };
}

const TASK = "4139db4b-3993-4e1a-9b2c-aaaaaaaaaaaa";
const SUG = "agents/backend-dev/suggestions/komatik/fix/idea.md";

describe("detectCloseOnShipLink", () => {
  it("returns null when the PR has no suggestion files", () => {
    expect(
      detectCloseOnShipLink(ctx([{ filename: "src/app.ts", content: "x" }])),
    ).toBeNull();
  });

  it("flags a suggestion missing a 'Task: <id>' provenance line", () => {
    const r = detectCloseOnShipLink(
      ctx([{ filename: SUG, content: "# Proposal\nno task line here" }]),
    );
    expect(r?.code).toBe("close_on_ship_link");
    expect(r?.severity).toBe("advisory");
    expect(r?.files).toContain(SUG);
  });

  it("is dormant on the body half when prBody is absent (provenance present)", () => {
    const r = detectCloseOnShipLink(
      ctx([{ filename: SUG, content: `# Proposal\nTask: ${TASK}\n` }]),
    );
    expect(r).toBeNull();
  });

  it("flags when the PR body lacks a 'Closes task: <id>' for a task-linked suggestion", () => {
    const r = detectCloseOnShipLink(
      ctx([{ filename: SUG, content: `Task: ${TASK}` }], "Ships the fix. No close link."),
    );
    expect(r?.code).toBe("close_on_ship_link");
    expect(r?.detail).toMatch(/Closes task/i);
  });

  it("passes when the PR body carries 'Closes task: <id>' (full or short id)", () => {
    expect(
      detectCloseOnShipLink(
        ctx([{ filename: SUG, content: `Task: ${TASK}` }], `Closes task: ${TASK}`),
      ),
    ).toBeNull();
    expect(
      detectCloseOnShipLink(
        ctx(
          [{ filename: SUG, content: `Task: ${TASK}` }],
          `Resolves task: ${TASK.slice(0, 8)}`,
        ),
      ),
    ).toBeNull();
  });
});
