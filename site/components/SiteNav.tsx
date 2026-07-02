import Link from "next/link";

const REPO_URL = "https://github.com/KomatikAI/trailhead";

/**
 * Server-rendered nav — no client JS. Links to docs (GitHub), pricing, the
 * dashboard, and status. Kept intentionally small; the landing page stays
 * static.
 */
export default function SiteNav() {
  return (
    <header
      style={{
        borderBottom: "1px solid var(--border)",
        position: "sticky",
        top: 0,
        background: "var(--bg)",
        zIndex: 10,
      }}
    >
      <nav
        className="wrap"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 64,
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 700,
            fontSize: "1.0625rem",
            textDecoration: "none",
          }}
        >
          <TrailheadMark size={22} />
          Trailhead
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: "0.9375rem" }}>
          <Link href={`${REPO_URL}#documentation`} style={{ textDecoration: "none" }}>
            Docs
          </Link>
          <Link href="/pricing" style={{ textDecoration: "none" }}>
            Pricing
          </Link>
          <Link href="/dashboard" style={{ textDecoration: "none" }}>
            Dashboard
          </Link>
          <Link
            href="https://github.com/KomatikAI/trailhead/actions/workflows/ci.yml"
            style={{ textDecoration: "none" }}
          >
            Status
          </Link>
          <Link href="https://github.com/marketplace/actions/trailhead" className="btn btn-primary">
            Install
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function TrailheadMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M3 20L9.5 6L13 13.5L15.5 9L21 20"
        stroke="var(--accent)"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="6" r="1.6" fill="var(--accent)" />
    </svg>
  );
}
