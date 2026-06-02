import { describe, expect, it } from "vitest";
import { detectClaimAnchoring } from "../submission-checks/claim-anchoring.js";
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

const md = (content: string): SubmissionFileInfo => ({
  filename: "docs/notes.md",
  content,
  status: "modified",
});

describe("claim_anchoring (ADR-010)", () => {
  it("flags an unanchored behavioral claim (the redirects-exist incident)", () => {
    const res = detectClaimAnchoring(
      ctx([md("Legacy redirects exist for all old slugs.")]),
    );
    expect(res).not.toBeNull();
    expect(res!.code).toBe("claim_anchoring");
    expect(res!.severity).toBe("advisory");
    expect(res!.detail).toContain("redirects exist");
  });

  it("passes when the claim cites a file/path anchor", () => {
    expect(
      detectClaimAnchoring(ctx([md("Legacy redirects exist (see `proxy.ts`).")])),
    ).toBeNull();
  });

  it("passes when an adjacent line links to a test", () => {
    const doc =
      "Every legacy slug is redirected.\nVerified-by: [redirect test](src/__tests__/redirects.test.ts)";
    expect(detectClaimAnchoring(ctx([md(doc)]))).toBeNull();
  });

  it("honors the <!-- claim-ok --> override", () => {
    expect(
      detectClaimAnchoring(ctx([md("This is guaranteed to work. <!-- claim-ok -->")])),
    ).toBeNull();
  });

  it("ignores claims inside fenced code blocks", () => {
    const doc = "```\nredirects exist\n```\n";
    expect(detectClaimAnchoring(ctx([md(doc)]))).toBeNull();
  });

  it("ignores non-doc files and prose without behavioral claims", () => {
    expect(
      detectClaimAnchoring(
        ctx([
          { filename: "src/x.ts", content: "// redirects exist", status: "added" },
          md("This document describes the architecture and the team."),
        ]),
      ),
    ).toBeNull();
  });
});
