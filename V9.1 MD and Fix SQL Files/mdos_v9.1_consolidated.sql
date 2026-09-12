-- ============================================================================
-- MDOS v9.1 CONSOLIDATED UPGRADE  Single-file edition for Supabase
--
-- Verified against:
--   Blueprint v9.1 (source of truth) + existing DB chain v7 thru v15
--   (v7, v8_all_fixes, v9_fixes, v10_ledger_deposits, v11_inventory_guard,
--    v13_deposit_updates, v14_ledger_damaged_fix, v15_alerts_realtime,
--    add_user_id_to_admin_logs, day2_triggers, day3_schema, day4_schema,
--    day5_schema, enable_realtime, fix_invoice_delete_trigger,
--    fix_ledger_cleanup_triggers, fix_tab0_flag, fix_tenant_access_control)
--
-- Corrections applied over the four individual files (v17 thru v20):
--   1. Payroll posts to agency_ledger (operational), NOT ledger_entries (new)
--   2. products seeded from all four existing free-text tables
--   3. sync_bank_balance_on_deposit depends on ledger_entries (v18 must precede v19)
--   4. move_stock_on_delivery and auto_create_cash_deposit widened to INSERT OR UPDATE
--   5. scheme_income table added (Blueprint 11.1, missing from all four files)
--   6. fuel_entries table added (Blueprint 3.12)
--   7. empties_log extended in-place; direction/ccbpl_reference columns added
--   8. warehouse_stock.qty_reserved default set to 0
--   9. All new tables use is_tenant_enabled() RLS pattern
--
-- Run order: top to bottom, one pass.
-- Safe to re-run (IF EXISTS / OR REPLACE / IF NOT EXISTS / ON CONFLICT).
-- ============================================================================


-- ============================================================================
-- S0. GUARD -- verify prerequisites
-- ============================================================================
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agency_ledger') THEN
    RAISE EXCEPTION 'agency_ledger not found. Run v7 thru v15 chain first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employees') THEN
    RAISE EXCEPTION 'employees not found. Run v7 thru v15 chain first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'is_tenant_enabled') THEN
    RAISE EXCEPTION 'is_tenant_enabled() not found. Run fix_tenant_access_control.sql first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'set_updated_at') THEN
    RAISE EXCEPTION 'set_updated_at() not found. Run v7 schema first.';
  END IF;
END;
$guard$;


-- ============================================================================
-- S1. EMPLOYEE MANAGEMENT (Blueprint 3.4 thru 3.8, 7)
-- ============================================================================

-- 1a. Extend employees role check (was dm/preseller in v7)
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees ADD CONSTRAINT employees_role_check
  CHECK (role IN ('dm','preseller','driver','loader','guard','office','other'));

ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_code    TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS nic              TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS address          TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS joining_date     DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS active           BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS basic_salary     NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name        TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_account     TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS house_owner      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_phone  TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS reference_1_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS reference_1_phone TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS reference_2_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS reference_2_phone TEXT;

-- eobi_enrolled/social_security NOT added (Blueprint 14: hidden, never deployed)
-- linked_route_id NOT added (dm_routes.dm_id is the canonical link)

ALTER TABLE employees DROP CONSTRAINT IF EXISTS uq_employees_employee_code;
ALTER TABLE employees ADD CONSTRAINT uq_employees_employee_code
  UNIQUE (tenant_id, employee_code);


-- 1b. employee_increments (Blueprint 3.5)
CREATE TABLE IF NOT EXISTS employee_increments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL DEFAULT current_tenant_id() REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id    UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  reason         TEXT        NOT NULL,
  amount         NUMERIC(12,2) NOT NULL,
  effective_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  operator       TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employee_increments_tenant ON employee_increments(tenant_id, employee_id);
ALTER TABLE employee_increments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employee_increments_owner_all ON employee_increments;
CREATE POLICY employee_increments_owner_all ON employee_increments FOR ALL
  TO authenticated
  USING  (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()));


-- 1c. payroll_sops (Blueprint 3.7 -- re-verified against Ittehad SOP screen)
CREATE TABLE IF NOT EXISTS payroll_sops (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID        NOT NULL DEFAULT current_tenant_id() REFERENCES tenants(id) ON DELETE CASCADE,
  name                        TEXT        NOT NULL,
  date_from                   DATE        NOT NULL,
  date_to                     DATE        NOT NULL,
  shift_start                 TIME        NOT NULL,
  shift_end                   TIME        NOT NULL,
  morning_grace_minutes       INTEGER     NOT NULL DEFAULT 10,
  grace_limit_days            INTEGER     NOT NULL DEFAULT 3,
  grace_limit_repeats_monthly BOOLEAN     NOT NULL DEFAULT TRUE,
  grace_deduction_days        NUMERIC(3,1) NOT NULL DEFAULT 1,
  after_grace_deduct_days     NUMERIC(3,1) NOT NULL DEFAULT 1,
  stack_deductions            BOOLEAN     NOT NULL DEFAULT FALSE,
  holiday_bonus_days          NUMERIC(3,1) NOT NULL DEFAULT 1,
  thumb_miss_deduct_days      NUMERIC(3,1) NOT NULL DEFAULT 1,
  biometric_enabled           BOOLEAN     NOT NULL DEFAULT FALSE,
  short_leave_start           TIME,
  before_sl_deduct_days       NUMERIC(3,1) NOT NULL DEFAULT 1,
  short_leave_limit_days      NUMERIC(3,1) NOT NULL DEFAULT 1,
  after_sl_deduct_days        NUMERIC(3,1) NOT NULL DEFAULT 2,
  holidays                    JSONB       NOT NULL DEFAULT '{}'::JSONB,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_payroll_sops_dates CHECK (date_to >= date_from)
);
CREATE INDEX IF NOT EXISTS idx_payroll_sops_tenant ON payroll_sops(tenant_id);
ALTER TABLE payroll_sops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_sops_owner_all ON payroll_sops;
CREATE POLICY payroll_sops_owner_all ON payroll_sops FOR ALL
  TO authenticated
  USING  (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()));


-- 1d. employee_loans (Blueprint 3.6)
CREATE TABLE IF NOT EXISTS employee_loans (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL DEFAULT current_tenant_id() REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id          UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  principal_amount     NUMERIC(12,2) NOT NULL CHECK (principal_amount > 0),
  monthly_installment  NUMERIC(12,2) NOT NULL CHECK (monthly_installment > 0),
  installment_cap_pct  NUMERIC(5,2)  NOT NULL DEFAULT 30,
  outstanding_balance  NUMERIC(12,2) NOT NULL CHECK (outstanding_balance >= 0),
  status               TEXT        NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','closed','override_active')),
  override_reason      TEXT,
  issued_date          DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_employee_loans_override
    CHECK (status <> 'override_active' OR override_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_employee_loans_tenant ON employee_loans(tenant_id, employee_id);
DROP TRIGGER IF EXISTS trg_employee_loans_updated_at ON employee_loans;
CREATE TRIGGER trg_employee_loans_updated_at BEFORE UPDATE ON employee_loans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE employee_loans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employee_loans_owner_all ON employee_loans;
CREATE POLICY employee_loans_owner_all ON employee_loans FOR ALL
  TO authenticated
  USING  (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()));

CREATE OR REPLACE FUNCTION enforce_loan_installment_cap()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_basic_salary NUMERIC(12,2);
  v_cap_amount   NUMERIC(12,2);
BEGIN
  SELECT basic_salary INTO v_basic_salary FROM employees WHERE id = NEW.employee_id;
  v_cap_amount := ROUND(COALESCE(v_basic_salary, 0) * NEW.installment_cap_pct / 100, 2);
  IF NEW.monthly_installment > v_cap_amount THEN
    IF NEW.override_reason IS NULL OR BTRIM(NEW.override_reason) = '' THEN
      RAISE EXCEPTION
        'Monthly installment (%) exceeds % percent of basic salary (cap: %). override_reason required.',
        NEW.monthly_installment, NEW.installment_cap_pct, v_cap_amount;
    END IF;
    NEW.status := 'override_active';
  ELSIF NEW.status = 'override_active' THEN
    NEW.status := 'active';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_enforce_loan_installment_cap ON employee_loans;
CREATE TRIGGER trg_enforce_loan_installment_cap
  BEFORE INSERT OR UPDATE ON employee_loans
  FOR EACH ROW EXECUTE FUNCTION enforce_loan_installment_cap();


-- 1e. payroll_runs (Blueprint 3.8)
CREATE TABLE IF NOT EXISTS payroll_runs (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID        NOT NULL DEFAULT current_tenant_id() REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id              UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  sop_id                   UUID        REFERENCES payroll_sops(id) ON DELETE SET NULL,
  loan_id                  UUID        REFERENCES employee_loans(id) ON DELETE SET NULL,
  salary_month             DATE        NOT NULL,
  working_days             INTEGER     NOT NULL DEFAULT 30,
  basic_salary             NUMERIC(12,2) NOT NULL,
  bonus_amount             NUMERIC(12,2) NOT NULL DEFAULT 0,
  absent_deduction         NUMERIC(12,2) NOT NULL DEFAULT 0,
  sop_violation_deduction  NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_salary               NUMERIC(12,2) GENERATED ALWAYS AS
                             (basic_salary + bonus_amount - absent_deduction - sop_violation_deduction) STORED,
  loan_installment_due     NUMERIC(12,2) NOT NULL DEFAULT 0,
  loan_installment_applied NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_payable              NUMERIC(12,2) GENERATED ALWAYS AS (
                             GREATEST(basic_salary + bonus_amount - absent_deduction
                               - sop_violation_deduction - loan_installment_applied, 0)
                           ) STORED,
  balance_carried          NUMERIC(12,2) NOT NULL DEFAULT 0,
  operator                 TEXT,
  computer_voucher         TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_payroll_runs_employee_month UNIQUE (tenant_id, employee_id, salary_month)
);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant ON payroll_runs(tenant_id, salary_month);
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_runs_owner_all ON payroll_runs;
CREATE POLICY payroll_runs_owner_all ON payroll_runs FOR ALL
  TO authenticated
  USING  (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()));

CREATE OR REPLACE FUNCTION apply_loan_installment_cap()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_loan       employee_loans%ROWTYPE;
  v_cap_amount NUMERIC(12,2);
BEGIN
  IF NEW.loan_id IS NULL THEN
    NEW.loan_installment_applied := 0;
    NEW.balance_carried := 0;
    RETURN NEW;
  END IF;
  SELECT * INTO v_loan FROM employee_loans WHERE id = NEW.loan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'loan_id % not found', NEW.loan_id; END IF;
  v_cap_amount := ROUND(NEW.basic_salary * v_loan.installment_cap_pct / 100, 2);
  NEW.loan_installment_applied := LEAST(NEW.loan_installment_due, v_cap_amount);
  NEW.balance_carried := GREATEST(NEW.loan_installment_due - NEW.loan_installment_applied, 0);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_apply_loan_installment_cap ON payroll_runs;
CREATE TRIGGER trg_apply_loan_installment_cap
  BEFORE INSERT OR UPDATE ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION apply_loan_installment_cap();

CREATE OR REPLACE FUNCTION apply_payroll_to_loan_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $fn$
BEGIN
  IF NEW.loan_id IS NOT NULL AND NEW.loan_installment_applied > 0 THEN
    UPDATE employee_loans
    SET outstanding_balance = GREATEST(outstanding_balance - NEW.loan_installment_applied, 0),
        updated_at = now()
    WHERE id = NEW.loan_id;
    UPDATE employee_loans SET status = 'closed'
    WHERE id = NEW.loan_id AND outstanding_balance <= 0 AND status <> 'closed';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_apply_payroll_to_loan_balance ON payroll_runs;
CREATE TRIGGER trg_apply_payroll_to_loan_balance
  AFTER INSERT ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION apply_payroll_to_loan_balance();

CREATE OR REPLACE FUNCTION post_payroll_to_ledger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE v_name TEXT;
BEGIN
  SELECT full_name INTO v_name FROM employees WHERE id = NEW.employee_id;
  INSERT INTO agency_ledger (tenant_id, entry_date, description, amount, entry_type, ref_table, ref_id)
  VALUES (
    NEW.tenant_id, CURRENT_DATE,
    'Payroll ' || COALESCE(v_name,'Unknown') || ' ' || TO_CHAR(NEW.salary_month,'Mon YYYY'),
    -NEW.net_payable, 'expense', 'payroll_runs', NEW.id
  );
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_post_payroll_to_ledger ON payroll_runs;
CREATE TRIGGER trg_post_payroll_to_ledger
  AFTER INSERT ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION post_payroll_to_ledger();

CREATE OR REPLACE FUNCTION cleanup_ledger_on_payroll_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $fn$
BEGIN
  DELETE FROM agency_ledger WHERE ref_table = 'payroll_runs' AND ref_id = OLD.id;
  RETURN OLD;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_cleanup_ledger_on_payroll_delete ON payroll_runs;
CREATE TRIGGER trg_cleanup_ledger_on_payroll_delete
  AFTER DELETE ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION cleanup_ledger_on_payroll_delete();

INSERT INTO global_feature_flags (flag_key, label, enabled)
VALUES ('tab_employee_mgmt', 'Employee Management Payroll Policies and Payroll Runs', TRUE)
ON CONFLICT (flag_key) DO UPDATE SET label = EXCLUDED.label;


-- ============================================================================
-- S2. CORE LEDGER FOUNDATION (Blueprint 3.1 thru 3.3)
-- ============================================================================

-- 2a. products catalog
CREATE TABLE IF NOT EXISTS products (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID    NOT NULL DEFAULT current_tenant_id() REFERENCES tenants(id) ON DELETE CASCADE,
  product_name  TEXT    NOT NULL,
  is_returnable BOOLEAN NOT NULL DEFAULT FALSE,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_products_tenant_name UNIQUE (tenant_id, product_name)
);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_owner_all ON products;
CREATE POLICY products_owner_all ON products FOR ALL
  TO authenticated
  USING  (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()));

INSERT INTO products (tenant_id, product_name)
SELECT tenant_id, product_name FROM warehouse_stock
UNION SELECT tenant_id, product_name FROM damaged_stock
UNION SELECT tenant_id, product_name FROM returns_wayback
UNION SELECT tenant_id, product_name FROM empties_log
ON CONFLICT (tenant_id, product_name) DO NOTHING;


-- 2b. chart_of_accounts (Blueprint 3.1 -- global, ~20 accounts)
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  code     TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('Asset','Liability','Income','Expense','Equity')),
  label    TEXT NOT NULL
);
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chart_of_accounts_read ON chart_of_accounts;
CREATE POLICY chart_of_accounts_read ON chart_of_accounts FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS chart_of_accounts_write ON chart_of_accounts;
CREATE POLICY chart_of_accounts_write ON chart_of_accounts FOR ALL
  TO authenticated
  USING  ((SELECT is_platform_admin()))
  WITH CHECK ((SELECT is_platform_admin()));

INSERT INTO chart_of_accounts (code, category, label) VALUES
  ('CASH',              'Asset',     'Cash in Hand'),
  ('BANK',              'Asset',     'Bank Account'),
  ('AR_CREDIT',         'Asset',     'Accounts Receivable Credit Shops'),
  ('STOCK',             'Asset',     'Warehouse Stock'),
  ('EMP_ADVANCES',      'Asset',     'Employee Advances Loans Receivable'),
  ('AP_CCBPL',          'Liability', 'CCBPL Payable'),
  ('DEPOSITS_PAYABLE',  'Liability', 'Shop Empties Deposits Payable'),
  ('PENALTIES_PAYABLE', 'Liability', 'CCBPL Penalties Payable'),
  ('REV_SALES',         'Income',    'Sales Revenue'),
  ('REV_INCENTIVE',     'Income',    'Trade Incentive Income'),
  ('EXP_SALARY',        'Expense',   'Salary Expense'),
  ('EXP_FUEL',          'Expense',   'Fuel Expense'),
  ('EXP_BILLS',         'Expense',   'Bills Expense'),
  ('EXP_ENTERTAINMENT', 'Expense',   'Entertainment Expense'),
  ('EXP_PETTY',         'Expense',   'Petty Expense'),
  ('EXP_PENALTIES',     'Expense',   'Penalties Expense'),
  ('EXP_MISC',          'Expense',   'Agency Misc Expense'),
  ('CAPITAL',           'Equity',    'Owner Capital')
ON CONFLICT (code) DO UPDATE SET category = EXCLUDED.category, label = EXCLUDED.label;


-- 2c. ledger_entries (Blueprint 3.2 -- hidden double-entry)
CREATE TABLE IF NOT EXISTS ledger_entries (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID  NOT NULL DEFAULT current_tenant_id() REFERENCES tenants(id) ON DELETE CASCADE,
  account_code TEXT  NOT NULL REFERENCES chart_of_accounts(code),
  entry_date   DATE  NOT NULL DEFAULT CURRENT_DATE,
  debit        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  source_table TEXT  NOT NULL,
  source_id    UUID  NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_ledger_one_sided CHECK (debit > 0 OR credit > 0)
);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_tenant_date ON ledger_entries(tenant_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON ledger_entries(tenant_id, account_code);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_source ON ledger_entries(source_table, source_id);
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ledger_entries_owner_all ON ledger_entries;
CREATE POLICY ledger_entries_owner_all ON ledger_entries FOR ALL
  TO authenticated
  USING  (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()));


-- 2d. stock_movements (Blueprint 3.3 -- hidden inventory ledger)
CREATE TABLE IF NOT EXISTS stock_movements (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID  NOT NULL DEFAULT current_tenant_id() REFERENCES tenants(id) ON DELETE CASCADE,
  product_id    UUID  NOT NULL REFERENCES products(id),
  movement_date DATE  NOT NULL DEFAULT CURRENT_DATE,
  direction     TEXT  NOT NULL CHECK (direction IN ('in','out')),
  quantity      NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  amount        NUMERIC(14,2),
  source_table  TEXT  NOT NULL,
  source_id     UUID  NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_date ON stock_movements(tenant_id, movement_date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_source ON stock_movements(source_table, source_id);
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_movements_owner_all ON stock_movements;
CREATE POLICY stock_movements_owner_all ON stock_movements FOR ALL
  TO authenticated
  USING  (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()));

INSERT INTO global_feature_flags (flag_key, label, enabled)
VALUES ('tab_financial_reports', 'Financial Reports Trial Balance WH Tax Summary', TRUE)
ON CONFLICT (flag_key) DO UPDATE SET label = EXCLUDED.label;


-- ============================================================================
-- S3. BANK ACCOUNTS (Blueprint 3.9, 8.1, 8.2)
-- ============================================================================

CREATE TABLE IF NOT EXISTS bank_accounts (
  id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID  NOT NULL DEFAULT current_tenant_id() REFERENCES tenants(id) ON DELETE CASCADE,
  bank_name       TEXT  NOT NULL,
  account_title   TEXT  NOT NULL,
  account_number  TEXT,
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_tenant ON bank_accounts(tenant_id);
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bank_accounts_owner_all ON bank_accounts;
CREATE POLICY bank_accounts_owner_all ON bank_accounts FOR ALL
  TO authenticated
  USING  (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()));

-- cash_deposits.bank_account_id (Blueprint 8.1 - bank is now a dropdown)
ALTER TABLE cash_deposits
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL;

-- cash_deposits.bank_ref_no (needed by bank_account_ledger view below)
ALTER TABLE cash_deposits ADD COLUMN IF NOT EXISTS bank_ref_no TEXT;

CREATE INDEX IF NOT EXISTS idx_cash_deposits_bank_account
  ON cash_deposits(bank_account_id) WHERE bank_account_id IS NOT NULL;

-- sync_bank_balance_on_deposit (Blueprint 3.9)
-- Posts to ledger_entries (new double-entry ledger created in S2), NOT agency_ledger
CREATE OR REPLACE FUNCTION sync_bank_balance_on_deposit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_old_dep BOOLEAN := FALSE;
  v_new_dep BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old_dep := (OLD.status = 'deposited');
  ELSIF TG_OP = 'INSERT' THEN
    v_new_dep := (NEW.status = 'deposited');
  ELSE
    v_old_dep := (OLD.status = 'deposited');
    v_new_dep := (NEW.status = 'deposited');
  END IF;

  -- DELETE: reverse if was deposited
  IF TG_OP = 'DELETE' THEN
    IF v_old_dep AND OLD.bank_account_id IS NOT NULL THEN
      UPDATE bank_accounts SET current_balance = current_balance - OLD.amount
        WHERE id = OLD.bank_account_id;
    END IF;
    DELETE FROM ledger_entries WHERE source_table = 'cash_deposits' AND source_id = OLD.id;
    RETURN OLD;
  END IF;

  -- INSERT: apply immediately if already deposited
  IF TG_OP = 'INSERT' THEN
    IF v_new_dep AND NEW.bank_account_id IS NOT NULL AND NEW.amount > 0 THEN
      UPDATE bank_accounts SET current_balance = current_balance + NEW.amount
        WHERE id = NEW.bank_account_id;
      INSERT INTO ledger_entries (tenant_id, account_code, entry_date, debit, credit, source_table, source_id, description)
      VALUES
        (NEW.tenant_id,'BANK',NEW.deposit_date,NEW.amount,0,'cash_deposits',NEW.id,'Cash Deposit'),
        (NEW.tenant_id,'CASH',NEW.deposit_date,0,NEW.amount,'cash_deposits',NEW.id,'Cash Deposit');
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: pending -> deposited
  IF NOT v_old_dep AND v_new_dep THEN
    IF NEW.bank_account_id IS NOT NULL AND NEW.amount > 0 THEN
      UPDATE bank_accounts SET current_balance = current_balance + NEW.amount
        WHERE id = NEW.bank_account_id;
      INSERT INTO ledger_entries (tenant_id, account_code, entry_date, debit, credit, source_table, source_id, description)
      VALUES
        (NEW.tenant_id,'BANK',NEW.deposit_date,NEW.amount,0,'cash_deposits',NEW.id,'Cash Deposit'),
        (NEW.tenant_id,'CASH',NEW.deposit_date,0,NEW.amount,'cash_deposits',NEW.id,'Cash Deposit');
    END IF;

  -- UPDATE: deposited -> pending (reversal)
  ELSIF v_old_dep AND NOT v_new_dep THEN
    IF OLD.bank_account_id IS NOT NULL THEN
      UPDATE bank_accounts SET current_balance = current_balance - OLD.amount
        WHERE id = OLD.bank_account_id;
    END IF;
    DELETE FROM ledger_entries WHERE source_table = 'cash_deposits' AND source_id = NEW.id;

  -- UPDATE: stays deposited, amount or bank changed
  ELSIF v_old_dep AND v_new_dep THEN
    IF NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id THEN
      IF OLD.bank_account_id IS NOT NULL THEN
        UPDATE bank_accounts SET current_balance = current_balance - OLD.amount WHERE id = OLD.bank_account_id;
      END IF;
      IF NEW.bank_account_id IS NOT NULL THEN
        UPDATE bank_accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.bank_account_id;
      END IF;
    ELSIF NEW.amount IS DISTINCT FROM OLD.amount AND NEW.bank_account_id IS NOT NULL THEN
      UPDATE bank_accounts SET current_balance = current_balance + (NEW.amount - OLD.amount)
        WHERE id = NEW.bank_account_id;
    END IF;
    IF NEW.amount IS DISTINCT FROM OLD.amount OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id THEN
      UPDATE ledger_entries SET debit = NEW.amount, entry_date = NEW.deposit_date
        WHERE source_table='cash_deposits' AND source_id=NEW.id AND account_code='BANK';
      UPDATE ledger_entries SET credit = NEW.amount, entry_date = NEW.deposit_date
        WHERE source_table='cash_deposits' AND source_id=NEW.id AND account_code='CASH';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_bank_balance_on_deposit ON cash_deposits;
CREATE TRIGGER trg_sync_bank_balance_on_deposit
  AFTER INSERT OR UPDATE OR DELETE ON cash_deposits
  FOR EACH ROW EXECUTE FUNCTION sync_bank_balance_on_deposit();

-- ============================================================================
-- S4. SELL IN - 4-stage lifecycle + stock/ledger wiring (Blueprint 3.10, 6.3)
-- ============================================================================

-- Old ccbpl_purchases/ccbpl_ledger stay (hidden-not-removed per Blueprint 14)
-- Sell In is the new parallel path.

CREATE TABLE IF NOT EXISTS sell_in_orders (
  id                        UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID  NOT NULL DEFAULT current_tenant_id() REFERENCES tenants(id) ON DELETE CASCADE,
  po_no                     TEXT  NOT NULL,
  company_inv_no            TEXT,
  vehicle_no                TEXT,
  transaction_date          DATE  NOT NULL DEFAULT CURRENT_DATE,
  status                    TEXT  NOT NULL DEFAULT 'in_progress'
                              CHECK (status IN ('in_progress','stock_arrived','on_credit','billed')),
  credit_due_date           DATE,
  paid_from_bank_account_id UUID  REFERENCES bank_accounts(id),
  billed_date               DATE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_sell_in_orders_po UNIQUE (tenant_id, po_no),
  CONSTRAINT chk_sell_in_credit_due CHECK (status <> 'on_credit' OR credit_due_date IS NOT NULL),
  CONSTRAINT chk_sell_in_billed     CHECK (status <> 'billed'    OR paid_from_bank_account_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_sell_in_orders_tenant ON sell_in_orders(tenant_id, status);
ALTER TABLE sell_in_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sell_in_orders_owner_all ON sell_in_orders;
CREATE POLICY sell_in_orders_owner_all ON sell_in_orders FOR ALL
  TO authenticated
  USING  (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()));

CREATE TABLE IF NOT EXISTS sell_in_lines (
  id                UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID  NOT NULL DEFAULT current_tenant_id() REFERENCES tenants(id) ON DELETE CASCADE,
  sell_in_order_id  UUID  NOT NULL REFERENCES sell_in_orders(id) ON DELETE CASCADE,
  product_id        UUID  NOT NULL REFERENCES products(id),
  invoice_type      TEXT  NOT NULL DEFAULT 'purchase' CHECK (invoice_type IN ('purchase','return')),
  packing_qty       NUMERIC(10,2) NOT NULL CHECK (packing_qty > 0),
  qty               NUMERIC(10,2) NOT NULL CHECK (qty > 0),
  rate              NUMERIC(12,2) NOT NULL,
  wh_tax_pct        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  unit_commission   NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_scheme       NUMERIC(12,2) NOT NULL DEFAULT 0,
  bill_amount       NUMERIC(14,2) GENERATED ALWAYS AS (rate * qty) STORED,
  wh_tax_amount     NUMERIC(14,2) GENERATED ALWAYS AS (rate * qty * wh_tax_pct / 100) STORED,
  commission_amount NUMERIC(14,2) GENERATED ALWAYS AS (unit_commission * (qty / NULLIF(packing_qty,0))) STORED,
  scheme_amount     NUMERIC(14,2) GENERATED ALWAYS AS (unit_scheme * (qty / NULLIF(packing_qty,0))) STORED,
  net_bill_amount   NUMERIC(14,2) GENERATED ALWAYS AS
    (rate * qty
     - (rate * qty * wh_tax_pct / 100)
     - (unit_commission * (qty / NULLIF(packing_qty,0)))
     - (unit_scheme * (qty / NULLIF(packing_qty,0)))) STORED,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sell_in_lines_order  ON sell_in_lines(sell_in_order_id);
CREATE INDEX IF NOT EXISTS idx_sell_in_lines_tenant ON sell_in_lines(tenant_id, product_id);
ALTER TABLE sell_in_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sell_in_lines_owner_all ON sell_in_lines;
CREATE POLICY sell_in_lines_owner_all ON sell_in_lines FOR ALL
  TO authenticated
  USING  (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()));

-- Status workflow:
--   In Progress  => no writes
--   Stock Arrived => warehouse_stock +qty, stock_movements IN, ledger STOCK/AP_CCBPL
--   On Credit    => records credit_due_date (liability already booked at Stock Arrived)
--   Billed       => bank_accounts OUT, ledger AP_CCBPL/BANK

CREATE OR REPLACE FUNCTION apply_sell_in_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_was_arrived BOOLEAN := FALSE;
  v_was_billed  BOOLEAN := FALSE;
  v_line        RECORD;
  v_total_net   NUMERIC(14,2);
  v_pname       TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_was_arrived := (OLD.status IN ('stock_arrived','on_credit','billed'));
    v_was_billed  := (OLD.status = 'billed');
  END IF;

  -- Stock Arrived: write warehouse + ledger once only
  IF NEW.status IN ('stock_arrived','on_credit','billed') AND NOT v_was_arrived THEN
    FOR v_line IN SELECT * FROM sell_in_lines WHERE sell_in_order_id = NEW.id LOOP
      SELECT product_name INTO v_pname FROM products WHERE id = v_line.product_id;
      IF v_line.invoice_type = 'purchase' THEN
        UPDATE warehouse_stock SET qty_total = qty_total + v_line.qty
          WHERE tenant_id = NEW.tenant_id AND product_name = v_pname;
        INSERT INTO stock_movements (tenant_id,product_id,movement_date,direction,quantity,amount,source_table,source_id)
        VALUES (NEW.tenant_id,v_line.product_id,NEW.transaction_date,'in',v_line.qty,v_line.net_bill_amount,'sell_in_lines',v_line.id);
      ELSE
        UPDATE warehouse_stock SET qty_total = GREATEST(qty_total - v_line.qty, 0)
          WHERE tenant_id = NEW.tenant_id AND product_name = v_pname;
        INSERT INTO stock_movements (tenant_id,product_id,movement_date,direction,quantity,amount,source_table,source_id)
        VALUES (NEW.tenant_id,v_line.product_id,NEW.transaction_date,'out',v_line.qty,v_line.net_bill_amount,'sell_in_lines',v_line.id);
      END IF;
    END LOOP;

    SELECT COALESCE(SUM(CASE WHEN invoice_type='purchase' THEN net_bill_amount ELSE -net_bill_amount END),0)
      INTO v_total_net FROM sell_in_lines WHERE sell_in_order_id = NEW.id;

    IF v_total_net <> 0 THEN
      INSERT INTO ledger_entries (tenant_id,account_code,entry_date,debit,credit,source_table,source_id,description)
      VALUES
        (NEW.tenant_id,'STOCK',   NEW.transaction_date,GREATEST(v_total_net,0), GREATEST(-v_total_net,0),'sell_in_orders',NEW.id,'Sell In '||NEW.po_no||' Stock Arrived'),
        (NEW.tenant_id,'AP_CCBPL',NEW.transaction_date,GREATEST(-v_total_net,0),GREATEST(v_total_net,0), 'sell_in_orders',NEW.id,'Sell In '||NEW.po_no||' Stock Arrived');
    END IF;
  END IF;

  -- Billed: clear payable, deduct bank balance
  IF NEW.status = 'billed' AND NOT v_was_billed THEN
    IF NEW.paid_from_bank_account_id IS NULL THEN
      RAISE EXCEPTION 'paid_from_bank_account_id is required to mark a Sell In order Billed';
    END IF;
    SELECT COALESCE(SUM(CASE WHEN invoice_type='purchase' THEN net_bill_amount ELSE -net_bill_amount END),0)
      INTO v_total_net FROM sell_in_lines WHERE sell_in_order_id = NEW.id;
    UPDATE bank_accounts SET current_balance = current_balance - v_total_net
      WHERE id = NEW.paid_from_bank_account_id;
    IF v_total_net <> 0 THEN
      INSERT INTO ledger_entries (tenant_id,account_code,entry_date,debit,credit,source_table,source_id,description)
      VALUES
        (NEW.tenant_id,'AP_CCBPL',COALESCE(NEW.billed_date,CURRENT_DATE),GREATEST(v_total_net,0), GREATEST(-v_total_net,0),'sell_in_orders',NEW.id,'Sell In '||NEW.po_no||' Billed'),
        (NEW.tenant_id,'BANK',    COALESCE(NEW.billed_date,CURRENT_DATE),GREATEST(-v_total_net,0),GREATEST(v_total_net,0), 'sell_in_orders',NEW.id,'Sell In '||NEW.po_no||' Billed');
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_apply_sell_in_status_change ON sell_in_orders;
CREATE TRIGGER trg_apply_sell_in_status_change
  AFTER INSERT OR UPDATE ON sell_in_orders
  FOR EACH ROW EXECUTE FUNCTION apply_sell_in_status_change();

-- bank_account_ledger view: Cash Deposit ins + Sell In Billed outs
CREATE OR REPLACE VIEW bank_account_ledger WITH (security_invoker = TRUE) AS
SELECT
  cd.tenant_id,
  cd.bank_account_id,
  cd.deposit_date                                  AS txn_date,
  'Deposit'::TEXT                                  AS txn_type,
  COALESCE(cd.bank_ref_no, 'Cash Deposit')         AS reference,
  cd.amount                                        AS amount_in,
  0::NUMERIC(14,2)                                 AS amount_out,
  NULL::TEXT                                       AS po_no
FROM cash_deposits cd
WHERE cd.status = 'deposited' AND cd.bank_account_id IS NOT NULL
UNION ALL
SELECT
  sio.tenant_id,
  sio.paid_from_bank_account_id                    AS bank_account_id,
  COALESCE(sio.billed_date, sio.transaction_date)  AS txn_date,
  'Sell In Payment'::TEXT                          AS txn_type,
  sio.po_no                                        AS reference,
  0::NUMERIC(14,2)                                 AS amount_in,
  COALESCE((
    SELECT SUM(CASE WHEN invoice_type='purchase' THEN net_bill_amount ELSE -net_bill_amount END)
    FROM sell_in_lines WHERE sell_in_order_id = sio.id
  ), 0)                                            AS amount_out,
  sio.po_no
FROM sell_in_orders sio
WHERE sio.status = 'billed' AND sio.paid_from_bank_account_id IS NOT NULL;

-- ============================================================================
-- S5. INVOICE SIMPLIFICATION + invoice_line_items (Blueprint 3.13, 5)
-- ============================================================================

-- delivery_status defaults to 'delivered' (Blueprint 3.13)
ALTER TABLE invoices ALTER COLUMN delivery_status SET DEFAULT 'delivered';

-- warehouse_stock.qty_reserved defaults to 0 (Blueprint 3.14, 6.1)
ALTER TABLE warehouse_stock ALTER COLUMN qty_reserved SET DEFAULT 0;

-- Helper: upsert a product by name, return its id
CREATE OR REPLACE FUNCTION get_or_create_product_id(p_tenant_id UUID, p_product_name TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE v_id UUID;
BEGIN
  INSERT INTO products (tenant_id, product_name)
  VALUES (p_tenant_id, p_product_name)
  ON CONFLICT (tenant_id, product_name) DO UPDATE SET product_name = EXCLUDED.product_name
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

-- invoice_line_items: normalized mirror of invoices.products text
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id         UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID  NOT NULL DEFAULT current_tenant_id() REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id UUID  NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id UUID  NOT NULL REFERENCES products(id),
  quantity   NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_tenant  ON invoice_line_items(tenant_id, product_id);
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_line_items_owner_all ON invoice_line_items;
CREATE POLICY invoice_line_items_owner_all ON invoice_line_items FOR ALL
  TO authenticated
  USING  (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()));

-- sync_invoice_line_items: parse products text -> normalized rows
CREATE OR REPLACE FUNCTION sync_invoice_line_items()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_product TEXT; v_parts TEXT[]; v_name TEXT; v_qty INTEGER; v_pid UUID;
BEGIN
  DELETE FROM invoice_line_items WHERE invoice_id = NEW.id;
  FOR v_product IN SELECT BTRIM(p) FROM UNNEST(string_to_array(NEW.products,',')) AS p LOOP
    IF POSITION(chr(215) IN v_product) > 0 THEN
      v_parts := string_to_array(v_product, chr(215));
      v_name  := BTRIM(v_parts[1]); v_qty := BTRIM(v_parts[2])::INTEGER;
    ELSIF v_product ~* ' x [0-9]+$' THEN
      v_parts := regexp_split_to_array(v_product, ' [xX] ');
      v_name  := BTRIM(v_parts[1]); v_qty := BTRIM(v_parts[2])::INTEGER;
    ELSE
      v_name := BTRIM(v_product); v_qty := 1;
    END IF;
    v_pid := get_or_create_product_id(NEW.tenant_id, v_name);
    INSERT INTO invoice_line_items (tenant_id, invoice_id, product_id, quantity)
    VALUES (NEW.tenant_id, NEW.id, v_pid, v_qty);
  END LOOP;
  RETURN NEW;
END;
$fn$;

-- No conflict with existing trg_reserve_stock_on_invoice or trg_move_stock_on_delivery:
-- this trigger only writes to invoice_line_items, a new table.
DROP TRIGGER IF EXISTS trg_sync_invoice_line_items ON invoices;
CREATE TRIGGER trg_sync_invoice_line_items
  AFTER INSERT OR UPDATE OF products ON invoices
  FOR EACH ROW EXECUTE FUNCTION sync_invoice_line_items();

-- Backfill existing invoices into invoice_line_items
UPDATE invoices SET products = products;

-- Rewrite move_stock_on_delivery to also post stock_movements rows.
-- This replaces the v11 version (which only did warehouse_stock + agency_ledger).
-- Trigger is widened from AFTER UPDATE -> AFTER INSERT OR UPDATE because
-- delivery_status now defaults 'delivered', so a new invoice fires this path.
CREATE OR REPLACE FUNCTION move_stock_on_delivery()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_was_delivered BOOLEAN := FALSE;
  v_product TEXT; v_parts TEXT[]; v_name TEXT; v_qty INTEGER;
  v_ledger_amount NUMERIC; v_pid UUID;
BEGIN
  IF TG_OP = 'UPDATE' THEN v_was_delivered := (OLD.delivery_status = 'delivered'); END IF;

  -- Case A: non-delivered -> delivered
  IF NEW.delivery_status = 'delivered' AND NOT v_was_delivered THEN
    FOR v_product IN SELECT BTRIM(p) FROM UNNEST(string_to_array(NEW.products,',')) AS p LOOP
      IF POSITION(chr(215) IN v_product) > 0 THEN
        v_parts := string_to_array(v_product, chr(215));
        v_name := BTRIM(v_parts[1]); v_qty := BTRIM(v_parts[2])::INTEGER;
      ELSIF v_product ~* ' x [0-9]+$' THEN
        v_parts := regexp_split_to_array(v_product, ' [xX] ');
        v_name := BTRIM(v_parts[1]); v_qty := BTRIM(v_parts[2])::INTEGER;
      ELSE
        v_name := BTRIM(v_product); v_qty := 1;
      END IF;
      UPDATE warehouse_stock SET qty_total=qty_total-v_qty, qty_reserved=qty_reserved-v_qty
        WHERE tenant_id=NEW.tenant_id AND product_name=v_name;
      v_pid := get_or_create_product_id(NEW.tenant_id, v_name);
      INSERT INTO stock_movements (tenant_id,product_id,movement_date,direction,quantity,source_table,source_id)
      VALUES (NEW.tenant_id,v_pid,CURRENT_DATE,'out',v_qty,'invoice_line_items',NEW.id);
    END LOOP;
    IF NEW.invoice_type = 'cash' THEN
      v_ledger_amount := NEW.invoice_total - NEW.discount_amount + NEW.advance_tax;
    ELSE
      v_ledger_amount := COALESCE(NEW.amount_received, 0);
    END IF;
    INSERT INTO agency_ledger (tenant_id,entry_date,description,amount,entry_type,ref_table,ref_id)
    VALUES (NEW.tenant_id,CURRENT_DATE,'Invoice Delivered - '||NEW.invoice_no,
            v_ledger_amount,'revenue','invoices',NEW.id);

  -- Case B: delivered -> non-delivered (reversal)
  ELSIF NEW.delivery_status <> 'delivered' AND v_was_delivered THEN
    FOR v_product IN SELECT BTRIM(p) FROM UNNEST(string_to_array(OLD.products,',')) AS p LOOP
      IF POSITION(chr(215) IN v_product) > 0 THEN
        v_parts := string_to_array(v_product, chr(215));
        v_name := BTRIM(v_parts[1]); v_qty := BTRIM(v_parts[2])::INTEGER;
      ELSIF v_product ~* ' x [0-9]+$' THEN
        v_parts := regexp_split_to_array(v_product, ' [xX] ');
        v_name := BTRIM(v_parts[1]); v_qty := BTRIM(v_parts[2])::INTEGER;
      ELSE
        v_name := BTRIM(v_product); v_qty := 1;
      END IF;
      UPDATE warehouse_stock SET qty_total=qty_total+v_qty, qty_reserved=qty_reserved+v_qty
        WHERE tenant_id=NEW.tenant_id AND product_name=v_name;
    END LOOP;
    DELETE FROM agency_ledger WHERE ref_table='invoices' AND ref_id=OLD.id AND entry_type='revenue';
    DELETE FROM stock_movements WHERE source_table='invoice_line_items' AND source_id=OLD.id;

  -- Case C: credit, stays delivered, amount_received changed
  ELSIF NEW.delivery_status='delivered' AND v_was_delivered
        AND NEW.invoice_type='credit'
        AND NEW.amount_received IS DISTINCT FROM OLD.amount_received THEN
    UPDATE agency_ledger SET amount=COALESCE(NEW.amount_received,0)
      WHERE ref_table='invoices' AND ref_id=NEW.id AND entry_type='revenue';
  END IF;
  RETURN NEW;
END;
$fn$;

-- Widen from AFTER UPDATE -> AFTER INSERT OR UPDATE
DROP TRIGGER IF EXISTS trg_move_stock_on_delivery ON invoices;
CREATE TRIGGER trg_move_stock_on_delivery
  AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION move_stock_on_delivery();

-- Widen auto_create_cash_deposit trigger to AFTER INSERT OR UPDATE as well
DROP TRIGGER IF EXISTS trg_auto_create_cash_deposit ON invoices;
CREATE TRIGGER trg_auto_create_cash_deposit
  AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION auto_create_cash_deposit();

-- ============================================================================
-- S6. DAMAGED STOCK / RETURNS + stock_movements wiring (Blueprint 6.1, 9.1)
-- ============================================================================

-- Extend sync_warehouse_flappy (from v14) to also write stock_movements rows.
-- Existing warehouse_stock qty_total/qty_flappy logic is preserved exactly.
CREATE OR REPLACE FUNCTION sync_warehouse_flappy()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_product TEXT; v_tenant UUID; v_flappy INTEGER;
  v_qty_delta INTEGER := 0;
  v_old_adj BOOLEAN := FALSE; v_new_adj BOOLEAN := FALSE;
  v_pid UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_product := OLD.product_name; v_tenant := OLD.tenant_id;
    v_old_adj := (OLD.status = 'adjusted');
  ELSIF TG_OP = 'INSERT' THEN
    v_product := NEW.product_name; v_tenant := NEW.tenant_id;
    v_new_adj := (NEW.status = 'adjusted');
  ELSE
    v_product := NEW.product_name; v_tenant := NEW.tenant_id;
    v_old_adj := (OLD.status = 'adjusted');
    v_new_adj := (NEW.status = 'adjusted');
  END IF;

  SELECT COALESCE(SUM(quantity),0) INTO v_flappy
    FROM damaged_stock WHERE tenant_id=v_tenant AND product_name=v_product AND status<>'adjusted';

  IF TG_OP='INSERT' AND v_new_adj THEN v_qty_delta := -NEW.quantity;
  ELSIF TG_OP='UPDATE' THEN
    IF NOT v_old_adj AND v_new_adj THEN v_qty_delta := -NEW.quantity;
    ELSIF v_old_adj AND NOT v_new_adj THEN v_qty_delta := OLD.quantity;
    ELSIF v_old_adj AND v_new_adj AND OLD.quantity<>NEW.quantity THEN
      v_qty_delta := OLD.quantity - NEW.quantity;
    END IF;
  ELSIF TG_OP='DELETE' AND v_old_adj THEN v_qty_delta := OLD.quantity;
  END IF;

  UPDATE warehouse_stock SET qty_flappy=v_flappy, qty_total=qty_total+v_qty_delta
    WHERE tenant_id=v_tenant AND product_name=v_product;

  -- Post stock_movements (new in v9.1 - Blueprint 6.1)
  v_pid := get_or_create_product_id(v_tenant, COALESCE(NEW.product_name, OLD.product_name));
  IF TG_OP = 'INSERT' THEN
    INSERT INTO stock_movements (tenant_id,product_id,movement_date,direction,quantity,source_table,source_id)
    VALUES (v_tenant,v_pid,COALESCE(NEW.recorded_date,CURRENT_DATE),'out',NEW.quantity,'damaged_stock',NEW.id);
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM stock_movements WHERE source_table='damaged_stock' AND source_id=OLD.id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_warehouse_flappy ON damaged_stock;
CREATE TRIGGER trg_sync_warehouse_flappy
  AFTER INSERT OR UPDATE OR DELETE ON damaged_stock
  FOR EACH ROW EXECUTE FUNCTION sync_warehouse_flappy();

-- Backfill qty_flappy for existing damaged_stock (mirrors v14 backfill, idempotent)
UPDATE warehouse_stock ws
SET qty_flappy = (
  SELECT COALESCE(SUM(ds.quantity),0) FROM damaged_stock ds
  WHERE ds.tenant_id=ws.tenant_id AND ds.product_name=ws.product_name AND ds.status<>'adjusted'
);

-- Returns & Wayback -> stock_movements (Blueprint 6.1 "Approved = stock IN")
CREATE OR REPLACE FUNCTION sync_stock_on_return()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE v_pid UUID;
BEGIN
  v_pid := get_or_create_product_id(
    COALESCE(NEW.tenant_id, OLD.tenant_id),
    COALESCE(NEW.product_name, OLD.product_name));

  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'approved' THEN
      UPDATE warehouse_stock SET qty_total=GREATEST(qty_total-OLD.received_qty,0)
        WHERE tenant_id=OLD.tenant_id AND product_name=OLD.product_name;
      DELETE FROM stock_movements WHERE source_table='returns_wayback' AND source_id=OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.status='approved' AND (TG_OP='INSERT' OR OLD.status<>'approved') THEN
    UPDATE warehouse_stock SET qty_total=qty_total+NEW.received_qty
      WHERE tenant_id=NEW.tenant_id AND product_name=NEW.product_name;
    INSERT INTO stock_movements (tenant_id,product_id,movement_date,direction,quantity,source_table,source_id)
    VALUES (NEW.tenant_id,v_pid,NEW.return_date,'in',NEW.received_qty,'returns_wayback',NEW.id);
  ELSIF TG_OP='UPDATE' AND OLD.status='approved' AND NEW.status<>'approved' THEN
    UPDATE warehouse_stock SET qty_total=GREATEST(qty_total-OLD.received_qty,0)
      WHERE tenant_id=NEW.tenant_id AND product_name=OLD.product_name;
    DELETE FROM stock_movements WHERE source_table='returns_wayback' AND source_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_stock_on_return ON returns_wayback;
CREATE TRIGGER trg_sync_stock_on_return
  AFTER INSERT OR UPDATE OR DELETE ON returns_wayback
  FOR EACH ROW EXECUTE FUNCTION sync_stock_on_return();


-- ============================================================================
-- S7. EMPTIES LOG two-directional rewrite (Blueprint 3.11, 6.1)
-- ============================================================================

-- Add new columns to existing empties_log (hidden-not-removed pattern)
ALTER TABLE empties_log
  ADD COLUMN IF NOT EXISTS direction       TEXT DEFAULT 'shop_to_distribution'
    CHECK (direction IN ('shop_to_distribution','distribution_to_ccbpl')),
  ADD COLUMN IF NOT EXISTS ccbpl_reference TEXT;

-- shop_id nullable for distribution->ccbpl rows
ALTER TABLE empties_log ALTER COLUMN shop_id DROP NOT NULL;

ALTER TABLE empties_log DROP CONSTRAINT IF EXISTS chk_empties_log_shop_required;
ALTER TABLE empties_log ADD CONSTRAINT chk_empties_log_shop_required
  CHECK (direction = 'distribution_to_ccbpl' OR shop_id IS NOT NULL);

ALTER TABLE empties_log DROP CONSTRAINT IF EXISTS chk_empties_log_ccbpl_required;
ALTER TABLE empties_log ADD CONSTRAINT chk_empties_log_ccbpl_required
  CHECK (direction = 'shop_to_distribution' OR ccbpl_reference IS NOT NULL);

-- Rebuild empties_on_hand to respect direction
DROP VIEW IF EXISTS empties_on_hand;
CREATE OR REPLACE VIEW empties_on_hand WITH (security_invoker = TRUE) AS
SELECT
  tenant_id,
  product_name,
  SUM(CASE WHEN direction='shop_to_distribution' THEN quantity
           WHEN direction='distribution_to_ccbpl'  THEN -quantity
           ELSE quantity END)  AS qty_on_hand,
  SUM(deposit_amount)          AS deposit_total
FROM empties_log
GROUP BY tenant_id, product_name;


-- ============================================================================
-- S8. FUEL ENTRIES - odometer-based (Blueprint 3.12, 10.2)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fuel_entries (
  id                  UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID  NOT NULL DEFAULT current_tenant_id() REFERENCES tenants(id) ON DELETE CASCADE,
  truck_no            TEXT  NOT NULL,
  driver_name         TEXT,
  entry_date          DATE  NOT NULL DEFAULT CURRENT_DATE,
  initial_reading     NUMERIC(10,1) NOT NULL,
  final_reading       NUMERIC(10,1) NOT NULL,
  distance_covered    NUMERIC(10,1) GENERATED ALWAYS AS (final_reading - initial_reading) STORED,
  fuel_liters         NUMERIC(8,2)  NOT NULL,
  amount              NUMERIC(12,2) NOT NULL,
  efficiency_km_per_l NUMERIC(6,2)  GENERATED ALWAYS AS (
    CASE WHEN fuel_liters > 0 THEN (final_reading - initial_reading) / fuel_liters ELSE NULL END
  ) STORED,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_fuel_readings CHECK (final_reading >= initial_reading)
);
CREATE INDEX IF NOT EXISTS idx_fuel_entries_tenant ON fuel_entries(tenant_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_fuel_entries_truck  ON fuel_entries(tenant_id, truck_no);
ALTER TABLE fuel_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fuel_entries_owner_all ON fuel_entries;
CREATE POLICY fuel_entries_owner_all ON fuel_entries FOR ALL
  TO authenticated
  USING  (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()));


-- ============================================================================
-- S9. SCHEME INCOME (Blueprint 11.1) - missing from all four individual files
-- ============================================================================

CREATE TABLE IF NOT EXISTS scheme_income (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID  NOT NULL DEFAULT current_tenant_id() REFERENCES tenants(id) ON DELETE CASCADE,
  scheme_type  TEXT  NOT NULL CHECK (scheme_type IN
                 ('cpo','customer_suc','free_sampling','leakage_burst_incentive',
                  'red_box','target_incentive','trade_promo','other')),
  description  TEXT,
  amount       NUMERIC(12,2) NOT NULL,
  income_month DATE          NOT NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scheme_income_tenant ON scheme_income(tenant_id, income_month);
ALTER TABLE scheme_income ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scheme_income_owner_all ON scheme_income;
CREATE POLICY scheme_income_owner_all ON scheme_income FOR ALL
  TO authenticated
  USING  (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()));


-- ============================================================================
-- S10. SALARY HEAD READ-ONLY VIEW (Blueprint 10.1)
--      Derived from payroll_runs - no more manual Salary entry in Agency Expenses
-- ============================================================================

CREATE OR REPLACE VIEW salary_head_view WITH (security_invoker = TRUE) AS
SELECT
  pr.tenant_id,
  e.employee_code,
  e.full_name                              AS name,
  e.role,
  TO_CHAR(pr.salary_month, 'Month')        AS month,
  EXTRACT(YEAR FROM pr.salary_month)::INT  AS year,
  pr.net_payable,
  'Payroll Run auto'::TEXT                 AS source
FROM payroll_runs pr
JOIN employees e ON e.id = pr.employee_id;

-- ============================================================================
-- S11. REPORTING VIEWS (Blueprint 9.1, 9.2, 11.2)
-- ============================================================================

-- 11a. Stock Ledger - transaction detail per product (Blueprint 9.1 View 1)
CREATE OR REPLACE VIEW stock_ledger_view WITH (security_invoker = TRUE) AS
SELECT
  sm.tenant_id,
  sm.movement_date                       AS date,
  p.product_name,
  sm.direction,
  sm.source_table,
  sm.source_id,
  sm.quantity,
  sm.amount,
  SUM(CASE WHEN sm.direction='in' THEN sm.quantity ELSE -sm.quantity END)
    OVER (PARTITION BY sm.tenant_id, sm.product_id
          ORDER BY sm.movement_date, sm.created_at, sm.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance
FROM stock_movements sm
JOIN products p ON p.id = sm.product_id;

-- 11b. Stock Balance by Level - period rollup (Blueprint 9.1 View 2)
CREATE OR REPLACE VIEW stock_balance_by_level WITH (security_invoker = TRUE) AS
SELECT
  sm.tenant_id,
  p.product_name,
  SUM(CASE WHEN sm.direction='in'  THEN sm.quantity ELSE 0 END) AS qty_in,
  SUM(CASE WHEN sm.direction='out' THEN sm.quantity ELSE 0 END) AS qty_out,
  SUM(CASE WHEN sm.direction='in'  THEN sm.quantity ELSE -sm.quantity END) AS net_balance
FROM stock_movements sm
JOIN products p ON p.id = sm.product_id
GROUP BY sm.tenant_id, p.product_name;

-- 11c. Sale/Purchase Summary (Blueprint 9.1 View 3)
CREATE OR REPLACE VIEW sale_purchase_summary WITH (security_invoker = TRUE) AS
SELECT
  sil.tenant_id,
  p.product_name,
  SUM(CASE WHEN sil.invoice_type='purchase' THEN sil.qty          ELSE 0 END) AS purchase_qty,
  SUM(CASE WHEN sil.invoice_type='purchase' THEN sil.net_bill_amount ELSE 0 END) AS purchase_amt,
  SUM(CASE WHEN sil.invoice_type='return'   THEN sil.qty          ELSE 0 END) AS pur_return_qty,
  SUM(CASE WHEN sil.invoice_type='return'   THEN sil.net_bill_amount ELSE 0 END) AS pur_return_amt,
  SUM(CASE WHEN sil.invoice_type='purchase' THEN sil.qty ELSE -sil.qty END)   AS net_pur_qty,
  SUM(CASE WHEN sil.invoice_type='purchase' THEN sil.net_bill_amount
                                            ELSE -sil.net_bill_amount END)    AS net_pur_amt,
  COALESCE(SUM(ili.quantity), 0)                                              AS sale_qty
FROM sell_in_lines sil
JOIN products p ON p.id = sil.product_id
LEFT JOIN invoice_line_items ili
  ON ili.tenant_id = sil.tenant_id AND ili.product_id = sil.product_id
GROUP BY sil.tenant_id, p.product_name;

-- 11d. Empty Ledger (Blueprint 9.1 View 4)
CREATE OR REPLACE VIEW empty_ledger_view WITH (security_invoker = TRUE) AS
SELECT
  el.tenant_id,
  el.log_date                                           AS date,
  el.product_name,
  el.direction,
  COALESCE(s.shop_name, el.ccbpl_reference)            AS reference,
  el.invoice_id,
  el.quantity,
  SUM(CASE WHEN el.direction='shop_to_distribution' THEN el.quantity ELSE -el.quantity END)
    OVER (PARTITION BY el.tenant_id, el.product_name
          ORDER BY el.log_date, el.created_at, el.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance
FROM empties_log el
LEFT JOIN shops s ON s.id = el.shop_id;

-- 11e. Empty Balance (Blueprint 9.1 View 5)
CREATE OR REPLACE VIEW empty_balance_view WITH (security_invoker = TRUE) AS
SELECT
  tenant_id,
  product_name,
  SUM(CASE WHEN direction='shop_to_distribution' THEN quantity ELSE -quantity END) AS qty_on_hand,
  SUM(deposit_amount) AS deposit_total
FROM empties_log
GROUP BY tenant_id, product_name;

-- 11f. WH Tax Summary (Blueprint 9.2)
CREATE OR REPLACE VIEW wh_tax_summary WITH (security_invoker = TRUE) AS
SELECT
  sio.tenant_id,
  sio.transaction_date  AS date,
  sio.po_no             AS voucher,
  'CCBPL'::TEXT         AS vendor,
  sio.company_inv_no    AS ccbpl_invoice_no,
  SUM(sil.wh_tax_amount) AS wh_tax_total
FROM sell_in_orders sio
JOIN sell_in_lines sil ON sil.sell_in_order_id = sio.id
WHERE sio.status IN ('stock_arrived','on_credit','billed')
GROUP BY sio.tenant_id, sio.transaction_date, sio.po_no, sio.company_inv_no;

-- 11g. Trial Balance (Blueprint 9.2)
CREATE OR REPLACE VIEW trial_balance WITH (security_invoker = TRUE) AS
SELECT
  le.tenant_id,
  coa.code,
  coa.category,
  coa.label,
  SUM(le.debit)                   AS total_debit,
  SUM(le.credit)                  AS total_credit,
  SUM(le.debit) - SUM(le.credit)  AS net_balance
FROM ledger_entries le
JOIN chart_of_accounts coa ON coa.code = le.account_code
GROUP BY le.tenant_id, coa.code, coa.category, coa.label;

-- 11h. Income Statement helper view (Blueprint 11.2)
--      Aggregates scheme_income by month for reporting layer
CREATE OR REPLACE VIEW income_statement_scheme_view WITH (security_invoker = TRUE) AS
SELECT
  tenant_id,
  DATE_TRUNC('month', income_month) AS month,
  scheme_type,
  SUM(amount)                        AS total_amount
FROM scheme_income
GROUP BY tenant_id, DATE_TRUNC('month', income_month), scheme_type;


-- ============================================================================
-- S12. REALTIME
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE payroll_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE bank_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE sell_in_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE fuel_entries;


-- ============================================================================
-- S13. DEPRECATION NOTES (hidden-not-removed, Blueprint 14)
-- ============================================================================
-- ccbpl_purchases, ccbpl_ledger : retained, Tab 6 Page 2 hidden
-- late_deliveries                : retained, Late Delivery Tracker hidden
-- invoices.delivery_status       : column retained, defaults 'delivered', unused
-- warehouse_stock.qty_reserved   : column retained, defaults 0, hidden from UI
-- agency_expenses salary rows    : retained; salary_head_view (S10) is new source
-- Nothing is dropped. Any of these can be re-enabled per-tenant from Admin Panel.

-- ============================================================================
-- END OF MDOS v9.1 CONSOLIDATED UPGRADE
-- ============================================================================
