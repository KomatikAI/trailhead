import { readFileSync } from "node:fs";

describe("dashboard credential handling", () => {
  const dashboards = [
    readFileSync(new URL("../../cloud/public/dashboard.html", import.meta.url), "utf8"),
    readFileSync(
      new URL("../../site/public/dashboard-embed.html", import.meta.url),
      "utf8",
    ),
  ];

  it("never persists the API key in browser storage", () => {
    for (const dashboard of dashboards) {
      expect(dashboard).not.toContain("th_cloud_key");
      expect(dashboard).not.toMatch(/(?:local|session)Storage\.setItem\([^)]*apiKey/i);
    }
  });

  it("continues to persist the non-sensitive API base URL", () => {
    expect(dashboards[0]).toContain('localStorage.setItem("th_cloud_base", apiBase())');
    expect(dashboards[1]).toContain('sessionStorage.setItem("th_cloud_base", apiBase())');
  });
});
