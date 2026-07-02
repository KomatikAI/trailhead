import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer style={{ borderTop: "1px solid var(--border)", marginTop: 96 }}>
      <div
        className="wrap muted"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          justifyContent: "space-between",
          padding: "28px 24px",
          fontSize: "0.875rem",
        }}
      >
        <span>&copy; {new Date().getFullYear()} Komatik. Trailhead is MIT-licensed.</span>
        <div style={{ display: "flex", gap: 20 }}>
          <Link
            href="https://github.com/KomatikAI/trailhead"
            style={{ textDecoration: "none" }}
          >
            GitHub
          </Link>
          <Link
            href="https://github.com/KomatikAI/trailhead#documentation"
            style={{ textDecoration: "none" }}
          >
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
        </div>
      </div>
    </footer>
  );
}
