import type { TestHealer } from "./index.js";

function detectFailureType(errorOutput: string): string {
  const normalized = errorOutput.toLowerCase();
  if (
    normalized.includes("cy.intercept") ||
    (normalized.includes("cy.wait") && normalized.includes("alias")) ||
    normalized.includes("no request ever occurred")
  ) {
    return "intercept-drift";
  }
  if (
    (normalized.includes("timed out retrying") &&
      ["cy.get", "cy.find", "cy.contains"].some((token) => normalized.includes(token))) ||
    normalized.includes("expected to find element") ||
    (normalized.includes("querying for") && normalized.includes("element"))
  ) {
    return "selector-drift";
  }
  if (
    normalized.includes("timed out retrying after ") ||
    (normalized.includes("cypresserror") && normalized.includes("timeout"))
  ) {
    return "timeout";
  }
  return "unknown";
}

function repairSelector(
  testFile: string,
  errorOutput: string,
): { diff: string; success: boolean } {
  const selectorMatch = errorOutput.match(/cy\.(?:get|find)\(['"]([^'"]+)['"]\)/);
  const selector = selectorMatch?.[1] ?? "(unknown selector)";

  return {
    success: true,
    diff: [
      `--- ${testFile}`,
      `+++ ${testFile} (suggested)`,
      ``,
      `Selector '${selector}' not found in DOM.`,
      ``,
      `Suggested fixes:`,
      `  1. Use data-cy selectors: cy.get('[data-cy="..."]')`,
      `  2. Use cy.contains() for text-based selection`,
      `  3. Increase the default command timeout in cypress.config.ts`,
      `  4. Add .should('exist') assertions after navigation to wait for render`,
    ].join("\n"),
  };
}

function repairIntercept(
  testFile: string,
  errorOutput: string,
): { diff: string; success: boolean } {
  const aliasMatch = errorOutput.match(
    /cy\.wait\(['"]@([^'"\r\n]{1,200})['"]\)|alias[^'"\r\n]{0,200}['"]@([^'"\r\n]{1,200})['"]/,
  );
  const alias = aliasMatch?.[1] ?? aliasMatch?.[2] ?? "(unknown)";

  return {
    success: true,
    diff: [
      `--- ${testFile}`,
      `+++ ${testFile} (suggested)`,
      ``,
      `Intercept alias '@${alias}' never matched a request.`,
      ``,
      `Suggested fixes:`,
      `  1. Verify the intercept URL pattern matches the actual API call`,
      `  2. Check if the API endpoint was renamed or its method changed`,
      `  3. Ensure cy.intercept() is called BEFORE the action that triggers the request`,
      `  4. Use cy.intercept({ method: 'GET', url: '**/api/...' }).as('${alias}')`,
    ].join("\n"),
  };
}

function repairTimeout(
  testFile: string,
  errorOutput: string,
): { diff: string; success: boolean } {
  const timeoutMatch = errorOutput.match(/after (\d+)ms/);
  const current = timeoutMatch ? parseInt(timeoutMatch[1], 10) : 4000;
  const suggested = Math.min(current * 2, 60000);

  return {
    success: true,
    diff: [
      `--- ${testFile}`,
      `+++ ${testFile} (suggested)`,
      ``,
      `Command timed out after ${current}ms.`,
      ``,
      `Suggested fixes:`,
      `  1. Increase timeout: cy.get('selector', { timeout: ${suggested} })`,
      `  2. Add explicit waits: cy.get('selector').should('be.visible')`,
      `  3. Update defaultCommandTimeout in cypress.config.ts`,
      `  4. Check if the application loads slower in CI environments`,
    ].join("\n"),
  };
}

export const cypressHealer: TestHealer = {
  name: "cypress",

  canHandle(testFile: string, _errorOutput: string): boolean {
    return testFile.endsWith(".cy.ts") || testFile.includes("cypress/");
  },

  async repair(testFile: string, errorOutput: string) {
    const failureType = detectFailureType(errorOutput);

    let result: { diff: string; success: boolean };
    switch (failureType) {
      case "selector-drift":
        result = repairSelector(testFile, errorOutput);
        break;
      case "intercept-drift":
        result = repairIntercept(testFile, errorOutput);
        break;
      case "timeout":
        result = repairTimeout(testFile, errorOutput);
        break;
      default:
        result = { success: false, diff: "" };
    }

    return {
      testFile,
      failureType,
      strategy: `cypress-${failureType}`,
      success: result.success,
      diff: result.diff || undefined,
    };
  },
};
