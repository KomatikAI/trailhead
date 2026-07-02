import type { Metadata } from "next";
import { Suspense } from "react";
import ClaimClient from "./ClaimClient";

export const metadata: Metadata = {
  title: "Claim your API key",
  robots: { index: false, follow: false },
};

// Server wrapper only — the state machine needs useSearchParams, so the
// actual UI is a client component wrapped in Suspense (Next.js requirement
// for useSearchParams in an App Router page).
export default function WelcomePage() {
  return (
    <Suspense
      fallback={
        <div className="wrap" style={{ padding: "64px 24px" }}>
          Loading…
        </div>
      }
    >
      <ClaimClient />
    </Suspense>
  );
}
