import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

/**
 * Serves the existing Cloud dashboard (cloud/public/dashboard.html) via a
 * same-origin static route (site/public/dashboard-embed.html) in an iframe.
 * The embedded page is a key-entry shell itself (API Base + API Key inputs,
 * "Load" button) — porting is large (1000+ lines of self-contained vanilla
 * JS driving many /v1 endpoints) so this route serves it directly rather
 * than rewriting it as React. The embedded copy was edited to use
 * sessionStorage instead of localStorage so the key never persists past the
 * tab, and to default its API base to the same-origin /api/cloud mount
 * (Lane B's Hono adapter) instead of a standalone host. Team-gated features
 * (org rollup) render whatever /api/cloud/v1/* returns for the key's plan —
 * there is no client-side plan gating here.
 */
export default function DashboardPage() {
  return (
    <main style={{ height: "calc(100vh - 64px)" }}>
      <iframe
        src="/dashboard-embed.html"
        title="Trailhead Cloud Dashboard"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
      />
    </main>
  );
}
