/**
 * Trailhead Cloud upsell + quota/billing surfacing for the check summary footer.
 *
 * One line, always at the end of the summary, never affects the gate decision.
 * Suppressible via the `disable-cloud-upsell` action input.
 */

export const CLOUD_MARKETING_URL = "https://trailhead.komatik.xyz";
export const CLOUD_PRICING_URL = "https://trailhead.komatik.xyz/pricing";

export type CloudUpsellCampaign = "cloud-upsell" | "quota-upsell" | "suspended-upsell";

function withUtm(url: string, campaign: CloudUpsellCampaign): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", "action");
  u.searchParams.set("utm_medium", "check-summary");
  u.searchParams.set("utm_campaign", campaign);
  return u.toString();
}

export interface CloudFooterOptions {
  /** Whether a trailhead-api-key was configured for this run (cloud mode). */
  hasCloudKey: boolean;
  /** `disable-cloud-upsell: true` input. */
  disableUpsell: boolean;
  /** Cloud API responded 200 with `X-Trailhead-Quota-Exceeded: true` (still stored). */
  quotaExceeded?: boolean;
  /** Cloud API responded 402 — org suspended, evaluation NOT stored. */
  suspended?: boolean;
  /** Cloud API responded 429 — hard usage cap, evaluation NOT stored. */
  hardCapped?: boolean;
}

/**
 * Build the single footer line to append to the check summary, or null if
 * nothing should be shown (has a key, under quota, no billing issue, or
 * the user opted out).
 *
 * Precedence: suspended > hard-capped > quota-exceeded > no-key upsell.
 * These are mutually exclusive in practice (all require a configured key
 * except the no-key case), but the order guards against ambiguous input.
 */
export function buildCloudFooterLine(options: CloudFooterOptions): string | null {
  if (options.disableUpsell) return null;

  if (options.suspended) {
    const link = withUtm(CLOUD_PRICING_URL, "suspended-upsell");
    return (
      `> 🚫 **Evaluation not stored — your Trailhead Cloud plan is suspended.** ` +
      `Reactivate to resume history & trends → ${link}`
    );
  }

  if (options.hardCapped) {
    const link = withUtm(CLOUD_PRICING_URL, "quota-upsell");
    return (
      `> 🚫 **Evaluation not stored — you're over this month's hard usage cap.** ` +
      `Upgrade your plan to keep full history → ${link}`
    );
  }

  if (options.quotaExceeded) {
    const link = withUtm(CLOUD_PRICING_URL, "quota-upsell");
    return (
      `> ⚠️ Over your plan's monthly evaluations — history still stored this quarter; ` +
      `upgrade at ${link}`
    );
  }

  if (!options.hasCloudKey) {
    const link = withUtm(CLOUD_MARKETING_URL, "cloud-upsell");
    return (
      `📊 This evaluation wasn't persisted — track trends, DORA metrics & agent-governance ` +
      `across your org with Trailhead Cloud → ${link}`
    );
  }

  return null;
}
