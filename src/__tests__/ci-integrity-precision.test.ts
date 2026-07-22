import { describe, expect, it } from "vitest";
import { detectCiIntegrity } from "../ci-integrity.js";

describe("CI integrity diff precision", () => {
  it("ignores unchanged and deleted bypass context", () => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/ci.yml",
        patch: [
          "@@ -10,3 +10,4 @@",
          "  run: du -sh coverage || true",
          "- run: legacy-check || true",
          "+ run: npm test",
        ].join("\n"),
      },
    ]);

    expect(result.blockingPatterns).toEqual([]);
    expect(result.score).toBe(0);
  });

  it("still blocks a newly added bypass", () => {
    const result = detectCiIntegrity([
      {
        filename: ".github/workflows/ci.yml",
        patch: "@@ -1,1 +1,2 @@\n+      run: npm test || true",
      },
    ]);

    expect(result.blockingPatterns).toHaveLength(1);
    expect(result.score).toBe(45);
  });
});
