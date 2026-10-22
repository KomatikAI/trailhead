import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("verifies deployment correlation without production access", () => {
  const fixture = fileURLToPath(
    new URL("../../scripts/record-deploy-correlation.test.mjs", import.meta.url),
  );
  expect(() =>
    execFileSync(process.execPath, ["--test", fixture], { encoding: "utf8" }),
  ).not.toThrow();
});
