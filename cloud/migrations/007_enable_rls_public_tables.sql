-- 007_enable_rls_public_tables — enable Row Level Security on the hosted
-- contract schema's public tables.
--
-- Closes Supabase's Security Advisor finding `rls_disabled_in_public` for the
-- trailhead-cloud project. These tables are reached only by the service's own
-- plain `pg` connection (cloud/src/pg-store.ts, cloud/src/migrate.ts over
-- DATABASE_URL); that role owns the tables and bypasses RLS, so enabling RLS
-- with zero policies is a no-op for the service and simply removes the
-- auto-generated API surface for the Supabase API roles, which this service
-- does not use (auth model v1 is possession-of-key over the cloud API).
--
-- Deliberately no CREATE POLICY and no FORCE ROW LEVEL SECURITY (FORCE would
-- apply RLS to the owning role too). No BEGIN/COMMIT: the runner in
-- cloud/src/migrate.ts wraps each file in a transaction and records it in
-- schema_migrations. Idempotent: ENABLE on an already-enabled table is a no-op.
--
-- Rollback: `ALTER TABLE public.<t> DISABLE ROW LEVEL SECURITY;` per table,
-- then `DELETE FROM schema_migrations WHERE version = '007_enable_rls_public_tables'`.

-- Billing / org core (001_billing_core.sql)
ALTER TABLE public.orgs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_claims            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deploy_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detector_feedback     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detector_downgrades   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_counters        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Migration ledger, created at runtime by cloud/src/migrate.ts and touched
-- only by the runner, whose role owns it.
ALTER TABLE public.schema_migrations     ENABLE ROW LEVEL SECURITY;
