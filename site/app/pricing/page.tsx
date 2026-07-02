import type { Metadata } from "next";
import Link from "next/link";
import { PLAN_CATALOG as PLANS } from "@/lib/planCatalog";
import CheckoutForm from "./CheckoutForm";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Trailhead is free as a GitHub Action. Trailhead Cloud adds hosted evaluation storage, dashboards, and agent-governance policy: Pro $39/mo, Team $399/mo.",
};

const MARKETPLACE_URL = "https://github.com/marketplace/actions/trailhead";

export default function PricingPage() {
  return (
    <main className="wrap" style={{ padding: "64px 24px 96px" }}>
      <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto 48px" }}>
        <h1 style={{ fontSize: "2.25rem", margin: "0 0 12px", letterSpacing: "-0.01em" }}>Pricing</h1>
        <p className="muted" style={{ fontSize: "1.0625rem" }}>
          The gate is free. Cloud is for teams that need the history, the dashboard, and org-wide
          agent-governance policy.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 20,
          alignItems: "stretch",
        }}
      >
        <PlanCard
          name="Free"
          price="$0"
          tagline="Risk-only gate, runs entirely in your CI"
          features={[
            "17-factor risk score, unlimited PRs",
            "CI-aware release-ready gate mode",
            "Security & supply-chain risk factors",
            "No API key, no account, no store",
          ]}
          cta={
            <Link href={MARKETPLACE_URL} className="btn btn-secondary" style={{ width: "100%" }}>
              Install from Marketplace
            </Link>
          }
        />
        <PlanCard
          name="Pro"
          price="$39"
          priceSuffix="/mo"
          tagline={`${PLANS.pro.evaluationsPerMonth.toLocaleString()} evals/mo, hosted history`}
          highlight
          features={[
            "Everything in Free",
            `${PLANS.pro.evaluationsPerMonth.toLocaleString()} stored evaluations / month`,
            "Hosted trend dashboard",
            `Up to ${PLANS.pro.seatsIncluded} seats included`,
            "API keys for CI ingest",
          ]}
          cta={<CheckoutForm plan="pro" label="Start Pro" />}
        />
        <PlanCard
          name="Team"
          price="$399"
          priceSuffix="/mo"
          tagline="Agent governance for orgs shipping AI-authored PRs"
          features={[
            "Everything in Pro",
            `${PLANS.team.evaluationsPerMonth.toLocaleString()} stored evaluations / month`,
            "Org-wide rollup dashboard across repos",
            "SSO",
            "Agent-governance policies: provenance classification, sensitive-path gates, session-burst detection, trust profiles, escalation SLAs",
            `Up to ${PLANS.team.seatsIncluded} seats included`,
          ]}
          cta={<CheckoutForm plan="team" label="Start Team" />}
        />
      </div>

      <QuotaNote />
      <Faq />
    </main>
  );
}

function PlanCard({
  name,
  price,
  priceSuffix,
  tagline,
  features,
  cta,
  highlight,
}: {
  name: string;
  price: string;
  priceSuffix?: string;
  tagline: string;
  features: string[];
  cta: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        borderColor: highlight ? "var(--accent)" : "var(--border)",
        borderWidth: highlight ? 2 : 1,
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: "1.25rem" }}>{name}</h2>
          {highlight ? <span className="badge">Most popular</span> : null}
        </div>
        <div style={{ margin: "10px 0 4px" }}>
          <span style={{ fontSize: "2rem", fontWeight: 800 }}>{price}</span>
          {priceSuffix ? <span className="muted">{priceSuffix}</span> : null}
        </div>
        <p className="muted" style={{ margin: 0, fontSize: "0.875rem" }}>
          {tagline}
        </p>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        {features.map((f) => (
          <li key={f} style={{ display: "flex", gap: 8, fontSize: "0.875rem" }}>
            <span aria-hidden="true" style={{ color: "var(--green)" }}>
              ✓
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div>{cta}</div>
    </div>
  );
}

function QuotaNote() {
  return (
    <div className="card" style={{ marginTop: 40 }}>
      <h2 style={{ fontSize: "1.0625rem", margin: "0 0 8px" }}>How quota works</h2>
      <p className="muted" style={{ margin: 0, fontSize: "0.9375rem" }}>
        Going over your monthly evaluation limit does not stop your gate. Evaluations keep being
        stored and the response carries an upsell header until usage reaches <strong>3&times;</strong>{" "}
        your plan limit — at that point ingest is hard-capped (402/429) as an abuse backstop until
        the next billing cycle or an upgrade. You will see the quota warning in your CI logs well
        before that happens.
      </p>
    </div>
  );
}

function Faq() {
  const items: [string, string][] = [
    [
      "What counts as an eval?",
      "One stored evaluation per PR check run that Trailhead's gate posts to your Cloud store — i.e. one per pull request update that runs the gate, not per risk factor or per API call.",
    ],
    [
      "What happens if I go over my quota?",
      "Nothing breaks. Over-quota evaluations are still stored and your CI run still gets a decision; the response includes an upsell header and message until you hit 3x your plan limit, which is a hard cap.",
    ],
    [
      "Can I self-host the evaluation store instead of using Cloud?",
      "Yes. Bring-your-own-store is supported via the evaluation-store-url and evaluation-store-secret inputs on the Action — Cloud is optional hosted storage, not a requirement to use Trailhead.",
    ],
    [
      "How do API keys work?",
      "A Cloud subscription issues one API key at checkout, shown once on the /welcome page. Add it as the TRAILHEAD_API_KEY secret in your repo or org and pass it to the Action via the trailhead-api-key input — it auto-configures the store URL and auth.",
    ],
    [
      "How do I cancel or change plans?",
      "Billing is managed entirely through the Stripe customer portal — open it from your dashboard. There's no separate account system to manage; possession of your API key is what authenticates billing-portal access.",
    ],
    [
      "Do I need Trailhead Cloud to use the risk gate?",
      "No. The GitHub Action's risk-only and release-ready gate modes run entirely in your CI with no API key. Cloud only adds hosted history, dashboards, org rollup, and SSO.",
    ],
  ];
  return (
    <div style={{ marginTop: 56 }}>
      <h2 style={{ fontSize: "1.5rem", marginBottom: 20 }}>Frequently asked questions</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map(([q, a]) => (
          <details key={q} className="card">
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>{q}</summary>
            <p className="muted" style={{ margin: "10px 0 0", fontSize: "0.9375rem" }}>
              {a}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}
