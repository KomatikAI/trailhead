"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { resolveClaimState, type ClaimState } from "@/lib/claimClient";

// State-transition logic lives in lib/claimClient.ts (pure, unit-testable
// with a mocked fetch — see __tests__/claimState.test.ts). This component is
// just the wiring + presentation.
const WORKFLOW_SNIPPET = `- uses: KomatikAI/trailhead@v4
  with:
    gate-mode: release-ready
    trailhead-api-key: \${{ secrets.TRAILHEAD_API_KEY }}`;

export default function ClaimClient() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [state, setState] = useState<ClaimState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    resolveClaimState(sessionId).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div className="wrap" style={{ padding: "64px 24px 96px", maxWidth: 640 }}>
      {render(state)}
    </div>
  );
}

function render(state: ClaimState) {
  switch (state.status) {
    case "loading":
      return <p className="muted">Loading your API key…</p>;

    case "missing":
      return (
        <ErrorPanel title="No checkout session found">
          This page expects a <code>?session_id=</code> query parameter from a Stripe
          Checkout redirect. If you just paid, check your email receipt for the correct
          link, or <a href="mailto:support@komatik.ai">contact support</a>.
        </ErrorPanel>
      );

    case "not_found":
      return (
        <ErrorPanel title="We couldn't find that checkout session">
          Double-check the link, or{" "}
          <a href="mailto:support@komatik.ai">contact support</a> with your receipt email.
        </ErrorPanel>
      );

    case "already_claimed":
      return (
        <ErrorPanel title="This key was already claimed">
          {state.message} Lost the key?{" "}
          <a href="mailto:support@komatik.ai">Contact support</a> to rotate it, or open
          the billing portal from your <a href="/dashboard">dashboard</a>.
        </ErrorPanel>
      );

    case "expired":
      return (
        <ErrorPanel title="This claim link has expired">
          {state.message} Claim links are valid for 72 hours after checkout.{" "}
          <a href="mailto:support@komatik.ai">Contact support</a> to issue a replacement
          key.
        </ErrorPanel>
      );

    case "rate_limited":
      return (
        <ErrorPanel title="Too many attempts">
          Please wait a minute and reload this page.
        </ErrorPanel>
      );

    case "error":
      return (
        <ErrorPanel title="Something went wrong">
          {state.message} <a href="mailto:support@komatik.ai">Contact support</a> if this
          persists.
        </ErrorPanel>
      );

    case "revealed":
      return <RevealPanel apiKey={state.apiKey} message={state.message} />;
  }
}

function ErrorPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h1 style={{ fontSize: "1.375rem", margin: "0 0 12px" }}>{title}</h1>
      <p className="muted" style={{ margin: 0, fontSize: "0.9375rem" }}>
        {children}
      </p>
    </div>
  );
}

function RevealPanel({ apiKey, message }: { apiKey: string; message: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail in insecure contexts — the key is still selectable text.
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: "1.75rem", margin: "0 0 8px" }}>You&rsquo;re in 🎉</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {message}
      </p>

      <div
        role="alert"
        style={{
          border: "1px solid var(--red)",
          borderRadius: "var(--radius)",
          padding: "12px 16px",
          background: "color-mix(in srgb, var(--red) 10%, transparent)",
          fontSize: "0.875rem",
          fontWeight: 600,
          margin: "20px 0",
        }}
      >
        This key is shown once. It will not be shown again — copy it now and store it as a
        secret.
      </div>

      <div
        className="card mono"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          fontSize: "0.9375rem",
          wordBreak: "break-all",
        }}
      >
        <span>{apiKey}</span>
        <button
          type="button"
          className="btn btn-primary"
          onClick={copy}
          style={{ flexShrink: 0 }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <h2 style={{ fontSize: "1.125rem", marginTop: 36 }}>Next steps</h2>
      <ol style={{ paddingLeft: 20, fontSize: "0.9375rem" }}>
        <li style={{ marginBottom: 12 }}>
          Add it as a repo or org secret named <code>TRAILHEAD_API_KEY</code> — GitHub
          &rarr; Settings &rarr; Secrets and variables &rarr; Actions.
        </li>
        <li style={{ marginBottom: 12 }}>
          Reference it in your workflow so Trailhead auto-configures the Cloud store:
          <div
            className="card mono"
            style={{ marginTop: 8, fontSize: "0.8125rem", overflowX: "auto" }}
          >
            <pre style={{ margin: 0, whiteSpace: "pre" }}>{WORKFLOW_SNIPPET}</pre>
          </div>
        </li>
        <li>
          Open your <a href="/dashboard">dashboard</a> to watch evaluations land after the
          next PR.
        </li>
      </ol>
    </div>
  );
}
