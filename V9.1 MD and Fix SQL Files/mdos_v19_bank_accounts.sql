-- ============================================================================
-- MDOS v19 — Bank Accounts (Blueprint v9.1 §3.9, §8.1, §8.2)
-- Run after mdos_v18_ledger_foundation.sql.
--
-- Cash & Bank tab already has its feature flag (tab-level, per fix_tab0_
-- flag.sql's page-flags-removed convention) — no new flag needed for the
-- Bank Accounts page.
--
-- What this does:
--   1. bank_accounts table (§3.9).
--   2. cash_deposits.bank_account_id — the "bank is now a dropdown" fix
--      from §8.1. bank_name stays (hidden-not-removed) for old rows.
--   3. Trigger: a deposit's status flip to/from 'deposited' (or an amount /
--      bank_account_id edit while deposited) keeps bank_accounts.
--      current_balance correct and posts/reverses the matching BANK/CASH
--      ledger_entries pair — same forward/reversal/amount-change/delete
--      shape as auto_create_cash_deposit() and sync_warehouse_flappy().
--   4. bank_account_ledger view for §8.2's per-account Head. Only Cash
--      Deposits post here for now; Sell In "Billed" payments (the Out
--      side) land in this same view once v20 wires that stage.
-- ============================================================================


-- ============================================================================
-- 1. bank_accounts
-- ============================================================================

create table if not exists bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id() references tenants(id) on delete cascade,
  bank_name text not null,
  account_title text not null,
  account_number text,
  current_balance numeric(14,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_bank_accounts_tenant on bank_accounts(tenant_id);

alter table bank_accounts enable row level security;

drop policy if exists bank_accounts_owner_all on bank_accounts;
create policy bank_accounts_owner_all on bank_accounts for all
  to authenticated
  using ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) )
  with check ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) );


-- ============================================================================
-- 2. cash_deposits.bank_account_id
-- ============================================================================

alter table cash_deposits
  add column if not exists bank_account_id uuid references bank_accounts(id) on delete set null;

create index if not exists idx_cash_deposits_bank_account
  on cash_deposits(bank_account_id) where bank_account_id is not null;


-- ============================================================================
-- 3. sync_bank_balance_on_deposit() — balance + ledger, both legs of the
--    same condition, so one function handles it (mirrors sync_warehouse_
--    flappy()'s INSERT/UPDATE/DELETE shape from v14).
-- ============================================================================

create or replace function sync_bank_balance_on_deposit()
returns trigger
language plpgsql
security definer
as $$
declare
  v_old_deposited boolean := false;
  v_new_deposited boolean := false;
begin
  if tg_op = 'DELETE' then
    v_old_deposited := (old.status = 'deposited');
  elsif tg_op = 'INSERT' then
    v_new_deposited := (new.status = 'deposited');
  else
    v_old_deposited := (old.status = 'deposited');
    v_new_deposited := (new.status = 'deposited');
  end if;

  -- DELETE: reverse if it was deposited
  if tg_op = 'DELETE' then
    if v_old_deposited and old.bank_account_id is not null then
      update bank_accounts set current_balance = current_balance - old.amount
      where id = old.bank_account_id;
    end if;
    delete from ledger_entries where source_table = 'cash_deposits' and source_id = old.id;
    return old;
  end if;

  -- INSERT: apply immediately if created already 'deposited'
  if tg_op = 'INSERT' then
    if v_new_deposited and new.bank_account_id is not null and new.amount > 0 then
      update bank_accounts set current_balance = current_balance + new.amount
      where id = new.bank_account_id;
      insert into ledger_entries (tenant_id, account_code, entry_date, debit, credit, source_table, source_id, description)
      values
        (new.tenant_id, 'BANK', new.deposit_date, new.amount, 0, 'cash_deposits', new.id, 'Cash Deposit'),
        (new.tenant_id, 'CASH', new.deposit_date, 0, new.amount, 'cash_deposits', new.id, 'Cash Deposit');
    end if;
    return new;
  end if;

  -- UPDATE: pending -> deposited
  if not v_old_deposited and v_new_deposited then
    if new.bank_account_id is not null and new.amount > 0 then
      update bank_accounts set current_balance = current_balance + new.amount
      where id = new.bank_account_id;
      insert into ledger_entries (tenant_id, account_code, entry_date, debit, credit, source_table, source_id, description)
      values
        (new.tenant_id, 'BANK', new.deposit_date, new.amount, 0, 'cash_deposits', new.id, 'Cash Deposit'),
        (new.tenant_id, 'CASH', new.deposit_date, 0, new.amount, 'cash_deposits', new.id, 'Cash Deposit');
    end if;

  -- UPDATE: deposited -> pending (reversal)
  elsif v_old_deposited and not v_new_deposited then
    if old.bank_account_id is not null then
      update bank_accounts set current_balance = current_balance - old.amount
      where id = old.bank_account_id;
    end if;
    delete from ledger_entries where source_table = 'cash_deposits' and source_id = new.id;

  -- UPDATE: stays deposited, amount and/or bank_account_id edited
  elsif v_old_deposited and v_new_deposited then
    if new.bank_account_id is distinct from old.bank_account_id then
      if old.bank_account_id is not null then
        update bank_accounts set current_balance = current_balance - old.amount where id = old.bank_account_id;
      end if;
      if new.bank_account_id is not null then
        update bank_accounts set current_balance = current_balance + new.amount where id = new.bank_account_id;
      end if;
    elsif new.amount is distinct from old.amount and new.bank_account_id is not null then
      update bank_accounts set current_balance = current_balance + (new.amount - old.amount)
      where id = new.bank_account_id;
    end if;

    if new.amount is distinct from old.amount or new.bank_account_id is distinct from old.bank_account_id then
      update ledger_entries set debit = new.amount, entry_date = new.deposit_date
        where source_table = 'cash_deposits' and source_id = new.id and account_code = 'BANK';
      update ledger_entries set credit = new.amount, entry_date = new.deposit_date
        where source_table = 'cash_deposits' and source_id = new.id and account_code = 'CASH';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_bank_balance_on_deposit on cash_deposits;
create trigger trg_sync_bank_balance_on_deposit
  after insert or update or delete on cash_deposits
  for each row execute function sync_bank_balance_on_deposit();


-- ============================================================================
-- 4. bank_account_ledger — §8.2 Head view. Cash Deposits only for now;
--    Sell In "Billed" payments (Out) join this union in v20.
-- ============================================================================

create or replace view bank_account_ledger
  with (security_invoker = true) as
select
  cd.tenant_id,
  cd.bank_account_id,
  cd.deposit_date as txn_date,
  'Deposit'::text as txn_type,
  coalesce(cd.bank_ref_no, 'Cash Deposit') as reference,
  cd.amount as amount_in,
  0::numeric(14,2) as amount_out,
  sum(cd.amount) over (
    partition by cd.bank_account_id
    order by cd.deposit_date, cd.created_at, cd.id
    rows between unbounded preceding and current row
  ) as running_balance
from cash_deposits cd
where cd.status = 'deposited'
  and cd.bank_account_id is not null;

-- ============================================================================
-- END OF v19 PATCH
-- Next: v20 Sell In redesign (sell_in_orders/sell_in_lines), which wires
-- the "Billed" stage's Out leg into bank_accounts.current_balance and this
-- same bank_account_ledger view.
-- ============================================================================
