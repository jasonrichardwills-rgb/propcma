-- ============================================================
-- PropCMA — Deal Sheets schema  (v2 — MSAL-only auth)
--
-- Because PropCMA authenticates with Microsoft/MSAL (not
-- Supabase Auth), all access goes through Vercel serverless
-- functions using the SERVICE ROLE key. RLS is enabled with NO
-- policies, which blocks the anon/authenticated keys entirely —
-- only the API can read or write these tables.
--
-- Users are keyed by their Entra ID (Azure AD) object id (oid),
-- which is stable per user per tenant.
-- ============================================================

-- ---------- 0. Prerequisite: PropCMA properties needs a stable id ----------
-- The existing `properties` (Summary All Years) table has no clean
-- primary key. Add a generated uuid — this doesn't touch any existing
-- columns or rows; every current row gets a fresh id, new rows auto-fill.
alter table properties add column if not exists id uuid default gen_random_uuid();
-- Backfill any rows that predate the default, then enforce uniqueness.
update properties set id = gen_random_uuid() where id is null;
create unique index if not exists properties_id_uidx on properties (id);

-- ---------- 1. Users & roles ----------
create table if not exists app_users (
  oid          text primary key,          -- Entra ID object id (from token 'oid' claim)
  email        text unique,
  display_name text,
  initials     text,                      -- e.g. 'OS' — matches deal sheet convention
  role         text not null check (role in ('broker','accounts','manager')),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ---------- 2. Status enum ----------
do $$ begin
  create type deal_status as enum ('draft','submitted','processing','invoiced','rejected');
exception when duplicate_object then null; end $$;

-- ---------- 3. Main table ----------
create table if not exists deal_sheets (
  id                   uuid primary key default gen_random_uuid(),
  created_by           text not null references app_users (oid),
  property_id          uuid references properties (id),   -- PropCMA link (nullable)

  -- assigned by accounts
  file_no              text,
  deal_no              text,

  status               deal_status not null default 'draft',

  -- denormalised for reporting / market-share analysis
  salesperson          text,
  division             text,
  property_address     text,
  suburb               text,
  city                 text,
  vendor_name          text,
  purchaser_name       text,
  date_of_agreement    date,
  unconditional_date   date,
  sale_price_ex_gst    numeric(14,2),
  total_invoice_ex_gst numeric(14,2),
  wale_years           numeric(6,2),
  deposit_to_trust     boolean not null default false,
  confidential         boolean not null default false,

  form                 jsonb not null,    -- complete form payload, verbatim

  submitted_at         timestamptz,
  processed_by         text references app_users (oid),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists deal_sheets_status_idx  on deal_sheets (status);
create index if not exists deal_sheets_creator_idx on deal_sheets (created_by);
create index if not exists deal_sheets_uncond_idx  on deal_sheets (unconditional_date);

-- ---------- 4. Commission splits (reporting) ----------
create table if not exists deal_sheet_splits (
  id           uuid primary key default gen_random_uuid(),
  deal_id      uuid not null references deal_sheets (id) on delete cascade,
  party_type   text not null check (party_type in ('salesperson','third_party')),
  party_name   text not null,
  split_pct    numeric(6,3) not null check (split_pct > 0 and split_pct <= 100),
  split_amount numeric(14,2) not null
);
create index if not exists splits_deal_idx on deal_sheet_splits (deal_id);

-- ---------- 5. Event log (audit trail) ----------
-- Written explicitly by the API (which knows the acting user's oid).
create table if not exists deal_sheet_events (
  id          bigint generated always as identity primary key,
  deal_id     uuid not null references deal_sheets (id) on delete cascade,
  actor       text references app_users (oid),
  from_status deal_status,
  to_status   deal_status,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists events_deal_idx on deal_sheet_events (deal_id);

-- ---------- 6. updated_at trigger ----------
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists deal_sheets_touch on deal_sheets;
create trigger deal_sheets_touch before update on deal_sheets
  for each row execute function touch_updated_at();

-- ---------- 7. Lock the tables down ----------
-- RLS on, no policies: anon and authenticated keys get nothing.
-- The service-role key (serverless API only) bypasses RLS.
alter table app_users         enable row level security;
alter table deal_sheets       enable row level security;
alter table deal_sheet_splits enable row level security;
alter table deal_sheet_events enable row level security;

revoke all on app_users, deal_sheets, deal_sheet_splits, deal_sheet_events
  from anon, authenticated;

-- ---------- 8. Seed your team ----------
-- Get each person's oid from Entra ID (Users → select user → Object ID),
-- or capture it from their first sign-in via the token's oid claim.
-- insert into app_users (oid, email, display_name, initials, role) values
--   ('00000000-0000-0000-0000-000000000001', 'broker@sicommercial.co.nz',  'Example Broker', 'OS', 'broker'),
--   ('00000000-0000-0000-0000-000000000002', 'accounts@sicommercial.co.nz','Example Accounts', null, 'accounts'),
--   ('00000000-0000-0000-0000-000000000003', 'jason@sicommercial.co.nz',   'Jason', null, 'manager');
