import type { TestHealer } from "./index.js";

function detectFailureType(errorOutput: string): string {
  const normalized = errorOutput.toLowerCase();
  if (normalized.includes("timeout") && normalized.includes("ms exceeded")) {
    return "timeout";
  }
  if (
    (normalized.includes("page.goto") && normalized.includes("net::")) ||
    normalized.includes("err_connection_refused") ||
    normalized.includes("navigation failed")
  ) {
    return "navigation-failure";
  }
  if (
    (normalized.includes("locator.") &&
      normalized.includes("resolved to") &&
      normalized.includes("element")) ||
    normalized.includes("waiting for locator") ||
    normalized.includes("waiting for selector") ||
    normalized.includes("element not found")
  ) {
    return "selector-drift";
  }
  return "unknown";
}

function repairSelector(
  testFile: string,
  errorOutput: string,
): { diff: string; success: boolean } {
  const selectorMatch = errorOutput.match(
    /(?:locator|getBy[A-Za-z]{1,32})\(['"]([^'"\r\n]{1,500})['"]\)/,
  );
  const selector = selectorMatch?.[1] ?? "(unknown selector)";

  return {
    success: true,
    diff: [
      `--- ${testFile}`,
      `+++ ${testFile} (suggested)`,
      ``,
      `Selector '${selector}' no longer matches.`,
      ``,
      `Suggested fixes:`,
      `  1. Use data-testid selectors for stability: page.getByTestId('...')`,
      `  2. Use role-based selectors: page.getByRole('button', { name: '...' })`,
      `  3. Update the selector to match the current DOM structure`,
      `  4. Add { timeout: 10000 } if the element loads asynchronously`,
    ].join("\n"),
  };
}

function repairTimeout(
  testFile: string,
  errorOutput: string,
): { diff: string; success: boolean } {
  const timeoutMatch = errorOutput.match(/Timeout (\d+)ms exceeded/);
  const currentTimeout = timeoutMatch ? parseInt(timeoutMatch[1], 10) : 30000;
  const suggested = Math.min(currentTimeout * 2, 120000);

  return {
    success: true,
    diff: [
      `--- ${testFile}`,
      `+++ ${testFile} (suggested)`,
      ``,
      `Test timed out at ${currentTimeout}ms.`,
      ``,
      `Suggested fixes:`,
      `  1. Increase test timeout: test.setTimeout(${suggested})`,
      `  2. Add explicit waits: await page.waitForLoadState('networkidle')`,
      `  3. Check if the target service is healthy before running E2E tests`,
      `  4. Use page.waitForSelector() with a specific timeout`,
    ].join("\n"),
  };
}

function repairNavigation(testFile: string): { diff: string; success: boolean } {
  return {
    success: true,
    diff: [
      `--- ${testFile}`,
      `+++ ${testFile} (suggested)`,
      ``,
      `Navigation failed — the target URL may be unreachable.`,
      ``,
      `Suggested fixes:`,
      `  1. Verify the base URL is correct in playwright.config.ts`,
      `  2. Ensure the dev server is running before tests start (webServer config)`,
      `  3. Add retry logic: test.describe.configure({ retries: 2 })`,
      `  4. Check CI network configuration and firewall rules`,
    ].join("\n"),
  };
}

export const playwrightHealer: TestHealer = {
  name: "playwright",

  canHandle(testFile: string, _errorOutput: string): boolean {
    if (testFile.endsWith(".cy.ts") || testFile.includes("cypress/")) return false;
    return testFile.endsWith(".spec.ts") || testFile.includes("e2e/");
  },

  async repair(testFile: string, errorOutput: string) {
    const failureType = detectFailureType(errorOutput);

    let result: { diff: string; success: boolean };
    switch (failureType) {
      case "selector-drift":
        result = repairSelector(testFile, errorOutput);
        break;
      case "timeout":
        result = repairTimeout(testFile, errorOutput);
        break;
      case "navigation-failure":
        result = repairNavigation(testFile);
        break;
      default:
        result = { success: false, diff: "" };
    }

    return {
      testFile,
      failureType,
      strategy: `playwright-${failureType}`,
      success: result.success,
      diff: result.diff || undefined,
    };
  },
};
