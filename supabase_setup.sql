-- ══════════════════════════════════════════════════════════
--  PropCMA — Supabase database update
--  Run this in: Supabase → SQL Editor → New query
--  (safe to run even if tables already exist — uses IF NOT EXISTS)
-- ══════════════════════════════════════════════════════════

create table if not exists app_settings (
  id          text primary key default 'singleton',
  api_key     text,
  sheet_id    text,
  sheet_tab   text default 'Sheet1',
  col_map     jsonb default '{}'::jsonb,
  updated_at  timestamptz default now()
);

insert into app_settings (id) values ('singleton')
on conflict (id) do nothing;

create table if not exists properties (
  id            text primary key,
  address       text,
  sale_date     text,
  sale_date_ts  bigint,
  lease_or_sale text,
  auction       boolean default false,
  category      text,
  sqm           numeric,
  price_per_sqm numeric,
  sale_price    numeric,
  purchaser     text,
  vendor        text,
  broker        text,
  created_at    timestamptz default now()
);

-- If the table already existed without the broker column, add it
alter table properties add column if not exists broker text;

alter table app_settings enable row level security;
alter table properties    enable row level security;

drop policy if exists "Allow all for anon" on app_settings;
drop policy if exists "Allow all for anon" on properties;

create policy "Allow all for anon" on app_settings
  for all using (true) with check (true);

create policy "Allow all for anon" on properties
  for all using (true) with check (true);
