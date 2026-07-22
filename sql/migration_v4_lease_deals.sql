-- ============================================================
-- Migration v4 — leasing deal sheets
--
-- Sales and leases share the deal_sheets table. Everything the
-- system does around a deal (queue, processing, invoicing, audit
-- trail, attachments, splits, numbering, permissions) is identical
-- for both, so only the form payload differs — and that already
-- lives in the `form` JSONB column.
--
-- Safe to re-run.
-- ============================================================

-- ---------- 1. Deal type ----------
alter table deal_sheets
  add column if not exists deal_type text not null default 'sale';

alter table deal_sheets drop constraint if exists deal_sheets_deal_type_check;
alter table deal_sheets add constraint deal_sheets_deal_type_check
  check (deal_type in ('sale', 'lease'));

-- Existing rows are all sales.
update deal_sheets set deal_type = 'sale' where deal_type is null;

create index if not exists deal_sheets_type_status_idx
  on deal_sheets (deal_type, status, updated_at desc);

-- ---------- 2. Lease-specific denormalised columns ----------
-- Kept alongside the sales columns rather than in a separate table:
-- the queue and lists read these directly without unpacking JSON.
--
--   vendor_name    is reused for the Lessor
--   purchaser_name is reused for the Lessee
-- (same role in the workflow; no need to duplicate the columns)

alter table deal_sheets
  add column if not exists lease_term_years   numeric,
  add column if not exists annual_gross_rent  numeric,
  add column if not exists annual_net_rent    numeric;

comment on column deal_sheets.annual_gross_rent is
  'Total gross annual rental (excl GST). Written to properties.sale_price '
  'for lease comparables so leasing rates compare on an annual basis.';

-- ---------- Verify ----------
-- select deal_type, status, count(*) from deal_sheets group by 1,2 order by 1,2;
