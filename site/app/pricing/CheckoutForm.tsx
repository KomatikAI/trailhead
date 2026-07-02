"use client";

import { useState, type FormEvent } from "react";
import type { PaidPlan } from "@/lib/plans";
import { submitCheckout } from "@/lib/checkoutClient";

type Status = "idle" | "loading" | "error" | "rate_limited";

/**
 * Client-side checkout form for a paid plan column. Submit logic (POST to
 * /api/billing/checkout, status mapping) lives in lib/checkoutClient.ts —
 * pure and unit-testable with a mocked fetch, see
 * __tests__/checkoutForm.test.ts. This component owns form state + the
 * browser redirect.
 */
export default function CheckoutForm({ plan, label }: { plan: PaidPlan; label: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    setRetryAfter(null);

    const result = await submitCheckout(plan, email);
    switch (result.status) {
      case "redirect":
        window.location.href = result.url;
        return;
      case "rate_limited":
        setStatus("rate_limited");
        setRetryAfter(result.retryAfterSeconds);
        return;
      case "error":
        setStatus("error");
        setError(result.message);
        return;
    }
  }

  const busy = status === "loading";

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <label
        htmlFor={`email-${plan}`}
        className="muted"
        style={{ fontSize: "0.8125rem" }}
      >
        Work email
      </label>
      <input
        id={`email-${plan}`}
        type="email"
        required
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy}
        style={{
          padding: "9px 12px",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          background: "var(--bg)",
          color: "var(--text)",
          fontSize: "0.9375rem",
        }}
      />
      <button
        type="submit"
        className="btn btn-primary"
        disabled={busy}
        style={{ marginTop: 4 }}
      >
        {busy ? "Redirecting to Stripe…" : label}
      </button>
      {status === "rate_limited" ? (
        <p role="alert" style={{ color: "var(--red)", fontSize: "0.8125rem", margin: 0 }}>
          Too many checkout attempts. Try again{" "}
          {retryAfter ? `in about ${retryAfter}s` : "in a minute"}.
        </p>
      ) : null}
      {status === "error" && error ? (
        <p role="alert" style={{ color: "var(--red)", fontSize: "0.8125rem", margin: 0 }}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
