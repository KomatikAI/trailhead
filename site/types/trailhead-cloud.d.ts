/**
 * Ambient type surface for the sibling `cloud/` workspace package
 * (imported as `trailhead-cloud`, wired via `file:../cloud` +
 * `transpilePackages` in next.config.ts).
 *
 * ── TODO(merge, Lane A: feat/cloud-pg-store) ──────────────────────────────
 * Lane A owns cloud/ and is ADDING, in parallel:
 *   - an async `CloudStore` (methods return Promises)
 *   - `createPgStore(config)` backed by `pg` Pool + DATABASE_URL
 *   - the billing store methods declared in `BillingStore` below
 * Until that branch merges into this one, these declarations are the contract
 * Lane B codes against. On merge, DELETE this file and rely on the real cloud
 * exports (add a proper `exports` map + built types to cloud/package.json).
 * The method shapes here mirror TRAILHEAD-BILLING-CONTRACT.md §"Billing flows"
 * and the DDL exactly.
 */
declare module "trailhead-cloud" {
  export type PlanTier = "free" | "pro" | "team";
  export type PaidPlan = "pro" | "team";

  /** Opaque handle for the /v1 Cloud API store surface (see cloud/src/types.ts). */
  export interface CloudStore {
    getOrgForKey(apiKey: string): unknown;
  }

  export interface SubscriptionRow {
    orgId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    plan: PaidPlan;
    status: string;
    currentPeriodEnd: string | null;
  }

  export interface CreateOrgWithSubscriptionInput {
    /** Org display name — derived from checkout email domain or a custom field. */
    orgName: string;
    plan: PaidPlan;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    status: string;
    currentPeriodEnd: string | null;
    keyLabel?: string;
  }

  export interface CreateOrgResult {
    orgId: string;
    /** Plaintext api key — returned ONCE; caller encrypts into a key_claim. */
    apiKeySecret: string;
    keyPreview: string;
  }

  /**
   * Stripe-truth shape for reconcile repair. No orgId — the store resolves the
   * org by stripe_customer_id (creating a minimal org if the webhook was lost).
   */
  export interface UpsertSubscriptionInput {
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    plan: PaidPlan;
    status: string;
    currentPeriodEnd: string | null;
    orgName?: string;
  }

  /**
   * The billing-facing store surface. Lane A implements this on both the
   * Postgres store (createPgStore) and the in-memory store (tests/dev).
   * All methods are async to match Lane A's async CloudStore conversion.
   */
  export interface BillingStore extends CloudStore {
    /**
     * Webhook idempotency ledger — insert-first into stripe_webhook_events.
     * Returns `{ firstSeen: true }` only for a never-before-seen event id;
     * a duplicate event returns `{ firstSeen: false }` and MUST be skipped.
     */
    recordStripeEvent(input: {
      eventId: string;
      eventType: string;
      payload: unknown;
    }): Promise<{ firstSeen: boolean }>;

    /**
     * checkout.session.completed handler — in ONE transaction: create org,
     * org_settings.plan, subscriptions row, and issue the first api_key
     * (key_hash + key_preview stored; plaintext returned once to the caller).
     */
    createOrgWithSubscription(
      input: CreateOrgWithSubscriptionInput,
    ): Promise<CreateOrgResult>;

    /** Persist the one-time key handoff row (AES-256-GCM ciphertext, +72h expiry). */
    createKeyClaim(input: {
      checkoutSessionId: string;
      orgId: string;
      keyCiphertext: string;
      expiresAt: string;
    }): Promise<void>;

    /**
     * Atomic one-time reveal: if the claim is unclaimed AND unexpired, stamp
     * claimed_at and return the ciphertext; otherwise return null. Must be a
     * single UPDATE ... WHERE claimed_at IS NULL ... RETURNING (no read-modify-write).
     */
    claimKey(checkoutSessionId: string): Promise<{ keyCiphertext: string } | null>;

    /** Non-mutating status for a claim (for friendly UI messaging). */
    getKeyClaimStatus(
      checkoutSessionId: string,
    ): Promise<{ exists: boolean; claimed: boolean; expired: boolean }>;

    /**
     * customer.subscription.updated/deleted — sync plan/status/current_period_end
     * on the subscriptions row keyed by stripe_subscription_id, AND suspend the
     * org's api_keys when status ∈ {past_due,unpaid,canceled,incomplete_expired},
     * or unsuspend when back to active/trialing. Returns the affected orgId.
     */
    updateSubscriptionByStripeId(
      stripeSubscriptionId: string,
      patch: {
        plan?: PaidPlan;
        status: string;
        currentPeriodEnd?: string | null;
      },
    ): Promise<{ orgId: string } | null>;

    /** Portal: resolve a Bearer api key to its org + Stripe customer id. */
    getStripeCustomerIdForKey(
      apiKey: string,
    ): Promise<{ orgId: string; stripeCustomerId: string } | null>;

    /** Reconcile: all subscription rows we believe we have. */
    listSubscriptions(): Promise<SubscriptionRow[]>;

    getSubscriptionByStripeId(
      stripeSubscriptionId: string,
    ): Promise<SubscriptionRow | null>;

    /** Reconcile repair: create/refresh a subscription row from Stripe truth. */
    upsertSubscriptionFromStripe(input: UpsertSubscriptionInput): Promise<{ orgId: string }>;

    /** Reconcile: unrevoked, unsuspended key count for an org. */
    countActiveKeys(orgId: string): Promise<number>;

    /** Reconcile: delete expired unclaimed key_claims. Returns rows purged. */
    purgeExpiredClaims(): Promise<number>;
  }

  export interface CloudAppOptions {
    store?: CloudStore | BillingStore;
    seedKeys?: unknown[];
  }

  export interface HonoLike {
    fetch(request: Request, ...rest: unknown[]): Response | Promise<Response>;
  }

  export function createCloudApp(options?: CloudAppOptions): HonoLike;
  export function createMemoryStore(seedKeys?: unknown[]): BillingStore;
  export function parseSeedKeys(raw: string | undefined): unknown[];

  /** Lane A (feat/cloud-pg-store): Postgres-backed async store over DATABASE_URL. */
  export function createPgStore(config: {
    connectionString: string;
    seedKeys?: unknown[];
  }): Promise<BillingStore>;
}
