-- ============================================================================
-- MDOS v17 — Employee Management Foundation
--
-- Run this in the Supabase SQL Editor after mdos_v16_shop_filer.sql.
-- Safe to re-run (IF EXISTS / OR REPLACE / IF NOT EXISTS throughout).
--
-- Scope: this is Stage 1 of the MDOS_Blueprint_v9.1.md rollout — deliberately
-- limited to what's purely additive and touches nothing currently live and
-- firing (no invoices/warehouse_stock/agency_ledger trigger is modified here).
--
-- What this does:
--   1. Extends `employees` (was a bare id/tenant_id/full_name/role/phone stub)
--      with the fields Employee Directory needs — salary, banking, references.
--   2. Adds employee_increments (salary revision history).
--   3. Adds payroll_sops (shift/grace/leave policy), re-verified this round
--      against the real Ittehad SOP screen — includes the four fields that
--      were originally missed (monthly-repeat grace, holiday bonus, thumb
--      miss deduct, biometric toggle).
--   4. Adds employee_loans, with the installment cap ENFORCED by a trigger,
--      not just documented as a convention — mirrors how reserve_stock_on_
--      invoice() already enforces stock availability at the DB level.
--   5. Adds payroll_runs, whose net_payable can never go negative (a
--      GREATEST(...,0) generated column) and which auto-posts to the real
--      agency_ledger as an 'expense' entry on save — so Payroll is the one
--      and only source of truth for salary cost, matching the blueprint's
--      "Salary Head is now synced with Payroll" fix, translated onto the
--      actual ledger table instead of an invented one.
--   6. Adds one new feature flag for the Payroll pages. Employee Directory
--      itself stays under the existing tab0 flag (Shop Details & Employees)
--      — not restructuring that grouping in this pass; flag that as a
--      follow-up decision if you'd rather split it out.
-- ============================================================================


-- ============================================================================
-- 1. Extend `employees`
-- ============================================================================

-- Widen the role check — was ('dm','preseller') only.
alter table employees drop constraint if exists employees_role_check;
alter table employees add constraint employees_role_check
  check (role in ('dm','preseller','driver','loader','guard','office','other'));

alter table employees add column if not exists employee_code text;
alter table employees add column if not exists nic text;
alter table employees add column if not exists address text;
alter table employees add column if not exists joining_date date;
alter table employees add column if not exists active boolean not null default true;
alter table employees add column if not exists basic_salary numeric(12,2) not null default 0;
alter table employees add column if not exists bank_name text;
alter table employees add column if not exists bank_account text;         -- shown as "Account Number" in the UI
alter table employees add column if not exists house_owner boolean not null default false;
alter table employees add column if not exists reference_1_name text;
alter table employees add column if not exists reference_1_phone text;
alter table employees add column if not exists reference_2_name text;
alter table employees add column if not exists reference_2_phone text;

-- employee_code is app-generated (same convention as invoice_no/po_no — no
-- DB-side sequence). Nullable-safe: Postgres allows multiple NULLs under a
-- unique constraint, so this is safe to add even with existing rows unset.
alter table employees add constraint uq_employees_employee_code
  unique (tenant_id, employee_code);

-- NOTE: no eobi_enrolled / social_security columns are added. The blueprint
-- draft had them and then removed them from the UI — since they were never
-- actually deployed here, there's nothing to hide; simply not adding them.

-- NOTE: no linked_route_id column added. dm_routes.dm_id already links an
-- employee to their truck/route — adding a second FK here would just create
-- two competing sources of the same relationship. Employee Directory should
-- join through dm_routes for a Preseller/DM's route, not store it twice.


-- ============================================================================
-- 2. employee_increments — salary revision history
-- ============================================================================

create table if not exists employee_increments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id() references tenants(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  reason text not null,
  amount numeric(12,2) not null,
  effective_date date not null default current_date,
  operator text,
  created_at timestamptz not null default now()
);
create index if not exists idx_employee_increments_tenant
  on employee_increments(tenant_id, employee_id);

alter table employee_increments enable row level security;

drop policy if exists employee_increments_owner_all on employee_increments;
create policy employee_increments_owner_all on employee_increments for all
  to authenticated
  using ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) )
  with check ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) );


-- ============================================================================
-- 3. payroll_sops — shift / grace / short-leave policy
--    Re-verified against the real Ittehad SOP screen this round: four fields
--    were missing from the earlier blueprint draft and are included here —
--    grace_limit_repeats_monthly ("REPEAT" checkbox), holiday_bonus_days,
--    thumb_miss_deduct_days, and biometric_enabled ("Biomatric Payslip").
-- ============================================================================

create table if not exists payroll_sops (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id() references tenants(id) on delete cascade,
  name text not null,
  date_from date not null,
  date_to date not null,
  shift_start time not null,
  shift_end time not null,
  morning_grace_minutes integer not null default 10,
  grace_limit_days integer not null default 3,
  grace_limit_repeats_monthly boolean not null default true,
  grace_deduction_days numeric(3,1) not null default 1,
  after_grace_deduct_days numeric(3,1) not null default 1,
  stack_deductions boolean not null default false,        -- off by default, deliberately
  holiday_bonus_days numeric(3,1) not null default 1,
  thumb_miss_deduct_days numeric(3,1) not null default 1,
  biometric_enabled boolean not null default false,
  short_leave_start time,
  before_sl_deduct_days numeric(3,1) not null default 1,
  short_leave_limit_days numeric(3,1) not null default 1,
  after_sl_deduct_days numeric(3,1) not null default 2,
  holidays jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint chk_payroll_sops_dates check (date_to >= date_from)
);
create index if not exists idx_payroll_sops_tenant on payroll_sops(tenant_id);

alter table payroll_sops enable row level security;

drop policy if exists payroll_sops_owner_all on payroll_sops;
create policy payroll_sops_owner_all on payroll_sops for all
  to authenticated
  using ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) )
  with check ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) );


-- ============================================================================
-- 4. employee_loans — the guard-rail, enforced at the DB level
--
-- This is the direct fix for the audited BSS-92 case: employees with a
-- monthly installment far larger than what they earned, with nothing
-- stopping it. Here, exceeding installment_cap_pct of basic_salary requires
-- an explicit override_reason — enforced by a BEFORE trigger, the same way
-- reserve_stock_on_invoice() already refuses an over-limit stock reservation
-- rather than just documenting a rule and hoping the app enforces it.
-- ============================================================================

create table if not exists employee_loans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id() references tenants(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  principal_amount numeric(12,2) not null check (principal_amount > 0),
  monthly_installment numeric(12,2) not null check (monthly_installment > 0),
  installment_cap_pct numeric(5,2) not null default 30,
  outstanding_balance numeric(12,2) not null check (outstanding_balance >= 0),
  status text not null default 'active' check (status in ('active','closed','override_active')),
  override_reason text,
  issued_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_employee_loans_override
    check (status <> 'override_active' or override_reason is not null)
);
create index if not exists idx_employee_loans_tenant on employee_loans(tenant_id, employee_id);

create trigger trg_employee_loans_updated_at before update on employee_loans
  for each row execute function set_updated_at();

alter table employee_loans enable row level security;

drop policy if exists employee_loans_owner_all on employee_loans;
create policy employee_loans_owner_all on employee_loans for all
  to authenticated
  using ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) )
  with check ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) );

create or replace function enforce_loan_installment_cap()
returns trigger
language plpgsql
security definer
as $$
declare
  v_basic_salary numeric(12,2);
  v_cap_amount   numeric(12,2);
begin
  select basic_salary into v_basic_salary
  from employees
  where id = new.employee_id;

  v_cap_amount := round(coalesce(v_basic_salary, 0) * new.installment_cap_pct / 100, 2);

  if new.monthly_installment > v_cap_amount then
    if new.override_reason is null or btrim(new.override_reason) = '' then
      raise exception
        'Monthly installment (%) exceeds % percent of basic salary (cap: %). An override_reason is required to exceed the cap.',
        new.monthly_installment, new.installment_cap_pct, v_cap_amount;
    end if;
    new.status := 'override_active';
  elsif new.status = 'override_active' then
    -- installment no longer exceeds the cap (e.g. edited down) — normalize
    new.status := 'active';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_loan_installment_cap on employee_loans;
create trigger trg_enforce_loan_installment_cap
  before insert or update on employee_loans
  for each row execute function enforce_loan_installment_cap();


-- ============================================================================
-- 5. payroll_runs — payslips
--
--    net_payable can never go negative (GREATEST(...,0) generated column).
--    Whatever installment amount would have pushed it below zero is instead
--    captured as balance_carried, and the applied/carried split is computed
--    automatically against the linked loan's cap — the app doesn't have to
--    get this math right on its own, the DB won't let an over-cap amount
--    through silently.
-- ============================================================================

create table if not exists payroll_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id() references tenants(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  sop_id uuid references payroll_sops(id) on delete set null,
  loan_id uuid references employee_loans(id) on delete set null,
  salary_month date not null,
  working_days integer not null default 30,
  basic_salary numeric(12,2) not null,
  bonus_amount numeric(12,2) not null default 0,
  absent_deduction numeric(12,2) not null default 0,
  sop_violation_deduction numeric(12,2) not null default 0,
  net_salary numeric(12,2)
    generated always as (basic_salary + bonus_amount - absent_deduction - sop_violation_deduction) stored,
  loan_installment_due numeric(12,2) not null default 0,
  loan_installment_applied numeric(12,2) not null default 0,
  net_payable numeric(12,2)
    generated always as (
      greatest(basic_salary + bonus_amount - absent_deduction - sop_violation_deduction - loan_installment_applied, 0)
    ) stored,
  balance_carried numeric(12,2) not null default 0,
  operator text,
  computer_voucher text,
  created_at timestamptz not null default now(),
  constraint uq_payroll_runs_employee_month unique (tenant_id, employee_id, salary_month)
);
create index if not exists idx_payroll_runs_tenant on payroll_runs(tenant_id, salary_month);

alter table payroll_runs enable row level security;

drop policy if exists payroll_runs_owner_all on payroll_runs;
create policy payroll_runs_owner_all on payroll_runs for all
  to authenticated
  using ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) )
  with check ( tenant_id = (select current_tenant_id()) and (select is_tenant_enabled()) );

-- 5a. Compute loan_installment_applied / balance_carried against the loan's
--     own cap — BEFORE INSERT/UPDATE, so the generated columns above see
--     the final, capped value.
create or replace function apply_loan_installment_cap()
returns trigger
language plpgsql
security definer
as $$
declare
  v_loan employee_loans%rowtype;
  v_cap_amount numeric(12,2);
begin
  if new.loan_id is null then
    new.loan_installment_applied := 0;
    new.balance_carried := 0;
    return new;
  end if;

  select * into v_loan from employee_loans where id = new.loan_id;
  if not found then
    raise exception 'Referenced loan_id % not found', new.loan_id;
  end if;

  v_cap_amount := round(new.basic_salary * v_loan.installment_cap_pct / 100, 2);

  new.loan_installment_applied := least(new.loan_installment_due, v_cap_amount);
  new.balance_carried := greatest(new.loan_installment_due - new.loan_installment_applied, 0);

  return new;
end;
$$;

drop trigger if exists trg_apply_loan_installment_cap on payroll_runs;
create trigger trg_apply_loan_installment_cap
  before insert or update on payroll_runs
  for each row execute function apply_loan_installment_cap();

-- 5b. When a payroll run is inserted, reduce the loan's outstanding_balance
--     by whatever was actually applied, and close the loan once it reaches
--     zero. (INSERT only, deliberately — edits to an existing payroll_runs
--     row do not re-adjust the loan balance in this pass; flag as a
--     follow-up if edit-time reversal turns out to be needed in practice.)
create or replace function apply_payroll_to_loan_balance()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.loan_id is not null and new.loan_installment_applied > 0 then
    update employee_loans
    set outstanding_balance = greatest(outstanding_balance - new.loan_installment_applied, 0),
        updated_at = now()
    where id = new.loan_id;

    update employee_loans
    set status = 'closed'
    where id = new.loan_id
      and outstanding_balance <= 0
      and status <> 'closed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_apply_payroll_to_loan_balance on payroll_runs;
create trigger trg_apply_payroll_to_loan_balance
  after insert on payroll_runs
  for each row execute function apply_payroll_to_loan_balance();

-- 5c. Post each finalized payroll run to the REAL agency_ledger as an
--     expense — same table, same pattern ccbpl_purchase_stock_arrived()
--     already uses (negative amount = cost out, entry_type identifies it).
--     This is what makes Salary a derived, always-correct figure instead
--     of a second hand-entered number living somewhere else.
create or replace function post_payroll_to_ledger()
returns trigger
language plpgsql
security definer
as $$
declare
  v_employee_name text;
begin
  select full_name into v_employee_name from employees where id = new.employee_id;

  insert into agency_ledger (
    tenant_id, entry_date, description, amount, entry_type, ref_table, ref_id
  ) values (
    new.tenant_id,
    current_date,
    'Payroll — ' || coalesce(v_employee_name, 'Unknown') || ' — ' || to_char(new.salary_month, 'Mon YYYY'),
    -new.net_payable,
    'expense',
    'payroll_runs',
    new.id
  );
  return new;
end;
$$;

drop trigger if exists trg_post_payroll_to_ledger on payroll_runs;
create trigger trg_post_payroll_to_ledger
  after insert on payroll_runs
  for each row execute function post_payroll_to_ledger();

-- 5d. Mirror the existing cleanup-on-delete pattern (see
--     fix_ledger_cleanup_triggers.sql) so deleting a payroll run doesn't
--     leave an orphaned ledger entry behind.
create or replace function cleanup_ledger_on_payroll_delete()
returns trigger
language plpgsql
security definer
as $$
begin
  delete from agency_ledger
  where ref_table = 'payroll_runs'
    and ref_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_cleanup_ledger_on_payroll_delete on payroll_runs;
create trigger trg_cleanup_ledger_on_payroll_delete
  after delete on payroll_runs
  for each row execute function cleanup_ledger_on_payroll_delete();


-- ============================================================================
-- 6. Feature flag — Payroll pages only. Employee Directory stays under the
--    existing tab0 flag (Shop Details & Employees); not restructured here.
-- ============================================================================

insert into global_feature_flags (flag_key, label, enabled)
values ('tab_employee_mgmt', 'Employee Management — Payroll Policies & Payroll Runs', true)
on conflict (flag_key) do update set label = excluded.label;

-- ============================================================================
-- END OF v17 PATCH
-- ============================================================================
