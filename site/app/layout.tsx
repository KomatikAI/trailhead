import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Trailhead Cloud",
  description:
    "Release readiness gate for GitHub PRs — hosted evaluation store, dashboards, and org billing.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://trailhead.komatik.xyz",
  ),
};

// Minimal, unopinionated shell. Lane D owns marketing/pricing/welcome/dashboard.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
