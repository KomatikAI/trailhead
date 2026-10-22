import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("runs the Lodge evidence and CLI contracts without network access", () => {
  const fixture = fileURLToPath(
    new URL("../../scripts/check-lodge-evidence.test.mjs", import.meta.url),
  );
  expect(() =>
    execFileSync(process.execPath, ["--test", fixture], { encoding: "utf8" }),
  ).not.toThrow();
});
