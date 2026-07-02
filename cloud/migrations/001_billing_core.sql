-- 001_billing_core — Trailhead Cloud billing + persistence core.
-- Implements the pinned billing architecture contract (v1, 2026-07-02) DDL EXACTLY.
-- Plain Postgres (pg Pool / DATABASE_URL); nothing Supabase-specific.

create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  github_org text,
  created_at timestamptz not null default now()
);
create table org_settings (
  org_id uuid primary key references orgs(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro','team')),
  seats int not null default 1,
  seats_used int not null default 1,
  sso jsonb,
  updated_at timestamptz not null default now()
);
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  key_hash text not null unique,          -- sha256 hex of the full key; PLAINTEXT IS NEVER STORED
  key_preview text not null,              -- e.g. th_live_ab…yz (maskApiKey)
  label text,
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  plan text not null check (plan in ('pro','team')),
  status text not null,                   -- active|trialing|past_due|canceled|incomplete|unpaid
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table key_claims (                  -- one-time post-checkout key handoff
  checkout_session_id text primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  key_ciphertext text not null,           -- AES-256-GCM under TRAILHEAD_CLAIM_SECRET, NOT plaintext
  claimed_at timestamptz,
  expires_at timestamptz not null         -- now() + 72h
);
create table evaluations (
  org_id uuid not null references orgs(id) on delete cascade,
  id text not null,
  repo_id text not null,
  pr_number int,
  gate_decision text,
  risk_score numeric,
  health_score numeric,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  month_key text not null,                -- 'YYYY-MM' UTC
  primary key (org_id, id)
);
create index on evaluations (org_id, repo_id, received_at desc);
create index on evaluations (org_id, month_key);
create table idempotency_keys (
  org_id uuid not null,
  idem_key text not null,
  evaluation_id text not null,
  primary key (org_id, idem_key)
);
create table deploy_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create table detector_feedback (
  id bigint generated always as identity primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  record jsonb not null,
  created_at timestamptz not null default now()
);
create table detector_downgrades (
  org_id uuid not null references orgs(id) on delete cascade,
  detector text not null,
  record jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (org_id, detector)
);
create table usage_counters (
  org_id uuid not null references orgs(id) on delete cascade,
  month_key text not null,
  evals int not null default 0,
  primary key (org_id, month_key)
);
create table stripe_webhook_events (      -- webhook idempotency ledger (komatik lesson)
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now(),
  payload jsonb not null
);
