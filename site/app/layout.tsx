import type { Metadata } from "next";
import type { ReactNode } from "react";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://trailhead.komatik.xyz";

export const metadata: Metadata = {
  title: {
    default: "Trailhead — The release gate for the AI-agent era",
    template: "%s · Trailhead",
  },
  description:
    "Trailhead is a release-readiness gate for GitHub PRs: CI-aware risk scoring, production health checks, and agent-governance policies for Claude, Copilot, and Codex PRs — one Release Ready check to merge on.",
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: "Trailhead — The release gate for the AI-agent era",
    description:
      "Risk scoring, CI orchestration, and agent-governance policies for GitHub PRs — free as a GitHub Action, hosted analytics on Trailhead Cloud.",
    url: siteUrl,
    siteName: "Trailhead",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trailhead — The release gate for the AI-agent era",
    description:
      "CI-aware risk scoring and agent-governance policies for GitHub PRs. One Release Ready check to merge on.",
  },
  icons: {
    icon: "/icon.svg",
  },
};

// Shared shell: nav + footer + design tokens. Individual pages (Lane D) stay
// server components where possible so the marketing surface remains static.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteNav />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
