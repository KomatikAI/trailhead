import Link from "next/link";
import { TrailheadMark } from "@/components/SiteNav";

const MARKETPLACE_URL = "https://github.com/marketplace/actions/trailhead";
const REPO_URL = "https://github.com/KomatikAI/trailhead";

// Fully static server component — no client JS on the landing page.
export default function HomePage() {
  return (
    <main>
      <Hero />
      <Proof />
      <HowItWorks />
      <AgentGovernance />
      <Dogfood />
      <PlanTeaser />
      <FinalCta />
    </main>
  );
}

function Hero() {
  return (
    <section className="wrap" style={{ padding: "88px 24px 64px", textAlign: "center" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: "0.8125rem",
          fontWeight: 600,
          color: "var(--accent)",
          background: "var(--bg-raised)",
          border: "1px solid var(--border)",
          borderRadius: 999,
          padding: "5px 14px",
          marginBottom: 24,
        }}
      >
        <TrailheadMark size={14} /> v4 &middot; 17-factor risk engine &middot; CI-aware
      </div>
      <h1
        style={{
          fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
          lineHeight: 1.08,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          margin: "0 0 20px",
        }}
      >
        The release gate for the
        <br />
        AI-agent era.
      </h1>
      <p
        className="muted"
        style={{
          fontSize: "1.1875rem",
          maxWidth: 640,
          margin: "0 auto 36px",
          lineHeight: 1.6,
        }}
      >
        Trailhead waits for your CI, scores every pull request across 17 weighted risk
        factors, checks production health, and gates AI-authored PRs before they hit main
        — one <strong>Release&nbsp;Ready</strong> check, one merge rule.
      </p>
      <div
        style={{
          display: "flex",
          gap: 12,
          justifyContent: "center",
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <Link
          href={MARKETPLACE_URL}
          className="btn btn-primary"
          style={{ padding: "12px 22px" }}
        >
          Install from GitHub Marketplace
        </Link>
        <Link
          href="/pricing"
          className="btn btn-secondary"
          style={{ padding: "12px 22px" }}
        >
          View Trailhead Cloud pricing
        </Link>
      </div>
      <p className="muted" style={{ fontSize: "0.8125rem" }}>
        Free as a GitHub Action &middot; no API key required to start
      </p>
      <CodeBlock />
    </section>
  );
}

function CodeBlock() {
  const snippet = `- uses: KomatikAI/trailhead@v4
  with:
    gate-mode: release-ready
    wait-for-checks: "true"
    risk-threshold: "70"`;
  return (
    <div
      className="card mono"
      style={{
        textAlign: "left",
        maxWidth: 560,
        margin: "40px auto 0",
        fontSize: "0.8125rem",
        overflowX: "auto",
      }}
    >
      <pre style={{ margin: 0, whiteSpace: "pre" }}>{snippet}</pre>
    </div>
  );
}

function Proof() {
  const stats: [string, string][] = [
    ["17", "weighted risk factors"],
    ["1", "merge check — Release Ready"],
    ["3", "gate modes: release-ready, advisory, risk-only"],
    ["0", "secrets required for the free Action"],
  ];
  return (
    <section
      style={{
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        className="wrap"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 24,
          padding: "36px 24px",
        }}
      >
        {stats.map(([value, label]) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "1.875rem", fontWeight: 800 }}>{value}</div>
            <div className="muted" style={{ fontSize: "0.875rem" }}>
              {label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps: [string, string][] = [
    [
      "Install the Action",
      "Add one workflow step. Trailhead reads .trailhead.yml, waits for your required CI checks, and posts a single composite check on every pull request.",
    ],
    [
      "Score risk, CI, and health",
      "17 weighted factors — code churn, security alerts, supply-chain changes, sensitive files, CI integrity, deploy history — roll up into a 0-100 risk score, plus a production health probe.",
    ],
    [
      "Get one merge decision",
      'allow, warn, or block. "Trailhead — Release Ready" is the one check your branch protection rule requires, so there\'s nothing else to reconcile across CI and risk.',
    ],
  ];
  return (
    <section className="wrap" style={{ padding: "72px 24px" }}>
      <SectionHeading
        eyebrow="How it works"
        title="Three steps from PR open to merge decision"
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
          marginTop: 40,
        }}
      >
        {steps.map(([title, body], i) => (
          <div key={title} className="card">
            <div
              className="mono"
              style={{
                color: "var(--accent)",
                fontWeight: 700,
                marginBottom: 12,
                fontSize: "0.875rem",
              }}
            >
              STEP {i + 1}
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: "1.0625rem" }}>{title}</h3>
            <p className="muted" style={{ margin: 0, fontSize: "0.9375rem" }}>
              {body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function AgentGovernance() {
  const findings: [string, string][] = [
    [
      "Provenance classification",
      "Every PR is labeled human, dependabot, copilot, codex, claude, custom-bot, or unknown.",
    ],
    [
      "Agent-policy findings",
      "Sensitive-path gates, required-approval counts, and code-owner review for agent-authored PRs.",
    ],
    [
      "Session-burst detection",
      "Flags correlated bursts of agent commits inside a time window — a signature of runaway automation.",
    ],
    [
      "Trust profiles & SLAs",
      "Per-repo strictness (baseline, elevated, strict) plus escalation status and acknowledge/resolve SLAs.",
    ],
  ];
  return (
    <section
      style={{
        background: "var(--bg-raised)",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="wrap" style={{ padding: "72px 24px" }}>
        <SectionHeading
          eyebrow="Agent governance"
          title="Gate the PRs your agents open, not just the ones your team writes"
          body="Copilot, Codex, and Claude now open pull requests directly. Trailhead treats agent-authored code as a distinct risk class instead of scoring it the same as a human diff — the gap most CI tooling still ignores in 2026."
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 20,
            marginTop: 40,
          }}
        >
          {findings.map(([title, body]) => (
            <div key={title} className="card" style={{ background: "var(--bg)" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>{title}</h3>
              <p className="muted" style={{ margin: 0, fontSize: "0.9375rem" }}>
                {body}
              </p>
            </div>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 28, fontSize: "0.875rem" }}>
          Governance policies (approval requirements, sensitive-path gates, strict
          unknown-provenance handling) are configured per-repo in{" "}
          <code>.trailhead.yml</code> — see the{" "}
          <Link href={`${REPO_URL}#agent-governance-optional`}>
            agent governance docs
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

function Dogfood() {
  return (
    <section className="wrap" style={{ padding: "72px 24px" }}>
      <div
        className="card"
        style={{
          display: "flex",
          gap: 28,
          alignItems: "center",
          flexWrap: "wrap",
          padding: 36,
        }}
      >
        <div style={{ flex: "1 1 320px" }}>
          <div className="badge" style={{ marginBottom: 14 }}>
            Dogfooded internally
          </div>
          <h2 style={{ fontSize: "1.5rem", margin: "0 0 12px" }}>
            We run Trailhead on our own agent fleet
          </h2>
          <p
            className="muted"
            style={{ margin: 0, fontSize: "0.9375rem", maxWidth: 560 }}
          >
            Komatik gates every pull request its own AI agents open against{" "}
            <code>KomatikAI/agents</code> with the same submission engine, trust scoring,
            and risk factors shipped here — provenance classification, sensitive-path
            policies, and Gate 1 submission checks, running on real, autonomous,
            multi-agent PR traffic every day.
          </p>
        </div>
      </div>
    </section>
  );
}

function PlanTeaser() {
  return (
    <section style={{ borderTop: "1px solid var(--border)" }}>
      <div className="wrap" style={{ padding: "72px 24px", textAlign: "center" }}>
        <SectionHeading
          eyebrow="Pricing"
          title="Free to gate. Paid to remember."
          center
        />
        <p className="muted" style={{ maxWidth: 560, margin: "16px auto 32px" }}>
          The Action is free forever — no API key, no store. Trailhead Cloud adds hosted
          evaluation history, dashboards, and org-wide agent-governance policy for teams
          that need the record.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            maxWidth: 760,
            margin: "0 auto 32px",
          }}
        >
          {[
            ["Free", "Risk-only gate, local", "$0"],
            ["Pro", "5,000 evals/mo + dashboard", "$39/mo"],
            ["Team", "50,000 evals/mo + org rollup + SSO", "$399/mo"],
          ].map(([name, desc, price]) => (
            <div key={name} className="card" style={{ textAlign: "left" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <strong>{name}</strong>
                <span className="mono muted">{price}</span>
              </div>
              <p className="muted" style={{ fontSize: "0.875rem", margin: "8px 0 0" }}>
                {desc}
              </p>
            </div>
          ))}
        </div>
        <Link
          href="/pricing"
          className="btn btn-primary"
          style={{ padding: "12px 22px" }}
        >
          See full plan details
        </Link>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section
      style={{ background: "var(--bg-raised)", borderTop: "1px solid var(--border)" }}
    >
      <div className="wrap" style={{ padding: "72px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: "1.875rem", margin: "0 0 12px" }}>
          Ship your next PR through a real gate
        </h2>
        <p className="muted" style={{ margin: "0 0 28px" }}>
          Add the Action in a few minutes. Add Cloud when you need the history.
        </p>
        <div
          style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}
        >
          <Link
            href={MARKETPLACE_URL}
            className="btn btn-primary"
            style={{ padding: "12px 22px" }}
          >
            Install from GitHub Marketplace
          </Link>
          <Link
            href={REPO_URL}
            className="btn btn-secondary"
            style={{ padding: "12px 22px" }}
          >
            View source on GitHub
          </Link>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  center,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  center?: boolean;
}) {
  return (
    <div
      style={{
        textAlign: center ? "center" : "left",
        maxWidth: 720,
        margin: center ? "0 auto" : 0,
      }}
    >
      <div
        className="mono muted"
        style={{
          fontSize: "0.8125rem",
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {eyebrow}
      </div>
      <h2 style={{ fontSize: "1.75rem", margin: "8px 0 0", letterSpacing: "-0.01em" }}>
        {title}
      </h2>
      {body ? (
        <p className="muted" style={{ marginTop: 12, fontSize: "0.9375rem" }}>
          {body}
        </p>
      ) : null}
    </div>
  );
}
