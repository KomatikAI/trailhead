import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * ADR-012 D2 trigger-set determinism (train-37): "a label event always
 * yields exactly one authoritative gate evaluation" depends on every
 * shipped and documented workflow embedding the SAME concurrency group
 * suffix and job `if` filter as the CLI generator's canonical source
 * (`TRAILHEAD_GATE_CONCURRENCY_SUFFIX` / `TRAILHEAD_LABEL_JOB_IF` in
 * cli/src/generators.ts). A silently-diverged copy in even one file is how
 * a consuming repo loses the guarantee without anyone noticing — this test
 * fails the build the moment that happens, in this repo's own examples,
 * self-test, reusable workflow, and docs.
 */

const REPO_ROOT = path.resolve(__dirname, "../..");

function read(relPath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), "utf8");
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = 0;
  while (true) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) return count;
    count += 1;
    index = found + needle.length;
  }
}

describe("workflow trigger determinism parity", () => {
  // Files that ship or document a full labeled-trigger gate workflow, with
  // how many independent trigger blocks each is expected to carry.
  //
  // release-ready.yml is the reusable `workflow_call` gate: per its own
  // header comment, "the caller owns PR triggers" — it has no `on.pull_
  // request` of its own and no label-scoped job `if`, only the concurrency
  // group (with its distinct `trailhead-reusable-` prefix, so a called
  // job's serialization can never cancel its caller). Every other target
  // owns real `pull_request`/`pull_request_target` triggers and must carry
  // all three fragments.
  const targets: Array<{
    file: string;
    minBlocks: number;
    expectLabelTypesAndJobIf: boolean;
  }> = [
    {
      file: ".github/workflows/self-test.yml",
      minBlocks: 1,
      expectLabelTypesAndJobIf: true,
    },
    {
      file: ".github/workflows/release-ready.yml",
      minBlocks: 1,
      expectLabelTypesAndJobIf: false,
    },
    {
      file: "examples/solo-web-app/trailhead-workflow.snippet.yml",
      minBlocks: 1,
      expectLabelTypesAndJobIf: true,
    },
    {
      file: "examples/agent-submission-fixture/trailhead-workflow.snippet.yml",
      minBlocks: 1,
      expectLabelTypesAndJobIf: true,
    },
    // getting-started.md embeds the minimal workflow, the "existing workflows"
    // concurrency-only snippet, and the fork publisher — three independent
    // copies of the concurrency contract (the middle one is concurrency-only
    // by design, same shape as the reusable workflow).
    { file: "docs/getting-started.md", minBlocks: 3, expectLabelTypesAndJobIf: false },
    // README.md's "Option C — Manual workflow" section carries two complete,
    // byte-identical copies of the full workflow (the plain version and the
    // branches-filtered variant) — the highest-traffic copy, since it's the
    // one a consuming repo actually pastes from. Both own real triggers.
    { file: "README.md", minBlocks: 2, expectLabelTypesAndJobIf: false },
  ];

  it.each(targets)(
    "$file carries the canonical concurrency suffix ($minBlocks+ block(s))",
    async ({ file, minBlocks, expectLabelTypesAndJobIf }) => {
      const generators = await vi.importActual<{
        TRAILHEAD_GATE_CONCURRENCY_SUFFIX: string;
        checkWorkflowTriggerParity: (contents: string) => {
          hasConcurrencySuffix: boolean;
          hasLabelTypes: boolean;
          hasJobIf: boolean;
        };
      }>("../../cli/src/generators.js");

      const contents = read(file);
      const concurrencyCount = countOccurrences(
        contents,
        generators.TRAILHEAD_GATE_CONCURRENCY_SUFFIX,
      );
      expect(concurrencyCount).toBeGreaterThanOrEqual(minBlocks);

      // Single-block files: also exercise the shared checker end to end.
      if (minBlocks === 1) {
        const result = generators.checkWorkflowTriggerParity(contents);
        expect(result.hasConcurrencySuffix).toBe(true);
        if (expectLabelTypesAndJobIf) {
          expect(result.hasLabelTypes).toBe(true);
          expect(result.hasJobIf).toBe(true);
        }
      }
    },
  );

  it("self-test.yml and both example snippets carry the job-if filter on every real-trigger block", async () => {
    const generators = await vi.importActual<{
      TRAILHEAD_LABEL_JOB_IF: string;
    }>("../../cli/src/generators.js");
    const normalizedJobIf = generators.TRAILHEAD_LABEL_JOB_IF.replace(/[ \t]+/g, " ");

    for (const file of [
      ".github/workflows/self-test.yml",
      "examples/solo-web-app/trailhead-workflow.snippet.yml",
      "examples/agent-submission-fixture/trailhead-workflow.snippet.yml",
    ]) {
      const normalized = read(file).replace(/[ \t]+/g, " ");
      expect(
        normalized.includes(normalizedJobIf),
        `${file} is missing the job-if filter`,
      ).toBe(true);
    }

    // docs/getting-started.md's minimal workflow and fork publisher each own
    // a real trigger and must carry the job-if filter; its middle
    // "existing workflows" snippet is concurrency-only by design and is
    // exempt (see the target table above).
    const gettingStartedNormalized = read("docs/getting-started.md").replace(
      /[ \t]+/g,
      " ",
    );
    expect(
      countOccurrences(gettingStartedNormalized, normalizedJobIf),
    ).toBeGreaterThanOrEqual(2);

    // README.md's two "Option C" copies both own real triggers and must
    // each carry the job-if filter as a substring of their (broader) `if`.
    const readmeNormalized = read("README.md").replace(/[ \t]+/g, " ");
    expect(countOccurrences(readmeNormalized, normalizedJobIf)).toBeGreaterThanOrEqual(2);
  });

  it("the CLI generator's own output satisfies its own contract", async () => {
    const generators = await vi.importActual<{
      generateWorkflowYml: (options: Record<string, unknown>) => string;
      checkWorkflowTriggerParity: (contents: string) => {
        hasConcurrencySuffix: boolean;
        hasLabelTypes: boolean;
        hasJobIf: boolean;
      };
    }>("../../cli/src/generators.js");

    const workflow = generators.generateWorkflowYml({
      riskThreshold: 70,
      healthCheckUrls: [],
      doraMetrics: false,
      doraEnvironment: "",
      otelEndpoint: "",
      evaluationStoreUrl: "",
      storeSecretName: "",
      supabaseFallback: false,
      securityGate: true,
      environment: "",
      gateMode: "release-ready",
      waitForChecks: true,
      rerunOnReview: false,
    });

    const result = generators.checkWorkflowTriggerParity(workflow);
    expect(result).toEqual({
      hasConcurrencySuffix: true,
      hasLabelTypes: true,
      hasJobIf: true,
    });
  });
});
