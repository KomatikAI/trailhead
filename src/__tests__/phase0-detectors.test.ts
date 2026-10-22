import { describe, expect, it } from "vitest";
import { runSubmissionGate } from "../submission-engine.js";
import {
  detectActionExtractionPresent,
  detectOutputSizeMin,
  detectPreambleAbsent,
  detectReferencedFilesExist,
  detectSessionNarrativeDetection,
} from "../submission-checks/phase0-detectors.js";
import type { SubmissionCheckContext } from "../submission-checks/types.js";
import { prPathSet } from "../submission-checks/helpers.js";
import {
  buildRenamePatterns,
  buildSlugOnlyPatterns,
} from "../submission-checks/detector-policy.js";

function ctx(
  files: Array<{ filename: string; content?: string; patch?: string }>,
  repoPaths?: string[],
): SubmissionCheckContext {
  const normalized = files.map((f) => ({
    filename: f.filename,
    content: f.content,
    patch: f.patch,
  }));
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

describe("phase0 submission detectors", () => {
  it("flags short coordinator suggestion output", () => {
    const check = detectOutputSizeMin(
      ctx([
        {
          filename: "agents/coordinator/suggestions/2026-05-28.md",
          content: "Brief note only.",
        },
      ]),
    );
    expect(check?.code).toBe("output_size_min");
    expect(check?.severity).toBe("advisory");
  });

  it("flags coordinator paragraphs without action extraction", () => {
    const check = detectActionExtractionPresent(
      ctx([
        {
          filename: "agents/coordinator/suggestions/brief.md",
          content:
            "## Summary\n\nPipeline health is stable.\n\n## Follow-ups\n\nReview open PRs tomorrow.",
        },
      ]),
    );
    expect(check?.code).toBe("action_extraction_present");
  });

  it("passes coordinator when paragraphs end with owner routing", () => {
    const check = detectActionExtractionPresent(
      ctx([
        {
          filename: "agents/coordinator/suggestions/brief.md",
          content:
            "Pipeline stable. → @pipeline-ops\n\nNo blockers. — No actions surfaced",
        },
      ]),
    );
    expect(check).toBeNull();
  });

  it("flags conversational preambles", () => {
    const check = detectPreambleAbsent(
      ctx([
        {
          filename: "agents/frontend-dev/suggestions/ui.md",
          content:
            "Let me analyze the navigation regression.\n\n## Fix\n\nUpdate the header.",
        },
      ]),
    );
    expect(check?.code).toBe("preamble_absent");
  });

  it("integrates phase0 checks via runSubmissionGate for suggestion paths", () => {
    const checks = runSubmissionGate({
      komatikInstance: true,
      files: [
        {
          filename: "agents/knowledge-scout/suggestions/DAILY-INTEL.md",
          content: "Let me summarize today.\n\nNo delta header here.",
        },
      ],
    });
    expect(checks.some((c) => c.code === "preamble_absent")).toBe(true);
    expect(checks.some((c) => c.code === "delta_section_present")).toBe(true);
    expect(
      checks.every((c) => c.severity !== "blocking" || !c.code.startsWith("output")),
    ).toBe(true);
  });

  it("skips phase0 on non-suggestion markdown", () => {
    const checks = runSubmissionGate({
      files: [{ filename: "README.md", content: "Let me explain this project." }],
    });
    expect(checks.some((c) => c.code === "preamble_absent")).toBe(false);
  });

  describe("referenced_files_exist precision", () => {
    const fileReferencing = (path: string) => [
      {
        filename: "agents/coordinator/suggestions/plan.md",
        content: `Update the loader in \`${path}\` before the next run.`,
      },
    ];

    it("stays dormant without a repo file listing (no false accusation)", () => {
      const check = detectReferencedFilesExist(ctx(fileReferencing("src/loader.ts")));
      expect(check).toBeNull();
    });

    it("passes when the referenced file exists in the repo but not the PR", () => {
      const check = detectReferencedFilesExist(
        ctx(fileReferencing("src/loader.ts"), ["src/loader.ts", "src/other.ts"]),
      );
      expect(check).toBeNull();
    });

    it("flags a referenced path absent from both PR and repo", () => {
      const check = detectReferencedFilesExist(
        ctx(fileReferencing("src/loader.ts"), ["src/other.ts"]),
      );
      expect(check?.code).toBe("referenced_files_exist");
      expect(check?.severity).toBe("advisory");
    });
  });

  describe("session_narrative_detection threshold is per-file", () => {
    it("flags a single document dense with session narration", () => {
      const check = detectSessionNarrativeDetection(
        ctx([
          {
            filename: "agents/rd-satellite/suggestions/log.md",
            content:
              "I queried the table. I reviewed the diffs. I will implement the fix.",
          },
        ]),
      );
      expect(check?.code).toBe("session_narrative_detection");
    });

    it("does not flag narration spread thin across many files", () => {
      const check = detectSessionNarrativeDetection(
        ctx([
          { filename: "agents/a/suggestions/x.md", content: "I queried the table." },
          { filename: "agents/b/suggestions/y.md", content: "I reviewed the diffs." },
          { filename: "agents/c/suggestions/z.md", content: "I checked the logs." },
        ]),
      );
      expect(check).toBeNull();
    });
  });
});
