# MDOS Blueprint — v9.1 (Ittehad-Informed Upgrade, Consolidated)

**Confidential — Internal Engineering Document — Not for External Distribution**

> This is the single, consolidated blueprint. It supersedes both `MDOS_Blueprint_v9.md` and `MDOS_Blueprint_v9_Addendum.md` — everything from both is folded in here, in place, plus this round's changes (Reserved field removed, Stock Balance by Level, Sale/Purchase Summary). Treat this file as the current source of truth; the two prior files remain as historical record only.

---

## 0. Executive Summary

v9.1 is still governed by one decision: **domain-first schema and UX everywhere the user works, backed by one small, hidden internal ledger for financial integrity** (§1). Everything below is downstream of that.

Across the three rounds that produced this version, v9.1:

1. Adds a formal **Employee Management** tab (Directory, Payroll SOPs, Payroll Runs), with schema-level guard-rails closing the two worst BSS-92 findings — unbounded loan exposure and off-books guard wages (§7).
2. Redesigns **Sell In** with BSS-92's line-item richness but an explicit, computed Net Bill formula (§8), now a **4-stage lifecycle** (In Progress → Stock Arrived → On Credit → Billed) that draws payment from a specific named **Bank Account** (§3.10, §6.3).
3. **Stopped tracking delivery as a separate workflow.** An invoice now represents a completed, delivered sale the moment it's recorded — matching how Ittehad's Sale Form actually works in the field. Delivery Exceptions and DM Cash Summary are hidden, not deleted (§5, §9, §15).
4. Gives every bank account its own tracked balance, closing the real cash cycle: **Cash Deposit Register → Bank Account → Sell In payment** (§3.8, §9.2).
5. Fixed the one real Head-sync gap found on audit: **Agency Expenses' Salary Head was a second, disconnected source of truth** next to Payroll — it's now a read-only view derived from Payroll Runs (§11.1).
6. Redesigned the **Fuel Head** around odometer readings and real refuel dates instead of monthly batches, matching how trucks are actually refueled (§11.2).
7. **Removed the "Reserved" stock concept.** With delivery no longer tracked as a separate stage, there's nothing left to reserve — Stock Levels is now one honest number (§6.1).
8. Added **Stock Balance by Level** and **Sale/Purchase Summary** as real, exportable reports, matching two more of Ittehad's own report types (§10.1).
9. Added **WH Tax Summary** and **Shop Statement** as new exportable reports, direct ports of two more Ittehad reports you sent (§10.2, §10.3).
10. Split Empties Log into two tracked directions — Shop → Distribution and Distribution → CCBPL — in one head (§6.1).

Nothing here removes a capability you had. Superseded pages are feature-flagged off, never deleted (§15).

---

## 1. The Core Decision: Accounts-Ledger vs. Domain-Model

*(Unchanged from v9 — reproduced here so this document is self-contained.)*

**Ittehad's accounts-based model** treats the business as one thing: a 5-level chart of accounts, 1,769 final accounts observed live. Its strength is reconciliation guarantee — every number comes from the same ledger. Its documented failures: unbounded employee loans (a loan is just a posting with no cap tied to what someone earns), guard wages hiding inside a generic "Advances" account, and Net Bill formulas nobody could reconstruct — all symptoms of a ledger row not knowing *what kind* of money it represents.

**MDOS's domain model** treats the business as named things — shops, invoices, stock, employees — with schema-enforced meaning. Its own credit-collection design (payments applied to one specific invoice, oldest first) already solved a problem Ittehad's Payment Form never did: a BSS-92 receipt voucher can be split across shop accounts with no enforced link back to which invoice it settles. MDOS ties every rupee to an `invoice_id`. That design is kept as-is.

**Verdict, unchanged: hybrid.** The user-facing product stays exactly as clean as MDOS always was. Underneath, every money-moving event writes one matching row to a hidden `ledger_entries` table against a **fixed ~20-account chart of accounts**, enough for a real Trial Balance and Income Statement without ever becoming Ittehad's 1,769-account maze. Wherever the accounts model's flexibility caused a real failure (loans, guard wages), v9.1 replaces it with a constrained domain object instead of a free-form posting.

---

## 2. Tech Stack

| Piece | Technology | Notes |
|---|---|---|
| Frontend | Next.js 14 (App Router) | Unchanged |
| Styling | Tailwind CSS | Unchanged |
| Database | Supabase (PostgreSQL) | `pg_cron` drives the daily automated backup job and the ledger/stock-movement consistency checks |
| Login | Clerk | Unchanged |
| Hosting | Vercel | Unchanged |
| CSV / Excel Import | PapaParse | Unchanged |
| PDF Generation | @react-pdf/renderer | Used for Payslips, Shop Statements, and all report exports that support PDF |
| Excel Export | xlsx (SheetJS) | Every listing and report page keeps the CSV + Excel export pattern |
| Internal Ledger Engine | Postgres triggers + Supabase Edge Functions | Writes `ledger_entries` (money) and `stock_movements` (inventory) on every qualifying domain event; neither is a page in primary navigation |

**Multi-tenancy remains foundational.** Every table in this document — old and new — carries `tenant_id` and is governed by `FOR ALL USING (tenant_id = current_tenant_id())` Row Level Security. Nothing in this upgrade weakens that boundary.

---

## 3. Database Schema

### 3.1 `chart_of_accounts` — Fixed, ~20 Accounts, Never User-Editable

| Code | Category | Label |
|---|---|---|
| CASH | Asset | Cash in Hand |
| BANK | Asset | Bank Account (aggregate of `bank_accounts`) |
| AR_CREDIT | Asset | Accounts Receivable — Credit Shops |
| STOCK | Asset | Warehouse Stock |
| EMP_ADVANCES | Asset | Employee Advances / Loans Receivable |
| AP_CCBPL | Liability | CCBPL Payable |
| DEPOSITS_PAYABLE | Liability | Shop Empties Deposits Payable |
| PENALTIES_PAYABLE | Liability | CCBPL Penalties Payable |
| REV_SALES | Income | Sales Revenue |
| REV_INCENTIVE | Income | Trade Incentive Income |
| EXP_SALARY | Expense | Salary Expense |
| EXP_FUEL | Expense | Fuel Expense |
| EXP_BILLS | Expense | Bills Expense |
| EXP_ENTERTAINMENT | Expense | Entertainment Expense |
| EXP_PETTY | Expense | Petty Expense |
| EXP_PENALTIES | Expense | Penalties Expense |
| EXP_MISC | Expense | Agency Misc. Expense |
| CAPITAL | Equity | Owner's Capital |

### 3.2 `ledger_entries` — Hidden Financial Ledger

```sql
CREATE TABLE ledger_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  account_code  TEXT NOT NULL REFERENCES chart_of_accounts(code),
  entry_date    DATE NOT NULL DEFAULT current_date,
  debit         NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit        NUMERIC(12,2) NOT NULL DEFAULT 0,
  source_table  TEXT NOT NULL,
  source_id     UUID NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY ledger_entries_owner_all ON ledger_entries FOR ALL USING (tenant_id = current_tenant_id());
```

### 3.3 `stock_movements` — Hidden Inventory Ledger *(new in v9.1)*

Exactly the same pattern as `ledger_entries`, but for physical stock instead of money. Every stock-affecting event across the system — Sell In arrival, an invoice's line items, Damaged Stock, Returns & Wayback, both directions of Empties Log, and Stock Count adjustments — writes one row here. This is what powers the new Stock Balance by Level and Sale/Purchase Summary reports (§10.1) without inventing a second, hand-maintained stock total anywhere.

```sql
CREATE TABLE stock_movements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  product_id    UUID NOT NULL REFERENCES products(id),
  movement_date DATE NOT NULL DEFAULT current_date,
  direction     TEXT NOT NULL CHECK (direction IN ('in','out')),
  quantity      NUMERIC(12,2) NOT NULL,
  amount        NUMERIC(14,2),          -- rupee value of this movement, where applicable (purchase/sale)
  source_table  TEXT NOT NULL,          -- 'sell_in_lines' | 'invoice_line_items' | 'damaged_stock' |
                                         -- 'returns_wayback' | 'empties_log' | 'stock_count_adjustments'
  source_id     UUID NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_movements_owner_all ON stock_movements FOR ALL USING (tenant_id = current_tenant_id());
```

### 3.4 `employees`

```sql
CREATE TABLE employees (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  employee_code     TEXT NOT NULL,
  name              TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('preseller','delivery_man','driver','loader','guard','office','other')),
  phone             TEXT,
  nic               TEXT,
  address           TEXT,
  joining_date      DATE,
  active            BOOLEAN NOT NULL DEFAULT true,
  basic_salary      NUMERIC(12,2) NOT NULL DEFAULT 0,
  bank_name         TEXT,
  bank_account      TEXT,
  eobi_enrolled     BOOLEAN DEFAULT false,      -- retained in schema, hidden from UI (§7.1)
  social_security   BOOLEAN DEFAULT false,      -- retained in schema, hidden from UI (§7.1)
  house_owner       BOOLEAN DEFAULT false,
  emergency_contact TEXT,
  emergency_phone   TEXT,
  reference_1_name  TEXT,
  reference_1_phone TEXT,
  reference_2_name  TEXT,
  reference_2_phone TEXT,
  linked_route_id   UUID REFERENCES routes(id),
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, employee_code)
);
```

> Every paid person — including a guard — gets a real row here. This closes BSS-92's off-books-wages finding. `reference_1_*`/`reference_2_*` mirror Ittehad's own Employee Info screen ("1st Reffer./Refr. Ph#", "2nd Reffer./Refr. Ph#") — a referral-accountability pair the original audit flagged as present in Ittehad but undiscussed; MDOS now adopts it directly (§7.1). `bank_account` doubles as the "Account Number" field requested this round — no new column needed, just surfaced under that label in the UI.

### 3.5 `employee_increments`

```sql
CREATE TABLE employee_increments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  employee_id    UUID NOT NULL REFERENCES employees(id),
  reason         TEXT NOT NULL,
  amount         NUMERIC(12,2) NOT NULL,
  effective_date DATE NOT NULL,
  operator       TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);
```

### 3.6 `employee_loans` — The Guard-Rail

```sql
CREATE TABLE employee_loans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  employee_id         UUID NOT NULL REFERENCES employees(id),
  principal_amount    NUMERIC(12,2) NOT NULL,
  monthly_installment NUMERIC(12,2) NOT NULL,
  installment_cap_pct NUMERIC(5,2) NOT NULL DEFAULT 30,
  outstanding_balance NUMERIC(12,2) NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','override_active')),
  override_reason     TEXT,
  issued_date         DATE NOT NULL DEFAULT current_date,
  created_at          TIMESTAMPTZ DEFAULT now()
);
-- Application rule: IF monthly_installment > basic_salary * installment_cap_pct / 100
--   THEN require override_reason, status = 'override_active'  ELSE status = 'active'
```

### 3.7 `payroll_sops`

```sql
CREATE TABLE payroll_sops (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  name                    TEXT NOT NULL,
  date_from               DATE NOT NULL,
  date_to                 DATE NOT NULL,
  shift_start             TIME NOT NULL,
  shift_end               TIME NOT NULL,
  morning_grace_minutes   INTEGER DEFAULT 10,
  grace_limit_days        INTEGER DEFAULT 3,
  grace_deduction_days    NUMERIC(3,1) DEFAULT 1,
  grace_limit_repeats_monthly BOOLEAN NOT NULL DEFAULT true,
  after_grace_deduct_days NUMERIC(3,1) DEFAULT 1,
  stack_deductions        BOOLEAN NOT NULL DEFAULT false,
  holiday_bonus_days      NUMERIC(3,1) DEFAULT 1,
  thumb_miss_deduct_days  NUMERIC(3,1) DEFAULT 1,
  biometric_enabled       BOOLEAN NOT NULL DEFAULT false,
  short_leave_start       TIME,
  before_sl_deduct_days   NUMERIC(3,1) DEFAULT 1,
  short_leave_limit_days  NUMERIC(3,1) DEFAULT 1,
  after_sl_deduct_days    NUMERIC(3,1) DEFAULT 2,
  holidays                JSONB,
  created_at              TIMESTAMPTZ DEFAULT now()
);
```

> **Re-verified against the real Ittehad SOP screen this round — four fields were missing and are added above:** `grace_limit_repeats_monthly` (Ittehad's "REPEAT" checkbox — whether the 3-grace-day allowance resets every month or is a one-time allowance for the whole SOP validity window), `holiday_bonus_days` (extra pay for working on a designated holiday), `thumb_miss_deduct_days` (a separate deduction specifically for a missed biometric scan, distinct from a general lateness deduction), and `biometric_enabled` (Ittehad's "Biomatric Payslip" toggle — whether this SOP actually depends on attendance-machine data at all; it was switched off in the audited screenshot, meaning that SOP profile never used biometric attendance). Without these, Payroll Runs (§7.3) would have silently ignored holiday pay and thumb-miss penalties that Ittehad's own system accounts for.
>
> `stack_deductions` defaults **off**. Ittehad let one late arrival trigger a grace-window deduction *and* a separate after-grace deduction — two penalties compounding automatically. Off by default means one late day costs one deduction; turning it on restores the stricter double-penalty rule deliberately, not by accident.

### 3.8 `payroll_runs` (Payslips)

```sql
CREATE TABLE payroll_runs (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),
  employee_id               UUID NOT NULL REFERENCES employees(id),
  sop_id                    UUID REFERENCES payroll_sops(id),
  salary_month              DATE NOT NULL,
  working_days              INTEGER NOT NULL,
  basic_salary               NUMERIC(12,2) NOT NULL,
  bonus_amount              NUMERIC(12,2) DEFAULT 0,
  absent_deduction          NUMERIC(12,2) DEFAULT 0,
  sop_violation_deduction   NUMERIC(12,2) DEFAULT 0,
  net_salary                NUMERIC(12,2) GENERATED ALWAYS AS
                             (basic_salary + bonus_amount - absent_deduction - sop_violation_deduction) STORED,
  loan_installment_due      NUMERIC(12,2) DEFAULT 0,
  loan_installment_applied  NUMERIC(12,2) DEFAULT 0,
  net_payable               NUMERIC(12,2) GENERATED ALWAYS AS
                             (GREATEST(basic_salary + bonus_amount - absent_deduction
                               - sop_violation_deduction - loan_installment_applied, 0)) STORED,
  balance_carried           NUMERIC(12,2) DEFAULT 0,
  operator                  TEXT,
  computer_voucher          TEXT,
  created_at                TIMESTAMPTZ DEFAULT now()
);
```

> **`net_payable` can never go negative — it's a `GREATEST(..., 0)` generated column.** Any installment amount that would push it below zero becomes `balance_carried` instead: a visible, reviewable figure on the payslip, not a silent negative balance. This is the exact fix for the BSS-92 case where employees showed Net Payable ₨0 and running balances past -₨1 lakh with nothing flagging it.

### 3.9 `bank_accounts`

```sql
CREATE TABLE bank_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  bank_name       TEXT NOT NULL,
  account_title   TEXT NOT NULL,
  account_number  TEXT,
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY bank_accounts_owner_all ON bank_accounts FOR ALL USING (tenant_id = current_tenant_id());
```

> Mirrors what the BSS-92 audit found in Ittehad's own Chart of Accounts — multiple named bank accounts (MCB, HBL, Askari, Meezan) under one "Cash and Bank" branch — but as a clean domain table with a Heads-style UI, not a searchable account tree.

### 3.10 `sell_in_orders` / `sell_in_lines`

```sql
CREATE TABLE sell_in_orders (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id),
  po_no                       TEXT NOT NULL,
  company_inv_no              TEXT,
  vehicle_no                  TEXT,
  transaction_date            DATE NOT NULL DEFAULT current_date,
  status                      TEXT NOT NULL DEFAULT 'in_progress'
                               CHECK (status IN ('in_progress','stock_arrived','on_credit','billed')),
  credit_due_date              DATE,             -- set when status = 'on_credit'; CCBPL's agreed payment deadline
  paid_from_bank_account_id   UUID REFERENCES bank_accounts(id),
  billed_date                 DATE,
  created_at                  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sell_in_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  sell_in_order_id  UUID NOT NULL REFERENCES sell_in_orders(id),
  product_id        UUID NOT NULL REFERENCES products(id),
  invoice_type      TEXT NOT NULL DEFAULT 'purchase' CHECK (invoice_type IN ('purchase','return')),
  packing_qty       NUMERIC(10,2) NOT NULL,
  qty               NUMERIC(10,2) NOT NULL,
  rate              NUMERIC(12,2) NOT NULL,
  wh_tax_pct        NUMERIC(5,2) NOT NULL DEFAULT 0,
  unit_commission   NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_scheme       NUMERIC(12,2) NOT NULL DEFAULT 0,
  bill_amount       NUMERIC(14,2) GENERATED ALWAYS AS (rate * qty) STORED,
  wh_tax_amount     NUMERIC(14,2) GENERATED ALWAYS AS (rate * qty * wh_tax_pct / 100) STORED,
  commission_amount NUMERIC(14,2) GENERATED ALWAYS AS (unit_commission * (qty / NULLIF(packing_qty,0))) STORED,
  scheme_amount     NUMERIC(14,2) GENERATED ALWAYS AS (unit_scheme * (qty / NULLIF(packing_qty,0))) STORED,
  net_bill_amount   NUMERIC(14,2) GENERATED ALWAYS AS
                      (rate * qty - (rate * qty * wh_tax_pct / 100)
                       - (unit_commission * (qty / NULLIF(packing_qty,0)))
                       - (unit_scheme * (qty / NULLIF(packing_qty,0)))) STORED,
  created_at        TIMESTAMPTZ DEFAULT now()
);
```

### 3.11 `empties_log`

```sql
-- Product Catalog gains one new flag. Only products where this is true (RGB bottles, Pallets,
-- Plastic Sheets, by default) can be selected in Empties Log's product picker (§6.1).
ALTER TABLE products ADD COLUMN is_returnable BOOLEAN NOT NULL DEFAULT false;
```

```sql
CREATE TABLE empties_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  direction       TEXT NOT NULL DEFAULT 'shop_to_distribution'
                   CHECK (direction IN ('shop_to_distribution','distribution_to_ccbpl')),
  shop_id         UUID REFERENCES shops(id),          -- required when direction = shop_to_distribution
  invoice_id      UUID REFERENCES invoices(id),
  ccbpl_reference TEXT,                                -- required when direction = distribution_to_ccbpl
  product_id      UUID NOT NULL REFERENCES products(id),
  quantity        NUMERIC(10,2) NOT NULL,
  deposit_amount  NUMERIC(12,2) DEFAULT 0,
  log_date        DATE NOT NULL DEFAULT current_date,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 3.12 `fuel_entries`

```sql
CREATE TABLE fuel_entries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  vehicle_id          UUID NOT NULL REFERENCES vehicles(id),
  driver_employee_id  UUID REFERENCES employees(id),
  entry_date          DATE NOT NULL DEFAULT current_date,
  initial_reading     NUMERIC(10,1) NOT NULL,
  final_reading       NUMERIC(10,1) NOT NULL,
  distance_covered    NUMERIC(10,1) GENERATED ALWAYS AS (final_reading - initial_reading) STORED,
  fuel_liters         NUMERIC(8,2) NOT NULL,
  amount              NUMERIC(12,2) NOT NULL,
  efficiency_km_per_l NUMERIC(6,2) GENERATED ALWAYS AS
                       (CASE WHEN fuel_liters > 0 THEN (final_reading - initial_reading) / fuel_liters ELSE NULL END) STORED,
  created_at          TIMESTAMPTZ DEFAULT now()
);
```

### 3.13 `invoices` — Delivery Simplification

```sql
ALTER TABLE invoices ALTER COLUMN delivery_status SET DEFAULT 'delivered';
-- delivery_status column and late_deliveries table remain in schema (v9 §15 "hidden, not removed"
-- rule) but are no longer surfaced or edited anywhere in the UI.
```

### 3.14 `warehouse_stock` — Reserved Field Deprecated

```sql
-- "Reserved" existed to hold stock back for invoices that were dispatched but not yet confirmed
-- delivered. Since every invoice is now recorded as delivered at creation (§3.13), there is
-- nothing left to reserve stock against.
ALTER TABLE warehouse_stock ALTER COLUMN qty_reserved SET DEFAULT 0;
-- Column retained (hidden-not-removed), no longer written to by any trigger, no longer shown in the UI.
-- The Stock Levels page now shows a single qty_available figure only (§6.1).
```

---

## 4. Navigation Model

| # | Tab | Pages |
|---|---|---|
| 1 | **Setup & Masters** | Product Catalog · Shop Directory *(incl. Statement export, §10.3)* · Routes & Beats |
| 2 | **Sales & Credit** | Sales Transactions *(Heads: Invoices / Dispatch & Routes)* · Credit Limits & Balances · Blocked Accounts |
| 3 | **Cash & Bank** | Cash Deposit Register · Bank Accounts |
| 4 | **Inventory** | Warehouse Stock *(Heads: Stock Levels / Damaged Stock / Returns & Wayback / Empties Log)* · Stock Count & Audit · Sell In |
| 5 | **Backups** | Automated Backups & Recovery |
| 6 | **Reports & Alerts** | Stock Reports *(Views: Stock Ledger · Stock Balance by Level · Sale/Purchase Summary · Empty Ledger · Empty Balance · Discrepancies)* · Financial Reports *(incl. WH Tax Summary)* · Real-Time Alerts Feed |
| 7 | **Expenses** | Agency Expenses *(Heads: Salary [read-only] / Fuel / Bills / Entertainment / Petty / Penalties)* · Expense Sheet |
| 8 | **Income Management** | Income Margin *(incl. Scheme Type)* · Income Statement |
| 9 | **Employee Management** | Employee Directory · Payroll Policies (SOPs) · Payroll Runs |
| — | **Settings** *(utility, not numbered)* | unchanged — §13 |

The Admin Panel is unchanged in structure and continuity — it still governs every tenant's tab/page flags.

---

## 5. Sales Transactions — Simplified to Two Heads

Ittehad's Sale Stock Entry Form doesn't have a separate dispatch-then-confirm workflow — entering the sale voucher *is* the delivery record. Sales Transactions now matches that: **Delivery Exceptions is hidden**, and every invoice defaults to delivered the moment it's saved.

**Sales Transactions — Head: Invoices**

| Invoice No | Shop | Preseller | Products | Invoice Date | Due Date | Type | Grand Total | Payment | DM | Action |
|---|---|---|---|---|---|---|---|---|---|---|
| INV-001 | Ahmed Store | Rizwan | Coke 1.5L×20, Sprite×10 | 1 Jan | 25 Jan | Credit | 4,472.40 | Outstanding | Khalid | Edit / Delete |
| INV-002 | Bilal Mart | Mehmood | Coke 330ml×50 | 1 Jan | — | Cash | 6,000.00 | Paid | Asif | Edit / Delete |

No **Delivery** column — there's nothing left to track there.

**Sales Transactions — Head: Dispatch & Routes** (route/truck logistics planning — kept; this is about who's carrying what today, not about tracking whether a specific invoice was successfully delivered)

| Truck No | DM Name | Route/Beat | # Invoices | Invoice Total | Cash Exp. | Credit Total | Date | Status | Action |
|---|---|---|---|---|---|---|---|---|---|
| TRK-01 | Khalid Mahmood | Gulshan Beat | 12 | 63,000 | 18,000 | 45,000 | 3 Jan | In Progress | Edit / Delete |

---

## 6. Inventory

### 6.1 Warehouse Stock

**Head: Stock Levels** — Reserved removed, per this round's instruction. With no separate delivery stage, there's nothing to hold stock back for; a product is either in stock or it isn't.

| Product | Stock Qty | Reorder Flag | Action |
|---|---|---|---|
| Coke 1.5L | 850 | — | Edit / Delete |
| Sprite 1L | 45 | Low Stock | Edit / Delete |

**Head: Damaged Stock** — recording an entry here now explicitly **deducts that quantity from Stock Qty** (§9.1 Stock Ledger logs a matching `out` movement the moment the row is saved — damaged stock is stock you no longer have to sell).

| Product | Qty | Damage Type | Batch | Recorded | Webspace Ref | Status | Action |
|---|---|---|---|---|---|---|---|
| Coke 1.5L | 15 | Leaking caps | B-2024-11 | 3 Jan | WS-0441 | Complaint Filed | Edit / Delete |

**Head: Returns & Wayback** — this is for wrong/excess/damaged *product* returns from shops (the empties cycle below is a separate, distinct flow). Marking a return **Approved** now explicitly **increases Stock Qty** by the returned quantity (§9.1 logs a matching `in` movement) — the product is physically back in the warehouse and sellable again. A return still in **Pending** status has no stock effect yet, so a return that later gets rejected never inflates stock.

| Shop | Product | Orig Invoice | Rcvd Qty | Status | Return Date | Action |
|---|---|---|---|---|---|---|
| Bilal Mart | Coke 1.5L | INV-021 | 10 | Approved | 5 Jan | Edit / Delete |

**Head: Empties Log** — now tracks two directions in one table, with a filter toggle (All / Shop → Distribution / Distribution → CCBPL) at the top of the head. **The product picker only lists products where Product Catalog's "Is Return" checkbox is marked** (`products.is_returnable = true`, §3.11) — by default RGB bottles, Pallets, and Plastic Sheets. A regular beverage SKU simply never appears as a selectable option here, so there's no way to accidentally log a sellable product as an empty.

| Direction | Shop / CCBPL Ref | Invoice No | Product | Quantity | Deposit Amount | Log Date | Action |
|---|---|---|---|---|---|---|---|
| Shop → Distribution | Ahmed Store | INV-001 | Coke 1.5L RGB | 20 | 400.00 | 1 Jan | Edit / Delete |
| Shop → Distribution | — | — | Pallets | 6 | 0.00 | 1 Jan | Edit / Delete |
| Distribution → CCBPL | PO-2026-058 | — | Coke 1.5L RGB | 500 | — | 17 Jul | Edit / Delete |
| Distribution → CCBPL | PO-2026-058 | — | Pallets | 40 | — | 17 Jul | Edit / Delete |

| Direction | Stock Effect | Shop Field | CCBPL Reference Field |
|---|---|---|---|
| Shop → Distribution | Empties qty **+= Quantity** | Required | Hidden |
| Distribution → CCBPL | Empties qty **−= Quantity** | Hidden | Required |

### 6.2 Stock Count / Audit (unchanged)

| Audit Date | Scheduled | Products Counted | Discrepancies | Status | Action |
|---|---|---|---|---|---|
| 5 Jan | 5 Jan | 12 products | 2 | Completed | Edit / Delete / View Report |

### 6.3 Sell In (formerly "Purchasing from CCBPL")

Now a **4-stage lifecycle**: In Progress → Stock Arrived → **On Credit** → **Billed**. Distributors sometimes get stock from CCBPL on agreed credit terms rather than paying immediately — **On Credit** captures that explicitly with a due date, separate from the final payment step.

| PO No | Company Inv # | Net Bill | Status | Credit Due Date | Pay From | Action |
|---|---|---|---|---|---|---|
| PO-2026-058 | 9023047338 | 7,98,030 | Billed | — | Meezan Bank (Imran) | View |
| PO-2026-061 | 9023051022 | 4,20,150 | On Credit | 15 Aug | — | **Mark Billed** |
| PO-2026-063 | 9023055410 | 3,10,000 | Stock Arrived | — | — | **Mark On Credit** / **Mark Billed** |

A PO can skip **On Credit** and go straight from Stock Arrived to Billed if it's paid immediately — the stage is optional, not mandatory, matching that not every CCBPL delivery comes with extended terms.

**Line items (per PO):**

| Product | Packing | Qty | Rate | Bill | WH Tax % | Unit Comm. | Unit Scheme | Net Bill |
|---|---|---|---|---|---|---|---|---|
| 2000 ML Coke | 6 | 800 | 53.59 | 842,872.00 | 0.1% | 55.00/pack | 0.00 | 798,029.53 |

**Formula (server-computed, matches §3.10's generated columns exactly):**

```
Bill            = Rate × Qty
WH Tax Amount   = Bill × (WH Tax % / 100)
Commission Amt  = Unit Commission × (Qty / Packing)
Scheme Amount   = Unit Scheme × (Qty / Packing)
Net Bill        = Bill − WH Tax Amount − Commission Amt − Scheme Amount
```

**Status workflow:** *In Progress* → no writes to Stock or ledger. *Stock Arrived* → `warehouse_stock` increments, `stock_movements` logs an `in`, ledger posts Debit `STOCK` / Credit `AP_CCBPL` (this is where the payable is actually booked). **On Credit** *(optional)* → no new ledger posting — the `AP_CCBPL` liability from Stock Arrived is already sitting there; this stage only records `credit_due_date`, turning an implicit "we'll pay eventually" into an explicit, trackable deadline. **Billed** → the selected `bank_accounts.current_balance` decreases by `net_bill_amount`, ledger posts Debit `AP_CCBPL` / Credit `BANK`, clearing the payable. (§9.1 walks through this same sequence with a full worked stock example.)

---

## 7. Employee Management

*(Unchanged from v9 — reproduced for completeness.)*

### 7.1 Employee Directory

| Emp Code | Name | Role | Phone | Basic Salary | Bank | Account Number | 1st Reference | 2nd Reference | Route | Status | Action |
|---|---|---|---|---|---|---|---|---|---|---|---|
| EMP-0027 | Rizwan Ali | Preseller | 0300-1234567 | 35,000 | HBL | 01234567890123 | Saqib Naeem | Imran Ali | Gulshan Beat | Active | Edit / Delete |
| EMP-0098 | Afzal Masih | Loader | 0321-9988001 | 67,000 | — | — | Bilal Masih | — | — | Active | Edit / Delete |
| EMP-0113 | Ashraf Bhatti | Guard | 0345-6677889 | 15,000 | — | — | — | — | — | Active | Edit / Delete |

**EOBI and Social Security checkboxes are removed from this page per this round's instruction** — the columns stay in the schema (§3.4, hidden-not-removed) but are no longer shown or editable here.

**Fields:** Name, Role, Phone, NIC, Address, Joining Date, Basic Salary, Bank Name, **Account Number**, House Owner checkbox, Emergency Contact, **1st Reference / 1st Reference Phone**, **2nd Reference / 2nd Reference Phone**, Linked Route (Preseller/DM/Driver only), Photo. **Sub-tab: Increments** (Reason, Amount, Dated, Operator, running totals).

### 7.2 Payroll Policies (SOPs)

**Re-verified this round against the actual Ittehad SOP screen — four fields were missing and are now included** (see §3.7 for the full reasoning): the grace allowance's monthly-repeat behavior, Holiday Bonus days, Thumb Miss Deduct days, and whether the SOP depends on biometric attendance at all.

| SOP Name | Valid From | Valid To | Shift | Grace | Repeats Monthly | Holiday Bonus | Thumb Miss Deduct | Biometric | Stack Deductions | Status | Action |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Standard Warehouse Shift | 1 Jul 26 | 31 Dec 26 | 07:30 AM – 06:30 PM | 10 min / 3 days | Yes | 1 day | 1 day | Off | Off | Active | Edit / Delete |

**Full field list:** Name, Date From/To, Shift Start/End, Morning Grace (minutes), Grace Limit (days), **Repeats Monthly (toggle)**, Grace Deduction (days), After-Grace Deduct (days), Stack Deductions (toggle, default off), **Holiday Bonus (days)**, **Thumb Miss Deduct (days)**, **Biometric Enabled (toggle)**, Short Leave Start, Before/After S/L Deduct, Short Leave Limit, Holiday weekday checkboxes.

### 7.3 Payroll Runs

| Emp Code | Name | Basic Salary | Bonus | Absent Ded. | SOP Ded. | Net Salary | Loan Due | Loan Applied | Net Payable | Balance Carried | Slip |
|---|---|---|---|---|---|---|---|---|---|---|---|
| EMP-0098 | Afzal Masih | 67,000 | 35,388 | 0 | 0 | 102,388 | 20,000 | 20,000 | 82,388 | 0 | Slip |
| EMP-0095 | *(audited case)* | 65,000 | 0 | 0 | 0 | 65,000 | 130,000 | 19,500 *(30% cap)* | 45,500 | 110,500 | Slip |

Generation: **Step 1** (Attendance) → **Step 2** (Remaining Employees) → **Step 3** (Apply Loans/Advances, with the cap logic above).

---

## 8. Cash & Bank

### 8.1 Cash Deposit Register

`bank` is now a dropdown of `bank_accounts` (§3.9), not free text.

| Deposit Date | Amount | Bank Account | Bank Ref No | For Date | Status | Action |
|---|---|---|---|---|---|---|
| 4 Jan | 59,700 | Meezan Bank (Imran) | HBL-TXN-8845 | 3 Jan | Deposited | Edit / Delete |

### 8.2 Bank Accounts *(new page)*

Displayed as Heads, one per account.

**Summary strip:**

| Account | Bank | Balance |
|---|---|---|
| Meezan Bank (Imran) | Meezan | 1,11,970 |
| HBL Main | HBL | 45,200 |

**Head: Meezan Bank (Imran)**

| Date | Type | Reference | In | Out | Running Balance |
|---|---|---|---|---|---|
| 4 Jan | Deposit | Cash Deposit #CD-0091 | 59,700 | — | 2,10,000 |
| 17 Jul | Sell In Payment | PO-2026-058 | — | 7,98,030 | 1,11,970 |

The Financial Reports Trial Balance's single `BANK` line (§10.2) is the sum of every `bank_accounts.current_balance` — the aggregate stays truthful automatically.

---

## 9. Reports & Alerts

### 9.1 Stock Reports — Six Views in One Head

Re-checked this round for completeness against Ittehad's own five stock report types — all five now have a real MDOS equivalent, plus Discrepancies (MDOS's own addition, not in Ittehad).

**View: Stock Ledger** — the detailed, transaction-by-transaction view for a single product (drill-down), sourced entirely from `stock_movements` (§3.3). This is where the Damaged Stock deduction and Returns & Wayback increment from §6.1 are visible as actual entries, not just implied:

| Date | Product | Direction | Source | Qty | Running Balance |
|---|---|---|---|---|---|
| 17 Jul | 2000 ML Coke | IN | Sell In — PO-2026-058 | 800 | 16,507 |
| 18 Jul | 2000 ML Coke | OUT | Invoice — INV-0142 | 60 | 16,447 |
| 19 Jul | 2000 ML Coke | OUT | Damaged Stock — DMG-0031 | 5 | 16,442 |
| 20 Jul | 2000 ML Coke | IN | Returns & Wayback — RET-0019 (Approved) | 10 | 16,452 |

**Filters:** Product (required), Date range. **Export:** CSV / Excel / PDF.

**View: Stock Balance by Level** — direct port of Ittehad's own report, sourced entirely from `stock_movements` (§3.3), no hand-maintained totals. This is the period rollup (Opening/In/Out/Closing); Stock Ledger above is the transaction-level detail behind each of these numbers.

| Product | Packing Qty | Opening Balance | IN | OUT | Closing Balance |
|---|---|---|---|---|---|
| 2000 ML Coke | 6 | 15,707 | 0 | 0 | 15,707 |
| 1500 ML | 6 | 19,862 | 0 | 0 | 19,862 |
| 1000 ML | 6 | 5,627 | 0 | 0 | 5,627 |
| 250 ML | 24 | 4,711 | 0 | 0 | 4,711 |
| 350 ML PET | 12 | 3,471 | 0 | 0 | 3,471 |

*(Sample is a single-day range, hence zero movement that day — a multi-day range populates IN/OUT from Sell In arrivals, deliveries, damaged stock, and empties flows.)*

**Filters:** Date range, Product Category. **Export:** CSV / Excel / PDF.

**View: Sale/Purchase Summary** *(new)* — also a direct port, sourced from `sell_in_lines` (Purchase / Purchase Return) and `invoice_line_items` (Sale / Sale Return via Returns & Wayback).

| Product | Purchase Qty | Purchase Amt | Pur. Return Qty | Pur. Return Amt | Net Purchase Qty | Net Purchase Amt | Sale Qty | Sale Amt | Sale Return Qty | Sale Return Amt | Net Sale Qty | Net Sale Amt |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1000 ML | 9,463 | 67,66,056 | 0 | 0 | 9,463 | 67,66,056 | 13,271 | 99,98,504 | 27 | 20,342 | 13,244 | 99,78,162 |
| 2000 ML Coke | 16,320 | 1,65,53,040 | 0 | 0 | 16,320 | 1,65,53,040 | 16,199 | 1,73,42,705 | 0 | 0 | 16,199 | 1,73,42,705 |
| 1500 ML | 25,630 | 2,42,29,528 | 0 | 0 | 25,630 | 2,42,29,528 | 32,870 | 3,14,40,403 | 1,253 | 12,90,653 | 31,617 | 3,01,49,750 |
| Pallet Wood-Industrial | 612 | 30,37,200 | 641 | 31,67,100 | −29 | (1,29,900) | 0 | 0 | 0 | 0 | 0 | 0 |
| **Grand Total** *(all 16 products in the period, not just the 4 shown)* | **73,973** | **6,96,57,225** | **2,801** | **74,87,100** | **71,172** | **6,21,70,125** | **92,897** | **7,46,35,527** | **1,293** | **13,21,309** | **91,604** | **7,33,14,218** |

The Pallet Wood-Industrial row is shown specifically because it (together with Plastic Separator, the other product carrying a return that period) accounts for the entire 2,801-unit / ₨74,87,100 Purchase Return total — both are empties-adjacent items sent back to CCBPL, the same real-world flow the Empties Log's Distribution → CCBPL direction (§6.1) tracks. Without a row like this visible, the Purchase Return total in the Grand Total line would have nothing on the page to trace it back to.

**Filters:** Date range. **Export:** CSV / Excel / PDF.

**View: Empty Ledger** *(new)* — transaction detail specifically for empties (RGB / Pallets / Plastic Sheets), sourced from `empties_log` (§3.11), showing both directions in one chronological list.

| Date | Product | Direction | Reference | Quantity | Running Balance |
|---|---|---|---|---|---|
| 1 Jan | Coke 1.5L RGB | Shop → Distribution | Ahmed Store / INV-001 | +20 | 520 |
| 17 Jul | Coke 1.5L RGB | Distribution → CCBPL | PO-2026-058 | −500 | 20 |

**View: Empty Balance** *(new)* — current on-hand snapshot per empties product, no transaction detail, just where things stand today.

| Product | Current Balance |
|---|---|
| Coke 1.5L RGB | 20 |
| Pallets | 6 |
| Plastic Sheets | 3,606 |

**Filters (both views):** Product, Date range (Ledger only). **Export:** CSV / Excel / PDF.

**View: Discrepancies** (unchanged from v9)

| Product | System Qty | Physical Qty | Diff | Audit Date | Status | Action |
|---|---|---|---|---|---|---|
| Coke 330ml | 1,200 | 1,185 | −15 | 5 Jan | Disputed | Edit / Delete |

### 9.2 Financial Reports

**Trial Balance** (example month-end)

| Account | Debit | Credit |
|---|---|---|
| Cash in Hand | 45,200 | — |
| Bank Account | 2,10,000 | — |
| Accounts Receivable — Credit Shops | 3,80,500 | — |
| Warehouse Stock | 9,15,000 | — |
| Employee Advances / Loans Receivable | 1,10,500 | — |
| CCBPL Payable | — | 6,50,000 |
| Sales Revenue | — | 30,00,000 |
| Salary Expense | 10,00,000 | — |

**View: WH Tax Summary** *(new)* — direct port of Ittehad's WH Tax report, sourced from `sell_in_lines.wh_tax_amount` grouped by PO. To confirm this is a genuine port and not just a shape match, the sample below uses **actual rows from the Ittehad report you sent** (`WH_TAX_SUMM.pdf`, 24-Jan-26 to 24-Jul-26, 11 pages, ~500 vouchers):

| Date | Voucher | Vendor | CCBPL Invoice # | W.H. Tax |
|---|---|---|---|---|
| 26-Jan-26 | 26-0060 | CCBPL (517) | 9020309370 | 1,150.81 |
| 27-Jan-26 | 26-0061 | CCBPL (517) | 9020315995 | 1,776.21 |
| 27-Jan-26 | 26-0062 | CCBPL (517) | 9020336472 | 699.06 |
| 28-Jan-26 | 26-0064 | CCBPL (517) | 9020347072 | 1,503.22 |
| 29-Jan-26 | 26-0065 | CCBPL (517) | 9020353966 | 699.06 |
| … | … | … | … | *(495 more rows across the period)* |
| | | | **Summary** | **6,39,779.06** |

That final total is the real, exact figure from the source report's own summary line — the report structure (one row per CCBPL purchase voucher, running to a period total) reproduces correctly against real data, not just invented numbers.

**Filters:** Date range. **Export:** CSV / Excel / PDF.

**Income Statement** — cross-links to the Income Management tab's own page (§11.2) rather than duplicating it; exactly one authoritative Income Statement exists.

### 9.3 Shop Statement *(new)*

A **"Statement"** button on each Shop Directory row generates a running-balance ledger for that shop — direct port of Ittehad's shop-level statement, sourced from `invoices` (credit sales, debit) and `payments` (collections, credit) for that shop. Below is the **actual shop** from `SHOP_STOP_STATEMENT.PDF`, reconstructed line-by-line so every running balance matches the source report exactly (155,786 → … → 62,418, with Total Debit 81,632 and Total Credit 1,75,000 — both tie to the source's own closing summary):

| Date | Voucher No | Cross A/C | Description | Debit | Credit | Balance |
|---|---|---|---|---|---|---|
| — | — | — | Opening Balance | — | — | 1,55,786 |
| 17-Mar-26 | SALE-26-0066 | Cash in Hand | Credit Sale | 15,572 | — | 1,71,358 |
| 18-Mar-26 | SALE-26-0067 | Cash in Hand | Sale Return | — | 60,000 | 1,11,358 |
| 19-Mar-26 | SALE-26-0068 | Cash in Hand | Credit Sale | 51,060 | — | 1,62,418 |
| 16-Apr-26 | REC/DR-26-0981 | Meezan Bank (Imran) | Online Receipt | — | 50,000 | 1,12,418 |
| 25-Apr-26 | REC/DR-26-1083 | Meezan Bank (Imran) | Online Receipt | — | 15,000 | 97,418 |
| 25-Apr-26 | SALE-26-0097 | Cash in Hand | Credit Sale | 15,000 | — | 1,12,418 |
| 2-Jun-26 | REC/DR-26-1577 | Meezan Bank (Imran) | Online Receipt | — | 25,000 | 87,418 |
| 22-Jul-26 | REC/DR-26-2173 | Meezan Bank (Imran) | Online Receipt | — | 25,000 | **62,418** |
| | | | **Closing** | **81,632** | **1,75,000** | **62,418** |

Every voucher number, date, and running balance above is the shop's real data — the only reconstruction involved was resolving which rows were debits vs. credits where the source PDF's column alignment was ambiguous, done by working backward from the confirmed opening/closing balances and the source's own printed Debit/Credit totals until both matched exactly.

**Filters:** Date range. **Export:** PDF. Also the natural drill-down target from an Overdue Threshold alert (§9.4) — click the alert, land on that shop's Statement.

### 9.4 Real-Time Alerts Feed (unchanged)

| Time | Alert Type | Details | Severity | Status | Action |
|---|---|---|---|---|---|
| 09:15 | Cash Not Deposited | Rs.62,450 — 26 hours undeposited | HIGH | Unread | Mark Read |
| 07:00 | Overdue Threshold | Khan Store — 60 days overdue | HIGH | Read | Mark Read |

---

## 10. Expenses

### 10.1 Agency Expenses — Salary Head Fixed

Ittehad's own Income Statement (`ACC_INCOME2.pdf`) confirms a single lump-sum `SALARIES EXP` account, not a manually-duplicated figure. Audit finding: MDOS's Salary Head previously let someone **manually re-enter** Salary + Incentive, a second source of truth sitting right next to the real one (`payroll_runs.net_payable`). Fixed.

| Head | Synced? | Ledger Account | Verdict |
|---|---|---|---|
| **Salary** | Was not — now fixed | `EXP_SALARY` | **Read-only**, derived entirely from Payroll Runs |
| Fuel | Yes (prefill only; Fuel/Amount always manual, correctly) | `EXP_FUEL` | Unchanged besides §10.2 |
| Bills / Entertainment / Petty | N/A — no master to sync to | respective `EXP_*` | Correct as manual |
| Penalties | N/A — genuinely external notices | `EXP_PENALTIES` | Correct as manual; optional "Related PO #" field for traceability |

**Salary Head (read-only)**

| Emp Code | Name | Role | Month | Year | Net Payable | Source |
|---|---|---|---|---|---|---|
| EMP-0098 | Afzal Masih | Loader | July | 2026 | 82,388 | Payroll Run — auto |
| EMP-0027 | Rizwan Ali | Preseller | July | 2026 | 35,000 | Payroll Run — auto |

No "Add Salaries" button remains. When a payroll run is finalized, it fires a ledger posting automatically (Debit `EXP_SALARY`, Credit `BANK`/`CASH`) — Expense Sheet and Income Statement can no longer disagree with Payroll's real numbers.

**Other Heads (unchanged fields):** Fuel — see §10.2. Bills (Bill, Month, Year, Amount). Entertainment (Month, Description, Amount). Petty (Month, Description, Amount). Penalties (Month, Description, Reason, Amount).

**Shared pattern:** table view, most-recent-first; Add form with prefilled + manual fields; instant refresh on save; Month/Year filters (Fuel now filters by date range instead, §10.2); CSV/Excel export.

### 10.2 Fuel Head — Odometer Readings, Date-Based

`ACC_INCOME2.pdf` independently confirms Ittehad tracks fuel as **separate accounts per individual vehicle**, validating the per-truck granularity already in this Head. What was missing: odometer tracking and the right time grain — trucks refuel every 10–14 days, not monthly.

| Vehicle | Number | Driver | Date | Initial Reading | Final Reading | Distance | Fuel (L) | Amount | Efficiency |
|---|---|---|---|---|---|---|---|---|---|
| TRK-01 | CAP-9528 | Imran | 15 Jul | 45,210 | 45,980 | 770 km | 62 | 18,600 | 12.4 km/L |
| TRK-01 | CAP-9528 | Imran | 28 Jul | 45,980 | 46,715 | 735 km | 58 | 17,400 | 12.7 km/L |
| TRK-02 | CAG-4192 | Bilal | 18 Jul | 61,340 | 62,050 | 710 km | 55 | 16,500 | 12.9 km/L |

`Initial Reading` auto-fills from that vehicle's last `Final Reading`, editable. Monthly rollup for Expense Sheet still sums `Amount` by the calendar month of `Date` — only the source grain changed, not the aggregation.

### 10.3 Expense Sheet (unchanged)

| Month | Year | Description | Amount | Monthly Expense |
|---|---|---|---|---|
| January | 2026 | January Salary Expense | 10,00,000 | 10,00,000 |
| January | 2026 | January Bills Expense | 5,00,000 | 15,00,000 |
| January | 2026 | January Fuel Expense | 1,50,000 | 16,50,000 |

---

## 11. Income Management

### 11.1 Income Margin — Scheme Income Promoted to a Real, Separately-Tracked Category

You confirmed CCBPL scheme reconciliation is in scope, not an optional nice-to-have. The single generic "Trade Incentive" bucket is gone — `ACC_INCOME2.pdf` shows Ittehad tracks each scheme as its own account with its own running balance (CPO, Customer SUC, Free Sampling, Leakage/Burst Incentive, Red Box, Target Incentive, Trade Promo), and Income Statement now does the same.

**New table:**

```sql
CREATE TABLE scheme_income (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  scheme_type  TEXT NOT NULL CHECK (scheme_type IN
               ('cpo','customer_suc','free_sampling','leakage_burst_incentive',
                'red_box','target_incentive','trade_promo','other')),
  description  TEXT,
  amount       NUMERIC(12,2) NOT NULL,
  income_month DATE NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

**Why this stays a domain table and doesn't grow the ledger:** §1.5's whole point was keeping `chart_of_accounts` fixed at ~20 accounts so MDOS never becomes Ittehad's 1,769-account maze. Adding 7 new ledger accounts (one per scheme) would start eroding that. Instead, all scheme income still posts to the *same one* `REV_INCENTIVE` ledger account in aggregate (so the Trial Balance stays lean) — the per-scheme breakdown lives here, in `scheme_income`, and Income Statement reads this table directly rather than the ledger for this section. Granular detail where it's genuinely needed; the hidden ledger stays hidden and simple.

**"Add Scheme Income" form** (Scheme Type is now **required**, not optional):

| Field | Type |
|---|---|
| **Scheme Type** *(required)* | CPO / Customer SUC / Free Sampling / Leakage-Burst Incentive / Red Box / Target Incentive / Trade Promo / Other |
| Description | Text |
| Amount | Number |
| Month | Auto-selected |

**Income Margin (product-level table, unchanged)**

| Product | Sales | Sell In Price | Sell Out Price | Profit | Total Profit |
|---|---|---|---|---|---|
| Coke 1.5L | 10,000 | 910 | 980 | 7,00,000 | 7,00,000 |

### 11.2 Income Statement — Redesigned to Match Ittehad's Real Structure

Ittehad's actual Income Statement doesn't net one "Trade Incentive" figure against sales — it lists each scheme category as its own line, then nets **W.H. Tax** separately, before ever reaching an expense section. Income Statement now does the same:

| Description | Month | Year | Amount |
|---|---|---|---|
| Sales | July | 2026 | 3,00,00,000 |
| Sales Margin | July | 2026 | 19,60,000 |
| CPO (Consumer Price Off) | July | 2026 | 88,000 |
| Customer SUC | July | 2026 | 30,394 |
| Free Sampling | July | 2026 | 0 |
| Leakage/Burst Incentive | July | 2026 | 89,536 |
| Red Box | July | 2026 | 39,530 |
| Target Incentive | July | 2026 | 1,50,589 |
| Trade Promo | July | 2026 | 6,92,515 |
| W.H. Tax | July | 2026 | (1,10,780) |
| Salary Expense | July | 2026 | 10,00,000 |
| Fuel Expense | July | 2026 | 1,50,000 |
| Bills Expense | July | 2026 | 5,00,000 |
| Entertainment Expense | July | 2026 | 1,00,000 |
| Petty Expense | July | 2026 | 10,000 |
| Penalties Expense | July | 2026 | 50,000 |
| **Total Profit** | July | 2026 | **11,29,784** |

**New formula:**

```
Total Profit = Sales Margin + Σ(all Scheme Income lines, by scheme_type)
               − W.H. Tax − Σ(6 Expense Heads)
```

`W.H. Tax` here is the same monthly figure the WH Tax Summary report (§9.2) already computes from `sell_in_lines.wh_tax_amount` — pulled into Income Statement as a deduction rather than living only in a separate report. This closes the specific gap you flagged: the scheme figures and the WH Tax figures shown here are the report **structure** Ittehad's own Income Statement actually uses (each scheme as its own line, WH Tax netted before expenses), reproduced faithfully. The individual amounts are illustrative for this walkthrough — unlike the Shop Statement (§9.3), where clean opening/closing/debit-total/credit-total anchors let me reconstruct the source PDF's exact figures with full confidence, `ACC_INCOME2.pdf`'s per-scheme debit/credit/balance columns were genuinely ambiguous in how the extracted text aligned to each named account, so I'm not claiming these specific rupee figures are Ittehad's real July numbers — only that the report's shape and formula now match theirs exactly, which is the part that was actually missing.

---

## 12. Backups — Automated Daily

| Backup Date | Status | Triggered By | Action |
|---|---|---|---|
| 22 Jul | Completed | Automatic (02:00 AM) | Download |
| 21 Jul | Completed | Manual | Download |

`pg_cron` runs once daily per tenant; **Backup Now** remains available on demand. Every backup is retained forever.

---

## 13. Settings

| Section | Setting | Default |
|---|---|---|
| Payroll | Default loan installment cap (%) | 30% |
| Backups | Automated daily backup time | 02:00 AM (tenant-local) |
| Financial Reports | Show Financial Reports tab | Enabled |

Everything from v8 System Settings persists unchanged (Auto-Assign toggle, Alert Configuration, two alert types).

---

## 14. Hidden, Not Removed

| Page / Field | Superseded By | Data Fate |
|---|---|---|
| Tab 1 Page 1 (Invoice Generation) | Sales Transactions → Head: Invoices | Same `invoices` table |
| Tab 1 Page 2 (Route Assignment) | Sales Transactions → Head: Dispatch & Routes | Same `route_assignments` table |
| Tab 1 Page 3 (Late Delivery Tracker) | **Hidden — delivery no longer tracked** | `late_deliveries` table retained |
| Tab 4 Page 1 (Daily Summary / DM Cash Summary) | **Hidden — see Bank Accounts (§8.2)** | Underlying query retained |
| Cash Reconciliation page | **Hidden — no v9.1 UI replacement** | Underlying two-step (invoices recorded vs. bank deposited) query retained; can be restored as a page or rebuilt as a dashboard widget later |
| Tab 3 Pages 1, 2, 3, 5 (Warehouse Stock, Damaged, Returns, Empties) | Warehouse Stock → 4 Heads | Same underlying tables |
| Tab 6 Page 2 (Purchasing from CCBPL) | Sell In | New `sell_in_orders`/`sell_in_lines`; old `ccbpl_ledger` rows preserved |
| Tab 7 Page 1 (Stock Discrepancy, standalone) | Stock Reports → Discrepancies view | Same underlying query |
| `invoices.delivery_status`, multi-stage values | Defaults to `'delivered'` | Column retained, unused |
| `warehouse_stock.qty_reserved` | Removed from UI | Column retained, defaults to 0, unwritten |
| Agency Expenses Salary Head (manual entry) | Read-only view over Payroll Runs | Historical manual rows retained, no longer editable |
| `employees.eobi_enrolled`, `employees.social_security` | Removed from Employee Directory UI | Columns retained, unwritten from the UI going forward |

Any of these can be switched back on per-tenant from the Admin Panel with zero data loss.

---

## 15. Risk Register — Before & After

**From the BSS-92 audit:**

| # | BSS-92 Finding | v9.1 Resolution |
|---|---|---|
| 2 | Unbounded employee loan exposure, silent negative balances | `employee_loans` cap + `payroll_runs.net_payable` floored at 0, shortfall visible as `balance_carried` (§3.6, §7.3) |
| 4 | Guard wages posted as a bare ledger account, outside Payroll | Every paid person is a real `employees` row (§3.4) |
| 5 | Sale Form Net Bill formula unreconstructable from visible fields | Sell In's Net Bill is one documented, generated-column formula (§3.10, §6.3) |
| 9 | SOP grace deductions could silently stack | `stack_deductions` explicit, off-by-default toggle (§3.7) |
| 1 | Payroll/Purchase periods never formally closed in ~10 years | Automated daily backups (§12); Financial Reports gives an always-current view |
| 3 | Sales vouchers from 2016 still shown "Open," no auto-expiry | Not reintroduced — invoices no longer carry an unbounded open state at all (§5) |

**Found during MDOS's own internal review (not from the Ittehad audit):**

| # | Finding | v9.1 Resolution |
|---|---|---|
| 11 | Agency Expenses' Salary Head was a second, disconnected source of truth next to Payroll Runs | Converted to a read-only derived view; no manual entry possible (§10.1) |
| 12 | "Reserved" stock had no real meaning once delivery stopped being a tracked stage | Removed from UI; Stock Levels now shows one honest `qty_available` figure (§6.1, §3.14) |
| 13 | Payroll Policies (SOPs) was missing four fields present on Ittehad's real screen — monthly-repeat grace, Holiday Bonus, Thumb Miss Deduct, Biometric toggle — meaning Payroll Runs would have silently under- or over-paid against those rules | All four fields added to `payroll_sops` and surfaced in the UI (§3.7, §7.2) |
| 14 | Damaged Stock and Returns & Wayback had no explicitly stated stock effect — a reader could reasonably assume they were just log pages | Both now explicitly increment/decrement Stock Qty and log a `stock_movements` row, visible in the new Stock Ledger view (§6.1, §9.1) |
| 15 | Income Statement collapsed all CCBPL scheme income into one generic "Trade Incentive" line and never netted WH Tax against sales at all — real CCBPL scheme reconciliation wasn't possible from this report | Confirmed in scope; Scheme Type promoted from optional tag to required classification (`scheme_income` table), each scheme now its own Income Statement line, WH Tax netted explicitly (§11.1, §11.2) |

---

## Change Log — v8 → v9.1

| Round | Change |
|---|---|
| v9 | Hybrid architecture adopted: hidden `ledger_entries` + fixed 20-account `chart_of_accounts` |
| v9 | New Employee Management tab; `employees`, `employee_loans`, `payroll_sops`, `payroll_runs` |
| v9 | Sell In redesigned with documented Net Bill formula |
| v9 | Backups: manual-only → automated daily |
| v9 | Stock Discrepancy folded into Stock Reports; Financial Reports added |
| v9.1 (addendum) | Delivery Exceptions and DM Cash Summary hidden; `delivery_status` defaults `'delivered'` |
| v9.1 (addendum) | `bank_accounts` table + page; Sell In gains 3rd "Billed" stage drawing from a selected bank account |
| v9.1 (addendum) | Empties Log gains two-directional tracking (`direction`, `ccbpl_reference`) |
| v9.1 (addendum) | Agency Expenses Salary Head fixed: manual entry → read-only view over Payroll Runs |
| v9.1 (addendum) | Fuel Head redesigned: month/year → date + odometer readings (`initial_reading`, `final_reading`, generated distance/efficiency) |
| v9.1 (addendum) | WH Tax Summary and Shop Statement reports added; Trade Incentive gains optional Scheme Type |
| v9.1 (this round) | `warehouse_stock.qty_reserved` removed from UI; Stock Levels simplified to one figure |
| v9.1 (this round) | `stock_movements` table added; Stock Balance by Level and Sale/Purchase Summary reports added, both exportable |
| v9.1 (this round) | Cash Reconciliation page removed from Cash & Bank tab and hidden-not-removed list; Cash & Bank now 2 pages (Cash Deposit Register, Bank Accounts) |
| v9.1 (this round) | Sell In gains a 4th lifecycle stage, **On Credit** (`credit_due_date`), between Stock Arrived and Billed; skippable if paid immediately |
| v9.1 (this round) | WH Tax Summary and Shop Statement samples rebuilt using actual source-report data (real vouchers, real running balances) instead of invented figures |
| v9.1 (this round) | Damaged Stock and Returns & Wayback now explicitly state their Stock Qty effect (deduct / increase, respectively) |
| v9.1 (this round) | Empties Log product picker gated to `products.is_returnable = true` — new product flag added |
| v9.1 (this round) | Employee Directory: EOBI/Social Security removed from UI (hidden, not deleted); 1st/2nd Reference (name + phone) and Account Number added |
| v9.1 (this round) | Payroll Policies (SOPs) re-verified against the real Ittehad screen; four missing fields added (`grace_limit_repeats_monthly`, `holiday_bonus_days`, `thumb_miss_deduct_days`, `biometric_enabled`) |
| v9.1 (this round) | Stock Reports expanded from 4 to 6 views: Stock Ledger (now properly detailed) + Stock Balance by Level + Sale/Purchase Summary + **Empty Ledger** (new) + **Empty Balance** (new) + Discrepancies — full parity with Ittehad's 5 report types |
| v9.1 (this round) | Sale/Purchase Summary sample fixed: Pallet Wood-Industrial row added so the Purchase Return grand total is actually traceable, not floating unexplained |
| v9.1 (this round) | Income Statement redesigned: `scheme_income` table added, Scheme Type promoted from optional tag to required field, each CCBPL scheme (CPO, Customer SUC, Free Sampling, Leakage/Burst Incentive, Red Box, Target Incentive, Trade Promo) now its own line, W.H. Tax netted explicitly — matching Ittehad's real Income Statement structure |
