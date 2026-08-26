export interface CiIntegrityFile {
  filename: string;
  additions?: number;
  deletions?: number;
  patch?: string;
}

export interface CiIntegrityResult {
  score: number;
  blockingPatterns: string[];
  warningSignals: string[];
}

function addedPatchLines(patch: string | undefined): string[] {
  if (!patch) return [];
  return patch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
}

const OR_TRUE_BYPASS = /\|\|\s*true/;

/** A `|| true` on a `trap '…'` line is best-effort cleanup, not a CI bypass:
 * the suppression applies only to the trap handler's own command (e.g.
 * `trap 'docker rm --force "$c" >/dev/null 2>&1 || true' EXIT`), never to a
 * test/build step's outcome. First hit: komatik release train #4864
 * (2026-08-26), where teams-worker.yml's container-cleanup trap was flagged
 * as a blocking bypass. The optional `run:` prefix keeps the inline YAML form
 * (`run: trap '…' EXIT`) exempt too; a `|| true` on any other added line
 * still blocks. */
const TRAP_CLEANUP_LINE = /^\s*(?:-\s*)?(?:run:\s*)?trap\b/;

/** Detect newly introduced CI bypasses, never unchanged or deleted context. */
export function detectCiIntegrity(files: CiIntegrityFile[]): CiIntegrityResult {
  const blockingPatterns: string[] = [];
  const warningSignals: string[] = [];
  let score = 0;

  for (const file of files.filter((entry) =>
    entry.filename.startsWith(".github/workflows/"),
  )) {
    const addedLines = addedPatchLines(file.patch);
    const added = addedLines.join("\n");
    if (
      addedLines.some(
        (line) => OR_TRUE_BYPASS.test(line) && !TRAP_CLEANUP_LINE.test(line),
      )
    ) {
      blockingPatterns.push(`${file.filename}: workflow bypass pattern "|| true"`);
      score += 45;
    }
    if (/^\s*continue-on-error:\s*true\b/m.test(added)) {
      blockingPatterns.push(`${file.filename}: introduced "continue-on-error: true"`);
      score += 45;
    }
    if (/^\s*if:\s*\$\{\{\s*always\(\)\s*\}\}/m.test(added)) {
      warningSignals.push(`${file.filename}: always() condition added to workflow gate`);
      score += 20;
    }
  }

  for (const file of files.filter((entry) =>
    /\.(test|spec)\.(ts|tsx|js|jsx)$|__tests__\/|\.cy\.(ts|js)$/.test(entry.filename),
  )) {
    const additions = file.additions ?? 0;
    const deletions = file.deletions ?? 0;
    if (deletions > additions * 2 && deletions >= 10) {
      warningSignals.push(
        `${file.filename}: heavy test deletion (${deletions} deleted / ${additions} added)`,
      );
      score += 25;
    }
  }

  for (const file of files) {
    const patch = file.patch ?? "";
    if (!patch) continue;
    if (
      /^-\s*(branches|functions|lines|statements)\s*:\s*\d+/m.test(patch) &&
      /^\+\s*(branches|functions|lines|statements)\s*:\s*\d+/m.test(patch)
    ) {
      warningSignals.push(`${file.filename}: coverage threshold definition changed`);
      score += 20;
    }
  }

  return {
    score: Math.min(100, score),
    blockingPatterns,
    warningSignals,
  };
}
