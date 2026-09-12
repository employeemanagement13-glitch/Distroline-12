-- ============================================================================
-- MDOS v18 — Core Ledger Foundation (Blueprint v9.1 §1-3.3)
-- Run after mdos_v17_employee_management.sql. Additive only — no live
-- trigger (reserve_stock_on_invoice, move_stock_on_delivery, sync_warehouse_
-- flappy, etc.) is touched in this file. Safe to re-run.
--
-- Scope decisions locked in for this stage:
--   • products catalog created now (needed as stock_movements.product_id's
--     FK target) and seeded from existing product_name values across
--     warehouse_stock / damaged_stock / returns_wayback / empties_log.
--   • Existing tables (warehouse_stock, invoices, empties_log, damaged_
--     stock) are NOT migrated to product_id here — that touches live
--     triggers and belongs to the Sell In / Invoice / Empties redesign
--     stages, done one at a time against this catalog.
--   • fuel_entries (later stage) will reference dm_routes.truck_no text,
--     no vehicles table — noted here since products/vehicles were decided
--     together.
--   • chart_of_accounts is global (like global_feature_flags), not
--     per-tenant — it's fixed and never user-editable.
--   • ledger_entries / stock_movements are created but nothing writes to
--     them yet. Wiring real triggers to post here is the next stage per
--     domain (Sell In, Damaged Stock, Returns, Empties, Payroll).
-- ============================================================================


-- ============================================================================
-- 1. products — normalized catalog, replaces free-text product_name as the
--    long-term reference. Seeded from every product_name already in use so
--    nothing existing breaks.
-- ============================================================================

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id() references tenants(id) on delete cascade,
  product_name text not null,
  is_returnable boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint uq_products_tenant_name unique (tenant_id, product_name)
);
create index if not exists idx_products_tenant on products(tenant_id);

alter table products enable row level security;

drop policy if exists products_owner_all on products;
create policy products_owner_all on products for all
  to authenticated
  using ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) )
  with check ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) );

insert into products (tenant_id, product_name)
select tenant_id, product_name from warehouse_stock
union
select tenant_id, product_name from damaged_stock
union
select tenant_id, product_name from returns_wayback
union
select tenant_id, product_name from empties_log
on conflict (tenant_id, product_name) do nothing;


-- ============================================================================
-- 2. chart_of_accounts — fixed, global, never user-editable (§3.1)
-- ============================================================================

create table if not exists chart_of_accounts (
  code text primary key,
  category text not null check (category in ('Asset','Liability','Income','Expense','Equity')),
  label text not null
);

alter table chart_of_accounts enable row level security;

drop policy if exists chart_of_accounts_read on chart_of_accounts;
create policy chart_of_accounts_read on chart_of_accounts for select
  to authenticated using (true);

drop policy if exists chart_of_accounts_write on chart_of_accounts;
create policy chart_of_accounts_write on chart_of_accounts for all
  to authenticated
  using ( (select is_platform_admin()) )
  with check ( (select is_platform_admin()) );

insert into chart_of_accounts (code, category, label) values
  ('CASH',               'Asset',     'Cash in Hand'),
  ('BANK',               'Asset',     'Bank Account'),
  ('AR_CREDIT',          'Asset',     'Accounts Receivable — Credit Shops'),
  ('STOCK',              'Asset',     'Warehouse Stock'),
  ('EMP_ADVANCES',       'Asset',     'Employee Advances / Loans Receivable'),
  ('AP_CCBPL',           'Liability', 'CCBPL Payable'),
  ('DEPOSITS_PAYABLE',   'Liability', 'Shop Empties Deposits Payable'),
  ('PENALTIES_PAYABLE',  'Liability', 'CCBPL Penalties Payable'),
  ('REV_SALES',          'Income',    'Sales Revenue'),
  ('REV_INCENTIVE',      'Income',    'Trade Incentive Income'),
  ('EXP_SALARY',         'Expense',   'Salary Expense'),
  ('EXP_FUEL',           'Expense',   'Fuel Expense'),
  ('EXP_BILLS',          'Expense',  'Bills Expense'),
  ('EXP_ENTERTAINMENT',  'Expense',   'Entertainment Expense'),
  ('EXP_PETTY',          'Expense',   'Petty Expense'),
  ('EXP_PENALTIES',      'Expense',   'Penalties Expense'),
  ('EXP_MISC',           'Expense',   'Agency Misc. Expense'),
  ('CAPITAL',            'Equity',    'Owner''s Capital')
on conflict (code) do update set category = excluded.category, label = excluded.label;


-- ============================================================================
-- 3. ledger_entries — hidden financial ledger (§3.2). One row per account
--    leg; source_table + source_id groups the legs of one domain event
--    (e.g. Sell In stock arrival = one STOCK debit row + one AP_CCBPL
--    credit row, same source_table/source_id).
-- ============================================================================

create table if not exists ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id() references tenants(id) on delete cascade,
  account_code text not null references chart_of_accounts(code),
  entry_date date not null default current_date,
  debit numeric(12,2) not null default 0 check (debit >= 0),
  credit numeric(12,2) not null default 0 check (credit >= 0),
  source_table text not null,   -- no CHECK: new source tables land here as later stages wire them up
  source_id uuid not null,
  description text,
  created_at timestamptz not null default now(),
  constraint chk_ledger_entries_one_sided check (debit > 0 or credit > 0)
);
create index if not exists idx_ledger_entries_tenant_date on ledger_entries(tenant_id, entry_date);
create index if not exists idx_ledger_entries_account on ledger_entries(tenant_id, account_code);
create index if not exists idx_ledger_entries_source on ledger_entries(source_table, source_id);

alter table ledger_entries enable row level security;

drop policy if exists ledger_entries_owner_all on ledger_entries;
create policy ledger_entries_owner_all on ledger_entries for all
  to authenticated
  using ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) )
  with check ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) );


-- ============================================================================
-- 4. stock_movements — hidden inventory ledger (§3.3), FK'd to the new
--    products catalog.
-- ============================================================================

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id() references tenants(id) on delete cascade,
  product_id uuid not null references products(id),
  movement_date date not null default current_date,
  direction text not null check (direction in ('in','out')),
  quantity numeric(12,2) not null check (quantity > 0),
  amount numeric(14,2),
  source_table text not null,   -- 'sell_in_lines' | 'invoice_line_items' | 'damaged_stock' |
                                 -- 'returns_wayback' | 'empties_log' | 'stock_count_adjustments'
  source_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_stock_movements_tenant_date on stock_movements(tenant_id, movement_date);
create index if not exists idx_stock_movements_product on stock_movements(tenant_id, product_id);
create index if not exists idx_stock_movements_source on stock_movements(source_table, source_id);

alter table stock_movements enable row level security;

drop policy if exists stock_movements_owner_all on stock_movements;
create policy stock_movements_owner_all on stock_movements for all
  to authenticated
  using ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) )
  with check ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) );


-- ============================================================================
-- 5. Feature flag placeholder for Financial Reports tab (§13 — "Show
--    Financial Reports tab" setting), so the Admin Panel has something to
--    toggle once the reporting views land in a later stage.
-- ============================================================================

insert into global_feature_flags (flag_key, label, enabled)
values ('tab_financial_reports', 'Financial Reports (Trial Balance, WH Tax Summary)', true)
on conflict (flag_key) do update set label = excluded.label;

-- ============================================================================
-- END OF v18 PATCH
--
-- Next stages (not in this file):
--   v19  bank_accounts + Cash & Bank rewire
--   v20  Sell In redesign (sell_in_orders/sell_in_lines) → posts to
--        ledger_entries + stock_movements, migrates warehouse_stock
--        arrivals off ccbpl_purchases
--   v21  Invoice simplification (delivery_status default 'delivered',
--        qty_reserved deprecated) + invoice_line_items, migrates
--        warehouse_stock/invoices off product_name text onto product_id
--   v22  Empties Log two-directional rewrite (direction, ccbpl_reference,
--        products.is_returnable gating) + Damaged Stock / Returns & Wayback
--        wired to stock_movements
--   v23  fuel_entries (keyed on dm_routes.truck_no text, no vehicles table)
--        + Salary Head read-only view + scheme_income + Income Statement
--   v24  Reporting views: Stock Ledger, Stock Balance by Level,
--        Sale/Purchase Summary, Empty Ledger, Empty Balance, WH Tax
--        Summary, Shop Statement, Trial Balance
-- ============================================================================
