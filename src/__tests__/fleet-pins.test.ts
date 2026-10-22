import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("runs the fleet audit contract fixtures without network access", () => {
  const fixture = fileURLToPath(
    new URL("../../scripts/check-fleet-trailhead-pins.test.mjs", import.meta.url),
  );
  expect(() =>
    execFileSync(process.execPath, ["--test", fixture], { encoding: "utf8" }),
  ).not.toThrow();
});

it("runs the soak readiness contract fixtures without network access", () => {
  const fixture = fileURLToPath(
    new URL("../../scripts/query-agents-submission-soak.test.mjs", import.meta.url),
  );
  expect(() =>
    execFileSync(process.execPath, ["--test", fixture], { encoding: "utf8" }),
  ).not.toThrow();
});
