-- ============================================================================
-- MDOS v20 — Remaining Blueprint v9.1 Upgrades (everything after v19)
-- Run after mdos_v19_bank_accounts.sql. Safe to re-run (IF EXISTS/OR
-- REPLACE/IF NOT EXISTS throughout), but §2 rewrites triggers that fire on
-- every invoice insert/update/delete — test on a copy before production.
--
-- Contents:
--   §1  Sell In (sell_in_orders / sell_in_lines, 4-stage lifecycle)
--   §2  Invoice simplification — delivery defaults to 'delivered' at
--       creation, invoice_line_items normalizes the products text,
--       stock/ledger/deposit triggers rewritten so an insert-time
--       'delivered' invoice moves stock and posts money immediately
--       instead of relying on a later UPDATE that will no longer happen
--   §3  Damaged Stock / Returns & Wayback → stock_movements logging
--   §4  Empties Log — two-directional rewrite, is_returnable gating
--   §5  fuel_entries (keyed on dm_routes.truck_no text)
--   §6  Salary Head read-only view, scheme_income
--   §7  Reporting views (Stock Ledger, Stock Balance by Level,
--       Sale/Purchase Summary, Empty Ledger, Empty Balance, WH Tax
--       Summary, Shop Statement, Trial Balance, Income Statement support)
-- ============================================================================


-- ============================================================================
-- §1. Sell In — sell_in_orders / sell_in_lines (§3.10, §6.3)
-- Old ccbpl_purchases / ccbpl_purchase_stock_arrived() / ccbpl_ledger stay
-- (hidden-not-removed, §14) — Sell In is the new, parallel path.
-- ============================================================================

create table if not exists sell_in_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id() references tenants(id) on delete cascade,
  po_no text not null,
  company_inv_no text,
  vehicle_no text,
  transaction_date date not null default current_date,
  status text not null default 'in_progress'
    check (status in ('in_progress','stock_arrived','on_credit','billed')),
  credit_due_date date,
  paid_from_bank_account_id uuid references bank_accounts(id),
  billed_date date,
  created_at timestamptz not null default now(),
  constraint uq_sell_in_orders_po unique (tenant_id, po_no),
  constraint chk_sell_in_credit_due check (status <> 'on_credit' or credit_due_date is not null),
  constraint chk_sell_in_billed check (status <> 'billed' or paid_from_bank_account_id is not null)
);
create index if not exists idx_sell_in_orders_tenant on sell_in_orders(tenant_id, status);

alter table sell_in_orders enable row level security;
drop policy if exists sell_in_orders_owner_all on sell_in_orders;
create policy sell_in_orders_owner_all on sell_in_orders for all
  to authenticated
  using ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) )
  with check ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) );

create table if not exists sell_in_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id() references tenants(id) on delete cascade,
  sell_in_order_id uuid not null references sell_in_orders(id) on delete cascade,
  product_id uuid not null references products(id),
  invoice_type text not null default 'purchase' check (invoice_type in ('purchase','return')),
  packing_qty numeric(10,2) not null check (packing_qty > 0),
  qty numeric(10,2) not null check (qty > 0),
  rate numeric(12,2) not null,
  wh_tax_pct numeric(5,2) not null default 0,
  unit_commission numeric(12,2) not null default 0,
  unit_scheme numeric(12,2) not null default 0,
  bill_amount numeric(14,2) generated always as (rate * qty) stored,
  wh_tax_amount numeric(14,2) generated always as (rate * qty * wh_tax_pct / 100) stored,
  commission_amount numeric(14,2) generated always as (unit_commission * (qty / nullif(packing_qty,0))) stored,
  scheme_amount numeric(14,2) generated always as (unit_scheme * (qty / nullif(packing_qty,0))) stored,
  net_bill_amount numeric(14,2) generated always as
    (rate * qty - (rate * qty * wh_tax_pct / 100)
     - (unit_commission * (qty / nullif(packing_qty,0)))
     - (unit_scheme * (qty / nullif(packing_qty,0)))) stored,
  created_at timestamptz not null default now()
);
create index if not exists idx_sell_in_lines_order on sell_in_lines(sell_in_order_id);
create index if not exists idx_sell_in_lines_tenant on sell_in_lines(tenant_id, product_id);

alter table sell_in_lines enable row level security;
drop policy if exists sell_in_lines_owner_all on sell_in_lines;
create policy sell_in_lines_owner_all on sell_in_lines for all
  to authenticated
  using ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) )
  with check ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) );

-- Status workflow (§6.3): In Progress → no writes. Stock Arrived → stock +
-- ledger (Debit STOCK / Credit AP_CCBPL), once, on first transition. On
-- Credit → just records credit_due_date, no posting (liability already
-- booked at Stock Arrived). Billed → bank balance out + ledger
-- (Debit AP_CCBPL / Credit BANK), once.
create or replace function apply_sell_in_status_change()
returns trigger
language plpgsql
security definer
as $$
declare
  v_was_arrived boolean := false;
  v_was_billed  boolean := false;
  v_line record;
  v_total_net numeric(14,2);
begin
  if tg_op = 'UPDATE' then
    v_was_arrived := (old.status in ('stock_arrived','on_credit','billed'));
    v_was_billed  := (old.status = 'billed');
  end if;

  if new.status in ('stock_arrived','on_credit','billed') and not v_was_arrived then
    for v_line in select * from sell_in_lines where sell_in_order_id = new.id loop
      if v_line.invoice_type = 'purchase' then
        update warehouse_stock set qty_total = qty_total + v_line.qty
          where tenant_id = new.tenant_id
            and product_name = (select product_name from products where id = v_line.product_id);
        insert into stock_movements (tenant_id, product_id, movement_date, direction, quantity, amount, source_table, source_id)
        values (new.tenant_id, v_line.product_id, new.transaction_date, 'in', v_line.qty, v_line.net_bill_amount, 'sell_in_lines', v_line.id);
      else
        update warehouse_stock set qty_total = qty_total - v_line.qty
          where tenant_id = new.tenant_id
            and product_name = (select product_name from products where id = v_line.product_id);
        insert into stock_movements (tenant_id, product_id, movement_date, direction, quantity, amount, source_table, source_id)
        values (new.tenant_id, v_line.product_id, new.transaction_date, 'out', v_line.qty, v_line.net_bill_amount, 'sell_in_lines', v_line.id);
      end if;
    end loop;

    select coalesce(sum(case when invoice_type = 'purchase' then net_bill_amount else -net_bill_amount end), 0)
      into v_total_net from sell_in_lines where sell_in_order_id = new.id;

    if v_total_net <> 0 then
      insert into ledger_entries (tenant_id, account_code, entry_date, debit, credit, source_table, source_id, description)
      values
        (new.tenant_id, 'STOCK',     new.transaction_date, greatest(v_total_net,0), greatest(-v_total_net,0), 'sell_in_orders', new.id, 'Sell In — ' || new.po_no || ' — Stock Arrived'),
        (new.tenant_id, 'AP_CCBPL',  new.transaction_date, greatest(-v_total_net,0), greatest(v_total_net,0), 'sell_in_orders', new.id, 'Sell In — ' || new.po_no || ' — Stock Arrived');
    end if;
  end if;

  if new.status = 'billed' and not v_was_billed then
    if new.paid_from_bank_account_id is null then
      raise exception 'paid_from_bank_account_id is required to mark a Sell In order Billed';
    end if;

    select coalesce(sum(case when invoice_type = 'purchase' then net_bill_amount else -net_bill_amount end), 0)
      into v_total_net from sell_in_lines where sell_in_order_id = new.id;

    update bank_accounts set current_balance = current_balance - v_total_net
      where id = new.paid_from_bank_account_id;

    if v_total_net <> 0 then
      insert into ledger_entries (tenant_id, account_code, entry_date, debit, credit, source_table, source_id, description)
      values
        (new.tenant_id, 'AP_CCBPL', coalesce(new.billed_date, current_date), greatest(v_total_net,0), greatest(-v_total_net,0), 'sell_in_orders', new.id, 'Sell In — ' || new.po_no || ' — Billed'),
        (new.tenant_id, 'BANK',     coalesce(new.billed_date, current_date), greatest(-v_total_net,0), greatest(v_total_net,0), 'sell_in_orders', new.id, 'Sell In — ' || new.po_no || ' — Billed');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_sell_in_status_change on sell_in_orders;
create trigger trg_apply_sell_in_status_change
  after insert or update on sell_in_orders
  for each row execute function apply_sell_in_status_change();


-- ============================================================================
-- §2. Invoice Simplification (§3.13, §5) + invoice_line_items (§9.1 source)
--
-- Key insight: reserve_stock_on_invoice() (AFTER INSERT, unconditional
-- reserve) is left completely untouched. move_stock_on_delivery() and
-- auto_create_cash_deposit() only need their trigger EVENT widened from
-- "after update" to "after insert or update" — both functions already
-- guard their forward-delivery branch on "not v_was_delivered", which
-- defaults true-false correctly on INSERT (old row doesn't exist, so
-- v_was_delivered stays false). With delivery_status now defaulting to
-- 'delivered', a brand-new invoice fires: reserve (+qty_reserved) then
-- deliver (-qty_total, -qty_reserved) in the same transaction, netting to
-- the correct qty_total-only deduction regardless of trigger firing order
-- (both are relative +=/-= updates, so the net is order-independent; the
-- one available-stock check that exists, inside reserve_stock_on_invoice,
-- evaluates against the same true pre-transaction availability either way
-- since a symmetric total/reserved shift cancels out of that formula).
-- move_stock_on_delivery()'s body IS extended, to also post ledger_entries
-- and stock_movements — that's genuinely new, not a behavior change to
-- what already worked.
-- ============================================================================

create or replace function get_or_create_product_id(p_tenant_id uuid, p_product_name text)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into products (tenant_id, product_name)
  values (p_tenant_id, p_product_name)
  on conflict (tenant_id, product_name) do update set product_name = excluded.product_name
  returning id into v_id;
  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2a. invoice_line_items — normalized mirror of invoices.products text.
-- ----------------------------------------------------------------------------

create table if not exists invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id() references tenants(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity numeric(12,2) not null check (quantity > 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_invoice_line_items_invoice on invoice_line_items(invoice_id);
create index if not exists idx_invoice_line_items_tenant on invoice_line_items(tenant_id, product_id);

alter table invoice_line_items enable row level security;
drop policy if exists invoice_line_items_owner_all on invoice_line_items;
create policy invoice_line_items_owner_all on invoice_line_items for all
  to authenticated
  using ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) )
  with check ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) );

create or replace function sync_invoice_line_items()
returns trigger
language plpgsql
security definer
as $$
declare
  v_product text;
  v_parts   text[];
  v_name    text;
  v_qty     integer;
  v_pid     uuid;
begin
  delete from invoice_line_items where invoice_id = new.id;

  for v_product in select btrim(p) from unnest(string_to_array(new.products, ',')) as p loop
    if position(chr(215) in v_product) > 0 then
      v_parts := string_to_array(v_product, chr(215));
      v_name  := btrim(v_parts[1]);
      v_qty   := btrim(v_parts[2])::integer;
    elsif v_product ~* ' x [0-9]+$' then
      v_parts := regexp_split_to_array(v_product, ' [xX] ');
      v_name  := btrim(v_parts[1]);
      v_qty   := btrim(v_parts[2])::integer;
    else
      v_name := btrim(v_product);
      v_qty  := 1;
    end if;

    v_pid := get_or_create_product_id(new.tenant_id, v_name);
    insert into invoice_line_items (tenant_id, invoice_id, product_id, quantity)
    values (new.tenant_id, new.id, v_pid, v_qty);
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_sync_invoice_line_items on invoices;
create trigger trg_sync_invoice_line_items
  after insert or update of products on invoices
  for each row execute function sync_invoice_line_items();

-- Backfill for existing invoices — "UPDATE OF products" fires whenever
-- products is in the SET list, whether or not the value actually changes.
update invoices set products = products;