# Employee Loan Entry + Employee Ledger — Full Build

Two gaps closed here:

1. **Loan Entry** — `employee_loans` (§3.6) has no UI to create a row. Built below: a "Give Loan" action + form on Employee Directory.
2. **Employee Ledger** — requested new feature. A per-employee running-balance ledger, same pattern as Stock Ledger (§9.1), added to Employee Directory.

Both follow the Blueprint's existing architecture exactly: hidden ledger table, written by triggers, never a hand-maintained total (same pattern as `ledger_entries` §3.2 and `stock_movements` §3.3).

---

## PART 1 — Loan Entry Feature

### 1.1 Where it lives

**Employee Directory (§7.1)** — two additions to the existing table:

| Emp Code | Name | Role | ... | Status | Action |
|---|---|---|---|---|---|
| EMP-0027 | Rizwan Ali | Preseller | ... | Active | Edit / Delete / **Give Loan** / **Ledger** |

Plus a new sub-tab next to the existing **Increments** sub-tab (§7.1 already has one — this is a sibling, same pattern):

**Sub-tab: Loans / Advances**

| Loan Date | Principal | Monthly Installment | Cap Check | Status | Outstanding Balance | Action |
|---|---|---|---|---|---|---|
| 1 May 26 | 150,000 | 15,000 | Within 30% cap | Active | 120,000 | View / Close |

`+ Give Loan` button sits above this sub-table.

### 1.2 The "Give Loan" form

| Field | Type | Notes |
|---|---|---|
| Employee | Auto-filled | Comes from whichever employee's row you clicked |
| Principal Amount | Number, required | Total loan amount handed over |
| Monthly Installment | Number, required | Fixed EMI-style amount to recover each payroll cycle |
| Issue Date | Date, defaults to today | |
| Reason / Purpose | Text, optional | e.g. "Medical emergency", "House repair" — shows on loan history for audit |
| **Cap Check** | Auto-computed, live | `installment_cap_pct` (default 30%) `× basic_salary`. Shown as green "Within cap" or red "Exceeds cap by ₨X" the moment installment is typed |
| Override Reason | Text, **conditionally required** | Only appears/required if installment exceeds the cap |

### 1.3 Submit logic

```
ON SUBMIT:
  cap_amount = employees.basic_salary * installment_cap_pct / 100   -- default cap_pct = 30

  IF monthly_installment <= cap_amount:
    status = 'active'
  ELSE IF override_reason provided:
    status = 'override_active'
  ELSE:
    BLOCK submit → show inline error:
    "Installment exceeds 30% of basic salary (₨{cap_amount}).
     Add an override reason to proceed, or lower the installment."

  ON successful save:
    1. INSERT INTO employee_loans
         (employee_id, principal_amount, monthly_installment,
          installment_cap_pct, outstanding_balance = principal_amount,
          status, override_reason, issued_date)

    2. Ledger posting (matches §10.1's auto-posting pattern):
         Debit  EMP_ADVANCES   principal_amount
         Credit CASH / BANK    principal_amount
       → cash physically left the business; an asset (money owed
         back by the employee) was created.

    3. Employee Ledger row (Part 2 below):
         type = 'loan', direction = 'in', amount = principal_amount

  Loan is now live. It appears in Payroll Runs' "Loan Due" column
  automatically starting the employee's next payroll cycle —
  nothing further needs to be entered there.
```

### 1.4 How it flows into Payroll Runs (no change needed there — it just starts working)

```
Each payroll cycle, for every employee with an active loan:

  loan_installment_due = LEAST(monthly_installment, outstanding_balance)
    -- never asks for more than what's actually still owed

  loan_installment_applied = LEAST(loan_installment_due, cap_amount)
    -- the existing 30%-of-basic-salary safety net (§3.6), unchanged

  net_payable = net_salary - loan_installment_applied
  balance_carried = loan_installment_due - loan_installment_applied

  ON payroll run finalize:
    employee_loans.outstanding_balance -= loan_installment_applied
    IF outstanding_balance <= 0:
      employee_loans.status = 'closed'
      -- stops appearing in future Payroll Runs automatically
```

**Multiple active loans on one employee:** apply oldest-first — same first-in matching principle the platform already uses for shop payments against invoices. `loan_installment_due` becomes the sum of each active loan's own `LEAST(monthly_installment, outstanding_balance)`, oldest loan settled first.

---

## PART 2 — Employee Ledger

### 2.1 What it shows and why the columns work this way

Exactly the format you asked for:

| EMP-CODE | EMP NAME | TYPE | In (Rs.) | Out (Rs.) | Running Balance |
|---|---|---|---|---|---|

Same visual pattern as Stock Ledger (§9.1: Date/Product/Direction/Source/Qty/Running Balance) — but the "thing" being tracked here is **what the employee currently owes the company on loans**, not their salary.

**Rule: only `Loan` rows move the Running Balance. `Salary` rows are logged for a complete payment history, but don't affect it.**

Why: a loan is money that has to come back — it makes sense to track a running balance for it, same as stock. Salary is money fully earned and settled the moment it's paid; nothing about it is "owed back," so folding it into the same balance would make the number meaningless (it would just grow forever with every payroll, which isn't what "balance" should mean here). Keeping both types in one chronological log — while only one of them moves the balance — gives you a single place to see everything paid to an employee, without corrupting what "Running Balance" actually stands for.

- **Loan Disbursed** → `In` = principal amount → balance **increases** (more is now owed)
- **Loan Installment Recovered** (each payroll) → `Out` = amount recovered → balance **decreases**
- **Salary Paid** (each payroll) → `Out` = net payable → balance **unchanged**, shown for record only

### 2.2 New hidden table (same pattern as `ledger_entries` §3.2 / `stock_movements` §3.3)

```sql
CREATE TABLE employee_ledger (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  employee_id   UUID NOT NULL REFERENCES employees(id),
  entry_date    DATE NOT NULL DEFAULT current_date,
  type          TEXT NOT NULL CHECK (type IN ('salary','loan')),
  direction     TEXT NOT NULL CHECK (direction IN ('in','out')),
  amount        NUMERIC(12,2) NOT NULL,
  source_table  TEXT NOT NULL,   -- 'employee_loans' | 'payroll_runs'
  source_id     UUID NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE employee_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY employee_ledger_owner_all ON employee_ledger
  FOR ALL USING (tenant_id = current_tenant_id());
```

**Writes to this table (no page ever writes here directly — triggers only, same discipline as §3.2/§3.3):**

| Event | Trigger | Row written |
|---|---|---|
| Loan disbursed | `AFTER INSERT ON employee_loans` | `type='loan', direction='in', amount=principal_amount, description='Loan Disbursed'` |
| Payroll finalized, loan installment > 0 | `AFTER INSERT/UPDATE ON payroll_runs` | `type='loan', direction='out', amount=loan_installment_applied, description='Loan Installment Recovered — Payroll {month}'` |
| Payroll finalized | `AFTER INSERT/UPDATE ON payroll_runs` | `type='salary', direction='out', amount=net_payable, description='Salary Paid — Payroll {month}'` |

### 2.3 Running Balance calculation (the view behind the page)

```sql
SELECT
  e.employee_code,
  e.name,
  el.entry_date,
  el.type,
  CASE WHEN el.direction = 'in'  THEN el.amount END AS "In",
  CASE WHEN el.direction = 'out' THEN el.amount END AS "Out",
  SUM(
    CASE
      WHEN el.type = 'loan' AND el.direction = 'in'  THEN  el.amount
      WHEN el.type = 'loan' AND el.direction = 'out' THEN -el.amount
      ELSE 0   -- salary rows never move the balance
    END
  ) OVER (PARTITION BY el.employee_id ORDER BY el.entry_date, el.created_at)
    AS running_balance
FROM employee_ledger el
JOIN employees e ON e.id = el.employee_id
WHERE el.employee_id = :employee_id
ORDER BY el.entry_date, el.created_at;
```

### 2.4 Worked example — EMP-0095

Basic Salary ₨65,000. Loan issued 1 May: principal ₨150,000, installment ₨15,000/month (well inside the ₨19,500 cap, so no override needed).

| EMP-CODE | EMP NAME | TYPE | In (Rs.) | Out (Rs.) | Running Balance |
|---|---|---|---|---|---:|
| EMP-0095 | *(illustrative)* | Loan | 150,000 | — | 150,000 |
| EMP-0095 | *(illustrative)* | Loan | — | 15,000 | 135,000 |
| EMP-0095 | *(illustrative)* | Salary | — | 50,000 | 135,000 *(unchanged)* |
| EMP-0095 | *(illustrative)* | Loan | — | 15,000 | 120,000 |
| EMP-0095 | *(illustrative)* | Salary | — | 50,000 | 120,000 *(unchanged)* |

Reads exactly like a passbook: two loan recoveries brought the balance from 150,000 down to 120,000; the two salary rows sit in the same timeline for full payment history, but never touch that number.

### 2.5 Where the button lives

**Employee Directory row → Action → `Ledger`** (same placement pattern as Shop Directory's `Statement` button, §9.3 — click a row, get that entity's running-balance history).

**Filters:** Date range, Type (All / Salary / Loan). **Export:** CSV / Excel / PDF — same as every other ledger view in the platform.
