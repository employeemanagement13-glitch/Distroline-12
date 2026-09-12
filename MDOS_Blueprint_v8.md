# MDOS Blueprint — v8 (UPDATED)

**Confidential — Internal Engineering Document — Not for External Distribution**

> Revision scope: All v7 changes retained · Tab 3 Page 5 Empties Log added · Tab 6 Page 2 status workflow revised · Shop Profile UI toggle + date filters added · Page-by-page field injections applied

---

## Executive Summary — What This Revision Does

v8 applies six directives on top of the finalized v7 base:

1. **New Module — Tab 3 Page 5: Empties Log** — a dedicated page to record returnable bottles/empties. The `Empties` column is removed from Tab 3 Page 1 (Warehouse Stock); empties are now tracked exclusively on their own page and linked to invoices by Invoice No.
2. **Tab 6 Page 2 — Purchase Order status workflow rewritten** — "Under Review" and "Complaint Submitted" are replaced by **In Progress** and **Stock Arrived**. While status = "In Progress", zero writes happen to Warehouse Stock or the Agency Ledger balance. The moment status is changed to "Stock Arrived", both systems update immediately.
3. **Tab 6 Page 2 — Flappy Qty field removed** — all stock movements recorded during a purchase are real-world counts only. The Distributor logs damaged stock manually on Tab 3 Page 2 as before.
4. **Shop Details — On-Credit Shop Profile** — a UI toggle switches between a **Credit Invoices** table and a **Cash Invoices** table, each with its own distinct column set.
5. **All Shop Profile Pages** — Date / Month / Year filters added. Default state: current month and current year pre-selected.
6. **Page-by-page field injections** — precise column additions and removals across Tab 1, Tab 2, Tab 3, Tab 4, Tab 6, and the Admin Panel.

All v7 rules remain in force: Shops Delivery Notifications fully excised, Findings 4/5/9 built in, Phone No. mandatory on Admin Dashboard, global two-button Export (CSV + Excel) on every listing page.

---

## Tech Stack

| Piece                  | Technology              | Why                                                                                                                                |
| ---------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Frontend Framework     | Next.js 14 (App Router) | One framework for pages and server-side functions. Dynamic `/users/[slug]/` folder structure maps one folder per distribution.     |
| Styling                | Tailwind CSS            | Utility classes directly in page code; enforces strict black-and-white look consistently.                                          |
| Database               | Supabase (PostgreSQL)   | Real Postgres + built-in file storage, pg_cron scheduled jobs, and Realtime subscriptions for live Alerts Feed and Backup history. |
| Login for Distributors | Clerk                   | Magic Link and Google sign-in. Supabase connects to Clerk via Third-Party Auth — no custom bridge code.                            |
| Hosting                | Vercel                  | Deploys straight from GitHub, built for Next.js.                                                                                   |
| CSV / Excel Import     | PapaParse               | Reads Voyage export files in the browser before saving; catches bad rows before any DB write.                                      |
| PDF Generation         | @react-pdf/renderer     | Used for printable Route Sheet and invoice layouts.                                                                                |
| Excel Export           | xlsx (SheetJS)          | Builds downloadable `.xlsx` files on every page (global Export fix).                                                               |

**REMOVED** — Twilio / WhatsApp entirely (v7 Rule 1). No replacement.

---

## Database Schema — v8

Every table carries `tenant_id`. Every query is filtered through Supabase Row Level Security (RLS).

### Tenants & Admin

```sql
-- tenants.phone_number is TEXT NOT NULL — mandatory contact field for every distribution.
-- No notification role. Plain contact record only.
```

### invoices

```sql
CREATE TABLE invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  invoice_no        TEXT NOT NULL,
  shop_id           UUID NOT NULL REFERENCES shops(id),
  preseller_id      UUID REFERENCES employees(id),
  dm_id             UUID REFERENCES employees(id),           -- NULL until route assigns a DM
  products          TEXT NOT NULL,                           -- 'Coke 1.5L×20, Sprite 1.5L×10'
  promo_type        TEXT DEFAULT 'none' CHECK (promo_type IN ('in_kind','in_rupees','none')),
  promo_note        TEXT,
  invoice_date      DATE NOT NULL,
  due_date          DATE,                                    -- only set for credit invoices
  scheduled_date    DATE NOT NULL,
  invoice_type      TEXT NOT NULL CHECK (invoice_type IN ('cash','credit')),
  invoice_total     NUMERIC(12,2) NOT NULL,                  -- [FINDING 9] renamed from total_amount
  discount_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,        -- [FINDING 9]
  advance_tax       NUMERIC(12,2) NOT NULL DEFAULT 0,        -- [FINDING 9]
  grand_total       NUMERIC(12,2) GENERATED ALWAYS AS
                    (invoice_total - discount_amount + advance_tax) STORED,  -- [FINDING 9]
  empties_deposit   NUMERIC(12,2) NOT NULL DEFAULT 0,        -- [FINDING 5] separate from grand_total
  amount_received   NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_status    TEXT GENERATED ALWAYS AS (
                    CASE
                      WHEN amount_received >= (invoice_total - discount_amount + advance_tax) THEN 'paid'
                      WHEN amount_received > 0 THEN 'partial'
                      ELSE 'outstanding'
                    END
                    ) STORED,
  -- NOTE: payment_status cannot reference grand_total (generated → generated is forbidden in Postgres 16).
  -- Formula is inlined. Verified against Postgres 16.
  -- payment_status values: 'paid' (fully settled), 'partial' (some amount paid, balance remains),
  -- 'outstanding' (zero received).
  visit_status      TEXT CHECK (visit_status IN ('visited','unvisited')),
  delivery_status   TEXT NOT NULL DEFAULT 'undispatched'
                    CHECK (delivery_status IN ('undispatched','pending','delivered','undelivered')),
  reason            TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, invoice_no)
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoices_owner_all ON invoices FOR ALL USING (tenant_id = current_tenant_id());
```

**REMOVED from invoices (v7 Rule 1):** `confirmation`, `dispute_status`

---

### shops — [FINDING 4] Outlet Code as Identity

```sql
CREATE TABLE shops (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  outlet_code       TEXT NOT NULL,              -- [FINDING 4] permanent identity, issued once, never reused
  shop_name         TEXT NOT NULL,
  owner_name        TEXT,
  phone             TEXT NOT NULL,              -- editable contact field only; no longer unique or identity
  shop_type         TEXT NOT NULL DEFAULT 'cash' CHECK (shop_type IN ('cash','credit')),
  credit_limit      NUMERIC(12,2) DEFAULT 0,
  credit_terms_days INTEGER DEFAULT 0,
  is_blocked        BOOLEAN DEFAULT false,
  block_reason      TEXT,
  blocked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, outlet_code)               -- [FINDING 4] replaces old UNIQUE(tenant_id, phone)
);

CREATE INDEX idx_shops_tenant ON shops(tenant_id);
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
CREATE POLICY shops_owner_all ON shops FOR ALL USING (tenant_id = current_tenant_id());
```

**REMOVED:** `shop_notification_settings` table (v7 Rule 1).

---

### empties_log — [FINDING 5]

```sql
CREATE TABLE empties_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  shop_id         UUID NOT NULL REFERENCES shops(id),
  invoice_id      UUID REFERENCES invoices(id),   -- matched by invoice_no at entry time
  product_name    TEXT NOT NULL,
  quantity        INTEGER NOT NULL,
  deposit_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  log_date        DATE NOT NULL DEFAULT current_date,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE empties_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY empties_log_owner_all ON empties_log FOR ALL USING (tenant_id = current_tenant_id());
```

> **v8 change:** `warehouse_stock.qty_empties` column is **removed** from Tab 3 Page 1. Empties are tracked exclusively through `empties_log` and displayed on **Tab 3 Page 5**. The `empties_deposit` field on `invoices` remains — it is the per-invoice deposit total shown on the printed slip, independent of `grand_total`.

---

### warehouse_stock

```sql
-- qty_empties column REMOVED from this table (v8).
-- Empties now live in empties_log only.
-- Columns: id, tenant_id, product_name, qty_total, qty_reserved, qty_flappy
```

---

### alerts — Two Types Only

```sql
CREATE TABLE alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  alert_type  TEXT CHECK (alert_type IN ('cash_not_deposited','overdue_threshold')),
  details     TEXT,
  severity    TEXT CHECK (severity IN ('HIGH','MEDIUM','LOW')),
  status      TEXT DEFAULT 'unread' CHECK (status IN ('unread','read')),
  ref_table   TEXT,
  ref_id      UUID,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY alerts_owner_all ON alerts FOR ALL USING (tenant_id = current_tenant_id());
```

**REMOVED:** `delivery_dispute` alert type, `sms_logs` table (v7 Rule 1).

---

### ccbpl_ledger, ccbpl_penalties, agency_expenses — Unchanged from v7

---

## TAB 1 — Sales & Invoice Management

### Page 1 — Invoice Generation

Every sale starts here — typed by hand or imported from a Voyage CSV/Excel file.

#### Table View

| Invoice No | Shop        | Preseller | Products                | Promo Type | Promo        | Invoice Date | Due Date | Sched. Date | Type   | Grand Total | Delivery    | Payment     | DM     | Action                     |
| ---------- | ----------- | --------- | ----------------------- | ---------- | ------------ | ------------ | -------- | ----------- | ------ | ----------- | ----------- | ----------- | ------ | -------------------------- |
| INV-001    | Ahmed Store | Rizwan    | Coke 1.5L×20, Sprite×10 | In Kind    | 3 Cases Free | 1 Jan        | 25 Jan   | 2 Jan       | Credit | 4,472.40    | Delivered   | Outstanding | Khalid | Edit / Delete              |
| INV-002    | Bilal Mart  | Mehmood   | Coke 330ml×50           | In Rupees  | Rs.900       | 1 Jan        | —        | 2 Jan       | Cash   | 6,000.00    | Delivered   | Paid        | Asif   | Edit / Delete              |
| INV-003    | Raza Pan    | Rizwan    | Fanta 500ml×15          | None       | None         | 2 Jan        | 26 Jan   | 3 Jan       | Credit | 1,800.00    | Pending     | —           | Khalid | Edit / Delete / Reschedule |
| INV-004    | Khan Store  | Salman    | Sprite 1L×30            | None       | None         | 2 Jan        | 27 Jan   | 4 Jan       | Credit | 3,600.00    | Undelivered | Outstanding | Asif   | Edit / Delete              |
| INV-005    | Tariq Shop  | Rizwan    | Coke 1.5L×10            | In Kind    | 1 Case Free  | 3 Jan        | —        | 3 Jan       | Cash   | 2,250.00    | Delivered   | Paid        | Khalid | Edit / Delete              |

#### Add / View Invoice — Totals Breakdown [FINDING 9 + FINDING 5]

The Add Invoice form and the View screen display the full breakdown:

| Field                        | Notes                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| **Preseller**                | Dropdown from `employees` filtered to `role = preseller`                                   |
| **Invoice Date**             | Date picker                                                                                |
| **Due Date**                 | Date picker — only for Credit invoices                                                     |
| **Scheduled Date**           | Date picker                                                                                |
| **Promo Type**               | In Kind / In Rupees / None                                                                 |
| **Promo**                    | Free-text note field                                                                       |
| **Invoice Total**            | Manual entry                                                                               |
| **Discount Amount**          | Manual entry                                                                               |
| **Advance Tax**              | Manual entry                                                                               |
| **Grand Total**              | Computed: Invoice Total − Discount + Advance Tax (display only)                            |
| **Empties / Deposit Amount** | [FINDING 5] Separate collected-cash line; NOT part of Grand Total; logged to `empties_log` |

#### Filters & Search

- **Search bar** — Shop Name, Invoice No, or Outlet Code [FINDING 4]
- **Date Range** — calendar picker, defaults to today
- **Invoice Type** — All / Cash / Credit
- **Delivery Status** — All / Undispatched / Pending / Delivered / Undelivered
- **DM Name** — dropdown from `employees` where `role = dm`
- **Preseller Name** — dropdown from `employees` where `role = preseller`
- **Promo** — three-way selector: In Kind / In Rupees / None

#### Buttons & Actions

- **Add Invoice** — form with all fields above including Finding 9/5 totals breakdown
- **Import CSV / Excel** — accepts either file type from a Voyage export
- **View (per row)** — renders the invoice in printed-invoice layout: header block → product lines → Invoice Total / Discount / Advance Tax / Grand Total / Empties Deposit
- **Edit / Delete (per row)**
- **Reschedule** — Pending rows only; picks a new delivery date
- **Mark Overdue** — automatic check on page load; compares against `grand_total`
- **Export CSV** / **Export Excel**

---

### Page 2 — Route & Order Assignment

The DM/Truck/Route Registry is shown **above** the daily table (one-time setup first).

#### DM/Truck/Route Registry

| DM Name        | Truck No | Route/Beat   | Action        |
| -------------- | -------- | ------------ | ------------- |
| Khalid Mahmood | TRK-01   | Gulshan Beat | Edit / Delete |
| Asif Khan      | TRK-02   | North Beat   | Edit / Delete |
| Usman Ali      | TRK-03   | Clifton Beat | Edit / Delete |
| Mehmood Raza   | TRK-04   | Saddar Beat  | Edit / Delete |
| Tariq Hassan   | TRK-05   | Korangi Beat | Edit / Delete |

#### Daily Routes & Order Assignment Table

| Truck No | DM Name        | Route/Beat   | # Invoices | Invoice Total | Cash Exp. | Credit Total | Date  | Status      | Action        |
| -------- | -------------- | ------------ | ---------- | ------------- | --------- | ------------ | ----- | ----------- | ------------- |
| TRK-01   | Khalid Mahmood | Gulshan Beat | 12         | 63,000        | 18,000    | 45,000       | 3 Jan | In Progress | Edit / Delete |
| TRK-02   | Asif Khan      | North Beat   | 9          | 53,500        | 31,500    | 22,000       | 3 Jan | Returned    | Edit / Delete |
| TRK-03   | Usman Ali      | Clifton Beat | 7          | 28,400        | 12,000    | 16,400       | 3 Jan | In Progress | Edit / Delete |
| TRK-04   | Mehmood Raza   | Saddar Beat  | 5          | 19,800        | 9,800     | 10,000       | 3 Jan | Not Started | Edit / Delete |
| TRK-05   | Tariq Hassan   | Korangi Beat | 11         | 47,200        | 22,000    | 25,200       | 3 Jan | In Progress | Edit / Delete |

> **[FIX — Tab 3 Page 3 removal]** `Invoice Total` is a live sum of that truck's invoices. `Products` appears in the sub-page (see below). Both columns replace the removed Physical Loading Count page.

#### Sub-Page (per truck — one row per invoice)

| Invoice No | Shop        | Type   | Products                | Amount   | Delivery Status | Payment Expectation  |
| ---------- | ----------- | ------ | ----------------------- | -------- | --------------- | -------------------- |
| INV-001    | Ahmed Store | Credit | Coke 1.5L×20, Sprite×10 | 4,472.40 | Delivered       | No cash expected now |
| INV-002    | Bilal Mart  | Cash   | Coke 330ml×50           | 6,000.00 | Delivered       | Cash collected       |
| INV-003    | Raza Pan    | Credit | Fanta 500ml×15          | 1,800.00 | Pending         | No cash expected now |
| INV-004    | Khan Store  | Credit | Sprite 1L×30            | 3,600.00 | Undelivered     | No cash expected now |
| INV-005    | Tariq Shop  | Cash   | Coke 1.5L×10            | 2,250.00 | Delivered       | Cash collected       |

#### Buttons & Actions

- **Add Routes / Import Routes** — registry setup
- **Edit / Delete (registry entry)**
- **Mark Truck Returned**
- **Manual Assign (sub-page, per row)** / **Reassign All Invoices**
- **Export CSV** / **Export Excel**

> **[FIX]** The Route Sheet is printed for the **Distributor's own** reference and record-keeping — not carried by the Delivery Man.

---

### Page 3 — Late Delivery Tracker

Every night, any invoice not fully Visited and Delivered lands here automatically.

#### Table

| Invoice No | Shop        | DM      | Sched. Date | Days Late | Reason              | Status      | Action              |
| ---------- | ----------- | ------- | ----------- | --------- | ------------------- | ----------- | ------------------- |
| INV-003    | Raza Pan    | Khalid  | 3 Jan       | 2         | Shop was closed     | Pending     | Reschedule          |
| INV-019    | Malik Store | Usman   | 1 Jan       | 4         | —                   | Undelivered | Resolved / Disputed |
| INV-022    | Tariq Shop  | Asif    | 2 Jan       | 3         | Owner not available | Undelivered | Resolved / Disputed |
| INV-031    | Sana Mart   | Mehmood | 1 Jan       | 5         | Road blocked        | Pending     | Reschedule          |
| INV-044    | Iqbal Store | Tariq   | 31 Dec      | 6         | DM accident         | Undelivered | Resolved / Disputed |

#### Filters & Search

- **Search bar** — Invoice No or Shop Name
- **Date** — date picker
- **DM Name** — dropdown
- **Status** — Pending / Undelivered

#### Buttons & Actions

- **Reschedule (Pending rows)** — picks a new date. No WhatsApp sent.
- **Resolved (Undelivered rows)** — no reason required immediately [FIX — reversed from v6]
- **Disputed (Undelivered rows)** — requires a typed reason, e.g. 'DM showed a medical certificate' [FIX — reversed from v6]
- **Export CSV** / **Export Excel**

---

## TAB 2 — Credit Control

### Page 1 — Retailer Credit & Cash Shops

| Shop Name   | Type      | Credit Limit | Used   | Available | Overdue | Terms   | Status  | Last Payment | Action        |
| ----------- | --------- | ------------ | ------ | --------- | ------- | ------- | ------- | ------------ | ------------- |
| Ahmed Store | On Cash   | 0            | 0      | 0         | 0       | 0 days  | SAFE    | 15 Dec       | Edit / Delete |
| Bilal Mart  | On Credit | 50,000       | 30,000 | 20,000    | 0       | 20 days | SAFE    | 28 Dec       | Edit / Delete |
| Khan Store  | On Credit | 75,000       | 45,000 | 30,000    | 45,000  | 30 days | OVERDUE | 20 Nov       | Edit / Delete |
| Bai Store   | On Credit | 75,000       | 45,000 | 30,000    | 45,000  | 15 days | BLOCKED | 17 Nov       | Edit / Delete |
| Saleem Mart | On Credit | 60,000       | 55,000 | 5,000     | 20,000  | 30 days | OVERDUE | 5 Nov        | Edit / Delete |

> **[FIX — v8]** `Terms` column added — shows this shop's `credit_terms_days` value.

#### Filters & Search

- **Filter** — On Cash only / On Credit only / Both
- **Search bar** — by Shop Name or Outlet Code [FINDING 4]

#### Buttons & Actions

- **View (per row)** — opens unpaid-invoices sub-page (On Credit only)
- **Record Payment (per row)**
- **Block Shop (per row)** — requires typed reason
- **Export CSV** / **Export Excel**

#### Unpaid Invoices Sub-Page (On Credit shops only)

| Invoice No | Date   | Grand Total | Paid  | Balance | Due Date | Days Past Due | Bucket       | Status      | Action        |
| ---------- | ------ | ----------- | ----- | ------- | -------- | ------------- | ------------ | ----------- | ------------- |
| INV-001    | 1 Jan  | 40,000      | 0     | 40,000  | 25 Jan   | Not yet due   | 0-30 days    | Outstanding | Edit / Delete |
| INV-045    | 10 Dec | 25,000      | 0     | 25,000  | 25 Dec   | 26 days       | Overdue 1-30 | OVERDUE     | Edit / Delete |
| INV-032    | 5 Nov  | 15,000      | 0     | 15,000  | 20 Nov   | 61 days       | Overdue 60+  | OVERDUE     | Edit / Delete |
| INV-018    | 20 Oct | 8,500       | 3,000 | 5,500   | 5 Nov    | 89 days       | Overdue 60+  | OVERDUE     | Edit / Delete |
| INV-011    | 1 Oct  | 12,000      | 5,000 | 7,000   | 16 Oct   | 105 days      | Overdue 60+  | OVERDUE     | Edit / Delete |

> **[FIX — v8]** `Days Past Due` and **Edit / Delete** action columns added.

---

### Page 2 — Blocked Accounts

| Shop Name   | Phone        | Overdue | Blocked Date | Reason                              | Action  |
| ----------- | ------------ | ------- | ------------ | ----------------------------------- | ------- |
| Saleem Mart | 0321-9876543 | 45,000  | 15 Dec       | 60+ days overdue, no response       | Unblock |
| Tariq Store | 0300-5555555 | 18,000  | 28 Dec       | Owner decision — reliability issues | Unblock |
| Raza Pan    | 0333-1122334 | 22,000  | 10 Jan       | Bounced cheque                      | Unblock |
| Malik Store | 0312-9988776 | 67,000  | 5 Jan        | 90+ days no payment                 | Unblock |
| Sana Mart   | 0345-6677889 | 11,500  | 2 Jan        | Disputed delivery, no resolution    | Unblock |

- **Unblock (per row)** — shop returns to prior type with all history intact
- **Export CSV** / **Export Excel**

---

## TAB 3 — Inventory Control (5 Pages)

> Tab 3 now has **5 pages**: Physical Loading Count remains removed (its job is on Tab 1 Page 2); Empties Log is added as the new Page 5.

---

### Page 1 — Warehouse Stock

> **[v8 change]** The `Empties` column is **removed** from this table. Empties are now tracked exclusively on Tab 3 Page 5.

| Product     | Total Qty | Reserved | Available | Flappy | Action        |
| ----------- | --------- | -------- | --------- | ------ | ------------- |
| Coke 1.5L   | 850       | 120      | 715       | 15     | Edit / Delete |
| Coke 330ml  | 1,200     | 80       | 1,112     | 8      | Edit / Delete |
| Sprite 1L   | 600       | 45       | 550       | 5      | Edit / Delete |
| Fanta 500ml | 400       | 30       | 366       | 4      | Edit / Delete |
| Sprite 1.5L | 300       | 20       | 278       | 2      | Edit / Delete |

#### Buttons & Actions

- **Add Product** — new product row by hand
- **Edit / Delete (per row)**
- **Export CSV** / **Export Excel**

---

### Page 2 — Flappy / Damaged Stock

| Product     | Qty | Damage Type    | Batch     | Recorded | Webspace Ref | Status          | Note                | Action        |
| ----------- | --- | -------------- | --------- | -------- | ------------ | --------------- | ------------------- | ------------- |
| Coke 1.5L   | 15  | Leaking caps   | B-2024-11 | 3 Jan    | WS-0441      | Complaint Filed | Awaiting CCBPL      | Edit / Delete |
| Sprite 1L   | 8   | Broken bottles | B-2024-11 | 4 Jan    | —            | Pending         | Filing Monday       | Edit / Delete |
| Coke 330ml  | 6   | Dented cans    | B-2025-01 | 6 Jan    | WS-0452      | Complaint Filed | Sent via Webspace   | Edit / Delete |
| Fanta 500ml | 3   | Label damage   | B-2025-01 | 7 Jan    | —            | Pending         | Will file this week | Edit / Delete |
| Sprite 1.5L | 2   | Cracked caps   | B-2025-01 | 7 Jan    | WS-0453      | Adjusted        | CCBPL credited      | Edit / Delete |

#### [FIX — v7] Two field-type fixes

- **Product** — dropdown of already-entered products (not free text)
- **Status** — dropdown: Pending / Complaint Filed / Adjusted (not free text)
- **Damage Type** and **Note** — remain free-text

#### Statuses

| Status          | Meaning                                      |
| --------------- | -------------------------------------------- |
| Pending         | Recorded; complaint not yet filed with CCBPL |
| Complaint Filed | Webspace reference entered                   |
| Adjusted        | CCBPL has credited the Distributor           |

> **REMOVED (v7):** Auto-write to CCBPL Ledger on Adjusted. Auto-creation of Pending row from Tab 6 Page 2 Flappy Qty. Both are now manual.

- **Export CSV** / **Export Excel**

---

### Page 3 — Returns / Wayback

| Shop        | Product     | Orig Invoice | Rcvd Qty | Status   | Return Date | Action               |
| ----------- | ----------- | ------------ | -------- | -------- | ----------- | -------------------- |
| Bilal Mart  | Coke 1.5L   | INV-021      | 10       | Approved | 5 Jan       | Edit / Delete        |
| Ahmed Store | Sprite 1L   | INV-018      | 3        | Rejected | 6 Jan       | Edit / Delete / View |
| Khan Store  | Fanta 500ml | INV-031      | 5        | Approved | 7 Jan       | Edit / Delete        |
| Raza Pan    | Coke 330ml  | INV-011      | 12       | Rejected | 8 Jan       | Edit / Delete / View |
| Tariq Shop  | Sprite 1.5L | INV-044      | 4        | Approved | 9 Jan       | Edit / Delete        |

> **[FIX — v8]** A **View** button is added per row. Clicking View shows the rejection reason in a context dropdown inline (for Rejected rows). Approved rows show "No reason required."

#### Rules

- **Approved** — no reason required; Rcvd Qty added back to Warehouse Stock immediately
- **Rejected** — typed reason required; reason visible via View button
- **Export CSV** / **Export Excel**

---

### Page 4 — Stock Count / Audit

| Audit Date | Scheduled | Products Counted | Discrepancies | Status    | Action                      |
| ---------- | --------- | ---------------- | ------------- | --------- | --------------------------- |
| 5 Jan      | 5 Jan     | 12 products      | 2             | Completed | Edit / Delete / View Report |
| 12 Jan     | 12 Jan    | —                | —             | Scheduled | Edit / Delete / Start Count |
| 19 Jan     | 19 Jan    | —                | —             | Scheduled | Edit / Delete / Start Count |
| 26 Jan     | 26 Jan    | —                | —             | Scheduled | Edit / Delete / Start Count |
| 2 Feb      | 2 Feb     | —                | —             | Scheduled | Edit / Delete / Start Count |

#### Buttons & Actions

- **Schedule Audit** — picks a date
- **Start Count** — opens form with every product; system qty pre-filled; blank box for real count
- **Complete Audit** — saves, calculates discrepancies, corrects `warehouse_stock.qty_total` to match physical count
- **View Report** — finished comparison
- **Edit / Delete**
- **Export CSV** / **Export Excel**

---

### Page 5 — Empties Log [FINDING 5 — NEW in v8]

This is a new, dedicated page for recording returnable bottles and empties. It replaces the removed `qty_empties` column from Tab 3 Page 1.

#### Table View

| Shop        | Invoice No | Product     | Quantity | Deposit Amount | Log Date | Action        |
| ----------- | ---------- | ----------- | -------- | -------------- | -------- | ------------- |
| Ahmed Store | INV-001    | Coke 1.5L   | 20       | 400.00         | 1 Jan    | Edit / Delete |
| Bilal Mart  | INV-002    | Coke 330ml  | 50       | 250.00         | 1 Jan    | Edit / Delete |
| Khan Store  | INV-045    | Sprite 1L   | 15       | 150.00         | 10 Dec   | Edit / Delete |
| Raza Pan    | INV-003    | Fanta 500ml | 15       | 75.00          | 2 Jan    | Edit / Delete |
| Tariq Shop  | INV-005    | Coke 1.5L   | 10       | 200.00         | 3 Jan    | Edit / Delete |

#### Add Empty Entry Form

| Field          | Type         | Notes                                                                                    |
| -------------- | ------------ | ---------------------------------------------------------------------------------------- |
| Shop           | Dropdown     | From `shops` table                                                                       |
| Invoice No     | Text input   | Matched against `invoices.invoice_no` for this tenant; links to `empties_log.invoice_id` |
| Product        | Dropdown     | From products in `warehouse_stock`                                                       |
| Quantity       | Number input |                                                                                          |
| Deposit Amount | Number input | Total deposit for this empties batch                                                     |
| Log Date       | Date picker  | Defaults to today                                                                        |

> Clicking **Add Empty Entries** opens this form. The Invoice No field validates against existing invoice numbers on blur — if no match is found, a warning appears: "Invoice No not found — entry will be saved unlinked."

#### Buttons & Actions

- **Add Empty Entries** — opens the Add form above
- **Edit / Delete (per row)**
- **Export CSV** / **Export Excel**

---

## TAB 4 — Delivery & Cash Tracking

### Page 1 — Daily Summary

| Date  | DM             | Route   | Cash Invoices | Expected (Rs.) | Submitted (Rs.) | Difference | Status    |
| ----- | -------------- | ------- | ------------- | -------------- | --------------- | ---------- | --------- |
| 3 Jan | Asif Khan      | Gulshan | 6             | 31,500         | 28,750          | 2,750      | SHORTFALL |
| 3 Jan | Khalid Mahmood | North   | 8             | 18,000         | 18,000          | 0          | OK        |
| 3 Jan | Usman Ali      | Clifton | 5             | 12,400         | 12,400          | 0          | OK        |
| 3 Jan | Mehmood Raza   | Saddar  | 4             | 9,800          | 8,500           | 1,300      | SHORTFALL |
| 3 Jan | Tariq Hassan   | Korangi | 7             | 22,000         | 22,000          | 0          | OK        |

#### Drill-Down (clicking a row — one row per invoice)

| Invoice No | Shop        | Type   | Grand Total | Visit     | Delivery    | Reason          | Submitted | Diff.    | Status      | Action        |
| ---------- | ----------- | ------ | ----------- | --------- | ----------- | --------------- | --------- | -------- | ----------- | ------------- |
| INV-001    | Ahmed Store | Credit | 4,472.40    | Visited   | Delivered   | —               | 0         | 4,472.40 | Delivered   | Edit / Delete |
| INV-002    | Bilal Mart  | Cash   | 6,000.00    | Visited   | Delivered   | —               | 6,000     | 0        | Delivered   | Edit / Delete |
| INV-003    | Raza Pan    | Cash   | 1,800.00    | Visited   | Undelivered | Cash Refused    | 0         | 1,800    | Undelivered | Edit / Delete |
| INV-004    | Khan Store  | Cash   | 6,750.00    | Unvisited | Undelivered | Due to Accident | 0         | 6,750    | Pending     | Edit / Delete |
| INV-005    | Tariq Shop  | Credit | 3,200.00    | Visited   | Delivered   | —               | 0         | 3,200    | Delivered   | Edit / Delete |

> **[REMOVED — v7]** The `Confirm.` column (YES ✓ / NO ✗ / Unresponded) is deleted entirely.
> **[FIX — v8]** `Edit / Delete` action column added to the drill-down table.

#### Buttons & Actions

- **Edit (per row)** — change Visit, Delivery, Reason, or Submitted
- **Delete (per row)**
- **Export CSV** / **Export Excel**

---

### Page 2 — Cash Deposit Register

| Deposit Date | Amount | Bank        | Bank Ref No  | For Date | Status    | Action        |
| ------------ | ------ | ----------- | ------------ | -------- | --------- | ------------- |
| 4 Jan        | 59,700 | HBL Main    | HBL-TXN-8845 | 3 Jan    | Deposited | Edit / Delete |
| 3 Jan        | 28,750 | MCB Branch  | MCB-2025-001 | 2 Jan    | Deposited | Edit / Delete |
| 5 Jan        | 18,000 | HBL Main    | HBL-TXN-8901 | 4 Jan    | Deposited | Edit / Delete |
| 6 Jan        | 22,000 | Meezan Bank | MZN-TXN-0342 | 5 Jan    | Deposited | Edit / Delete |
| 7 Jan        | 31,500 | HBL Main    | HBL-TXN-9010 | 6 Jan    | Pending   | Edit / Delete |

> **[FIX — v8]** `Edit / Delete` action column added.

**Add Deposit** is pre-filled: Amount = that day's total Submitted from Page 1; For Date = same date. Distributor types Bank Name and Bank Ref No only.

#### Edit Rules

- Can change: Deposit Date, Bank, Bank Ref No, Status, Amount
- Changing **Amount** requires a typed reason → reason shown in a dropdown on that row
- A changed Amount here does **not** affect any field on any other page

#### Buttons & Actions

- **Edit / Delete (per row)**
- **Export CSV** / **Export Excel**

> Feeds the **Cash Not Deposited** alert: cash submitted but no matching deposit within the set hours.

---

### Page 3 — Cash Reconciliation Dashboard

> **[REMOVED + FIX — v7 + v8]** "Cash Submitted (to Distributor)" row is **completely removed** per v8 directive. The table now has two rows only.

#### Filters

- **Date** — exact day to inspect
- **Status** — every row / only SHORTFALL rows

> **[REMOVED — v7]** Year filter removed; the Date picker handles year navigation.

#### Reconciliation Table

| Step in Chain           | Date   | This Week | Month     | Gap   | Status    |
| ----------------------- | ------ | --------- | --------- | ----- | --------- |
| Cash Invoices Delivered | 62,450 | 3,41,800  | 15,00,000 | —     | —         |
| Bank Deposited          | 59,700 | 3,38,200  | 14,92,000 | 2,750 | SHORTFALL |

**Row Calculations:**

- **Cash Invoices Delivered** — `SUM(grand_total)` for all cash invoices where `delivery_status = 'delivered'`
- **Bank Deposited** — matching total from the Cash Deposit Register (Page 2). Gap shows cash collected but not yet taken to the bank.

- **Export CSV** / **Export Excel**

---

## TAB 5 — Data Backup (1 Page)

### Page 1 — Backup Status & Download

| Backup Date | Status    | Triggered By | Action   |
| ----------- | --------- | ------------ | -------- |
| 7 Jan       | Completed | Manual       | Download |
| 5 Jan       | Completed | Manual       | Download |
| 3 Jan       | Completed | Manual       | Download |
| 1 Jan       | Completed | Manual       | Download |
| 28 Dec      | Completed | Manual       | Download |

> **[FIX — v7]** Modules and Size columns removed. Every entry is Manual. No nightly cron.

#### Buttons & Actions

- **Backup Now** — triggers an immediate backup for this distribution only
- **Download** — temporary, secure link
- **Export CSV** / **Export Excel**

**REMOVED — Page 2 (Module-Wise Backup)** and **Job 3 (Nightly Backup cron)** — both deleted in v7.

---

## TAB 6 — CCBPL Accounts (4 Pages)

### Page 1 — Agency Ledger

**Reworked balance model (v7):** Stock purchasing is a liability. The running Balance starts negative. Every sale or earning entered via Add Revenue deducts from that negative balance. Entries from Pages 2, 3, and 4 post here as further negative-direction entries.

| Date  | Description                | Amount In | Balance   |
| ----- | -------------------------- | --------- | --------- |
| 1 Jan | Opening Balance            | —         | -1,50,000 |
| 3 Jan | Cash Collected (DM routes) | 62,000    | -88,000   |
| 4 Jan | Flappy Return              | 10,000    | -78,000   |
| 5 Jan | Cash Collected (DM routes) | 28,750    | -49,250   |
| 6 Jan | Agency Expense — Fuel      | —         | -56,250   |

#### Buttons & Actions

- **Add Revenue** — Date, Description, Amount In; deducts from (reduces magnitude of) negative Balance
- **Export CSV** / **Export Excel**

---

### Page 2 — Purchasing from CCBPL (was Page 3 in old numbering)

> **[v8 — Status Workflow Rewritten]**
>
> - **"Under Review"** → replaced by **"In Progress"**
> - **"Complaint Submitted"** → replaced by **"Stock Arrived"**
> - **State Constraint:** While status = "In Progress" → zero writes to Warehouse Stock or Agency Ledger
> - When status is changed to "Stock Arrived" → `warehouse_stock.qty_total` increments by `Received Qty` AND Agency Ledger receives the purchase entry immediately

> **[v8 — Flappy Qty field REMOVED]** All stock is real-world count. Damaged stock is logged manually on Tab 3 Page 2.

| PO No      | Product     | Ordered Qty | Received Qty | Billed   | Status        | Action        |
| ---------- | ----------- | ----------- | ------------ | -------- | ------------- | ------------- |
| PO-2025-01 | Coke 1.5L   | 500         | 492          | 4,50,000 | In Progress   | Edit / Delete |
| PO-2024-48 | Sprite 1L   | 400         | 400          | 3,60,000 | Stock Arrived | Edit / Delete |
| PO-2025-02 | Coke 330ml  | 300         | 295          | 1,47,500 | In Progress   | Edit / Delete |
| PO-2025-03 | Fanta 500ml | 200         | 200          | 1,00,000 | Stock Arrived | Edit / Delete |
| PO-2025-04 | Sprite 1.5L | 150         | 148          | 74,000   | In Progress   | Edit / Delete |

**Status Behaviour Summary:**

| Status        | Warehouse Stock                         | Agency Ledger                     |
| ------------- | --------------------------------------- | --------------------------------- |
| In Progress   | No change                               | No change                         |
| Stock Arrived | `qty_total += Received Qty` immediately | Purchase entry posted immediately |

#### Buttons & Actions

- **Edit / Delete (per row)**
- **Mark Stock Arrived (In Progress rows)** — triggers both DB writes above
- **Export CSV** / **Export Excel**

---

### Page 3 — Agency Expenses (was Page 4)

| Date  | Category      | Description                   | Amount | Paid By | Action        |
| ----- | ------------- | ----------------------------- | ------ | ------- | ------------- |
| 3 Jan | Fuel          | Diesel for TRK-01 and TRK-02  | 7,000  | Owner   | Edit / Delete |
| 3 Jan | Maintenance   | Tyre change TRK-02            | 8,200  | Owner   | Edit / Delete |
| 5 Jan | Salary        | DM salaries — January advance | 35,000 | Owner   | Edit / Delete |
| 6 Jan | Fuel          | Diesel for TRK-03 and TRK-04  | 6,500  | Owner   | Edit / Delete |
| 7 Jan | Miscellaneous | Office stationery             | 1,200  | Owner   | Edit / Delete |

- **Edit / Delete (per row)**
- **Export CSV** / **Export Excel**

---

### Page 4 — CCBPL Penalties Register (was Page 5)

| Date   | CCBPL Ref   | Amount | Reason                     | Status   | Action        |
| ------ | ----------- | ------ | -------------------------- | -------- | ------------- |
| 6 Jan  | PEN-2025-01 | 15,000 | Display compliance failure | Disputed | Edit / Delete |
| 5 Dec  | PEN-2024-44 | 8,000  | Target shortfall November  | Paid     | Edit / Delete |
| 10 Nov | PEN-2024-38 | 12,000 | Cooling unit compliance    | Pending  | Edit / Delete |
| 3 Nov  | PEN-2024-35 | 5,000  | Planogram violation        | Resolved | Edit / Delete |
| 18 Oct | PEN-2024-30 | 9,500  | Monthly target shortfall   | Paid     | Edit / Delete |

- **Dispute (per row)** — typed note before raising with CCBPL directly
- **Edit / Delete (per row)**
- **Export CSV** / **Export Excel**

**REMOVED — CCBPL Ledger running-balance page (v7):** The dedicated running-balance page is deleted. The `ccbpl_ledger` table is kept — Tab 6 Page 2 and Page 4 still write to it — but it no longer has its own dashboard.

---

## TAB 7 — Reports & Alerts (2 Pages)

### Page 1 — Stock Discrepancy Report

> **[FIX — v8]** This report only shows products where the Diff is **not zero**. Audits where every product matched exactly (Diff = 0 for all) do not appear here at all — they are complete and correct and have nothing to investigate.

| Product     | System Qty | Physical Qty | Diff | Audit Date | Status   | Action        |
| ----------- | ---------- | ------------ | ---- | ---------- | -------- | ------------- |
| Coke 330ml  | 1,200      | 1,185        | −15  | 5 Jan      | Disputed | Edit / Delete |
| Sprite 1L   | 600        | 598          | −2   | 5 Jan      | Resolved | Edit / Delete |
| Coke 1.5L   | 850        | 831          | −19  | 12 Jan     | Disputed | Edit / Delete |
| Sprite 1.5L | 300        | 299          | −1   | 12 Jan     | Resolved | Edit / Delete |
| Fanta 500ml | 380        | 374          | −6   | 19 Jan     | Disputed | Edit / Delete |

> Products where System Qty = Physical Qty (Diff = 0) are excluded from this table entirely.

- **Edit** — change Status (Resolved requires typed reason; Disputed does not)
- **Export CSV** / **Export Excel**

---

### Page 2 — Real-Time Alerts Feed

| Time  | Alert Type         | Details                          | Severity | Status | Action    |
| ----- | ------------------ | -------------------------------- | -------- | ------ | --------- |
| 09:15 | Cash Not Deposited | Rs.62,450 — 26 hours undeposited | HIGH     | Unread | Mark Read |
| 07:00 | Overdue Threshold  | Khan Store — 60 days overdue     | HIGH     | Read   | Mark Read |
| 06:30 | Cash Not Deposited | Rs.18,000 — 30 hours undeposited | MEDIUM   | Unread | Mark Read |
| 05:45 | Overdue Threshold  | Bai Store — 45 days overdue      | HIGH     | Unread | Mark Read |
| 04:00 | Cash Not Deposited | Rs.9,800 — 28 hours undeposited  | MEDIUM   | Read   | Mark Read |

> **[FIX — v7]** Only two alert types. Action is **Mark Read** only — no Resolved/Disputed, no reason.

**REMOVED — Delivery Dispute (NO) alert type (v7 Rule 1).**

- **Export CSV** / **Export Excel**

---

## SHOP DETAILS

> **[FIX — v8]** The Shop Details page opens with a **UI switch** at the very top — before any table — that toggles between **On Cash Shops** and **On Credit Shops**. Only one table is visible at a time. Each view has its own Search bar and Import button.

**Switch: [On Cash Shops] [On Credit Shops]**

---

### View: On Cash Shops

| Outlet Code | Shop Name   | Owner Name    | Type    | Phone No     | Action        |
| ----------- | ----------- | ------------- | ------- | ------------ | ------------- |
| 3009753479  | Ahmed Store | Ahmed Raza    | On Cash | 0300-1234567 | Edit / Delete |
| 3009753480  | Raza Pan    | Raza Ahmed    | On Cash | 0312-9988776 | Edit / Delete |
| 3009753481  | Tariq Shop  | Tariq Hassan  | On Cash | 0345-6677889 | Edit / Delete |
| 3009753482  | Sana Mart   | Sana Khan     | On Cash | 0300-4455667 | Edit / Delete |
| 3009753483  | Iqbal Store | Iqbal Hussain | On Cash | 0321-3344556 | Edit / Delete |

---

### View: On Credit Shops

| Outlet Code | Shop Name   | Owner         | Phone        | Credit Limit | Used   | Available | Overdue | Action        |
| ----------- | ----------- | ------------- | ------------ | ------------ | ------ | --------- | ------- | ------------- |
| 3009579915  | Bilal Mart  | Bilal Khan    | 0321-5550000 | 50,000       | 30,000 | 20,000    | 0       | Edit / Delete |
| 3009579916  | Khan Store  | Khan Ahmed    | 0333-1122334 | 75,000       | 45,000 | 30,000    | 45,000  | Edit / Delete |
| 3009579917  | Bai Store   | Bai Malik     | 0312-9988001 | 75,000       | 45,000 | 30,000    | 45,000  | Edit / Delete |
| 3009579918  | Saleem Mart | Saleem Raja   | 0321-9876543 | 60,000       | 55,000 | 5,000     | 20,000  | Edit / Delete |
| 3009579919  | Malik Store | Malik Hussain | 0300-7766554 | 40,000       | 38,000 | 2,000     | 38,000  | Edit / Delete |

#### Buttons & Actions (both views)

- **Import** — one at a time or bulk; matched against `outlet_code`, not phone [FINDING 4]
- **Search bar** — Shop Name, Outlet Code, or Phone (per active view)
- **Export CSV** / **Export Excel**

---

### Shop Profile Page

#### Date / Month / Year Filters [v8 — ALL profiles]

Every shop profile (On Cash and On Credit) now has global filters at the top:

| Filter | Options            | Default           |
| ------ | ------------------ | ----------------- |
| Date   | Date picker        | —                 |
| Month  | Jan – Dec dropdown | **Current month** |
| Year   | Year picker        | **Current year**  |

Default state auto-parses current month and current year on page load.

---

#### Profile of an On-Credit Shop [v8 — UI Toggle]

A UI toggle switches between two invoice tables:

**Toggle: [Credit Invoices] [Cash Invoices]**

---

**Credit Invoices View:**

> **[FIX — v8]** `Aging Bucket` is split into **two separate fields**: `Aging Days` (the raw number of days since the invoice was generated) and `Bucket` (the bracket label). They are distinct columns.

| Inv No  | Type   | Aging Days | Bucket       | Gen. Date | Sched. Date | Status    | Payment     | DM             |
| ------- | ------ | ---------- | ------------ | --------- | ----------- | --------- | ----------- | -------------- |
| INV-001 | Credit | 26         | Overdue 1-30 | 10 Dec    | 12 Dec      | Delivered | Outstanding | Asif Khan      |
| INV-045 | Credit | 26         | Overdue 1-30 | 10 Dec    | 12 Dec      | Delivered | Outstanding | Asif Khan      |
| INV-032 | Credit | 61         | Overdue 60+  | 5 Nov     | 7 Nov       | Delivered | Outstanding | Khalid Mahmood |
| INV-018 | Credit | 89         | Overdue 60+  | 20 Oct    | 22 Oct      | Delivered | Partial     | Asif Khan      |
| INV-011 | Credit | 105        | Overdue 60+  | 1 Oct     | 3 Oct       | Delivered | Outstanding | Khalid Mahmood |

**Aging Days** — live count of calendar days from `invoice_date` to today.
**Bucket** — bracket derived from Aging Days: Not Yet Due / 1-30 / 31-60 / 60+.
**Payment** — three possible values: **Paid** (amount_received ≥ grand_total) · **Partial** (some amount received, balance remains) · **Outstanding** (zero received).

**Cash Invoices View (same shop):**

| Inv No  | Type | Gen. Date | Sched. Date | Payment | DM             |
| ------- | ---- | --------- | ----------- | ------- | -------------- |
| INV-014 | Cash | 2 Jan     | 3 Jan       | Paid    | Asif Khan      |
| INV-009 | Cash | 15 Dec    | 16 Dec      | Paid    | Khalid Mahmood |
| INV-003 | Cash | 1 Dec     | 2 Dec       | Paid    | Asif Khan      |
| INV-001 | Cash | 15 Nov    | 16 Nov      | Paid    | Khalid Mahmood |
| INV-020 | Cash | 2 Nov     | 3 Nov       | Paid    | Asif Khan      |

> **[REMOVED — v7]** Delivery and Confirmed columns both dropped from credit profile.
> **[REMOVED — v7]** Notifications Box (per-shop WhatsApp toggle) removed from all profiles.

---

#### Profile of an On-Cash Shop

| Inv No  | Type | Gen. Date | Sched. Date | Payment     | DM             |
| ------- | ---- | --------- | ----------- | ----------- | -------------- |
| INV-002 | Cash | 1 Jan     | 2 Jan       | Paid        | Khalid Mahmood |
| INV-007 | Cash | 5 Jan     | 6 Jan       | Paid        | Asif Khan      |
| INV-012 | Cash | 10 Jan    | 11 Jan      | Paid        | Khalid Mahmood |
| INV-017 | Cash | 15 Jan    | 16 Jan      | Paid        | Asif Khan      |
| INV-022 | Cash | 20 Jan    | 21 Jan      | Outstanding | Khalid Mahmood |

---

## SYSTEM SETTINGS

### Section 2 — Global Features

| Feature                        | Description                                              | Status   | Action |
| ------------------------------ | -------------------------------------------------------- | -------- | ------ |
| Auto-Assign Invoices to Trucks | Groups invoices onto each DM's usual route automatically | Disabled | Enable |

### Section 3 — Alert Configuration

| Alert Type         | Condition                                                                | Status  | Action  |
| ------------------ | ------------------------------------------------------------------------ | ------- | ------- |
| Cash Not Deposited | Cash submitted but no deposit within set hours                           | Enabled | Disable |
| Overdue Threshold  | A credit invoice crosses its own due date, then this many more days pass | Enabled | Disable |

#### Threshold Numbers [FIX — v7]

- **Late Bank Deposit Hours** — input shown when enabling; placeholder 24; once enabled shows "Enabled (24 hrs)"
- **Overdue Account Days** — default changed to **0** (fires the moment due date is crossed + this many additional days)

**REMOVED — Delivery Dispute (NO) alert row (v7 Rule 1)**

---

## ADMIN PANEL

### /admin/dashboard — [RULE 3] Phone No. Mandatory

| Distro Name        | Phone No.    | Email           | Access   | Created | Last Edit | Action        |
| ------------------ | ------------ | --------------- | -------- | ------- | --------- | ------------- |
| Ahmed Distribution | 0300-1234567 | ahmed@email.com | Enabled  | 17 Jun  | 18 Jun    | Edit / Delete |
| Bilal Beverages    | 0321-5550001 | bilal@email.com | Enabled  | 15 Jun  | 15 Jun    | Edit / Delete |
| Khan Distributors  | 0321-9988776 | khan@email.com  | Disabled | 10 Jun  | 17 Jun    | Edit / Delete |
| Usman Trading      | 0345-6677889 | usman@email.com | Enabled  | 8 Jun   | 12 Jun    | Edit / Delete |
| Raza Supplies      | 0312-9988001 | raza@email.com  | Enabled  | 5 Jun   | 10 Jun    | Edit / Delete |

> **[FIX — v8]** `Edit / Delete` action column added.
> **[RULE 3]** Phone No. is required (NOT NULL) for every distribution. Plain contact field only — no notification role.

- Search by name or phone
- Filter by Enabled / Disabled and creation date
- **Export to Excel**

---

### /admin/tenants/[id] — Distribution Config Board

**REMOVED — Notifications toggle (v7 Rule 1).** Page is now just the Tabs & Pages matrix plus a read-only mirror of the two alert settings.

| Flag Key     | Label                                        | Status  |
| ------------ | -------------------------------------------- | ------- |
| tab1         | Tab 1 — Sales & Invoice Management           | Enabled |
| tab2         | Tab 2 — Credit Control                       | Enabled |
| tab3         | Tab 3 — Inventory Control (Pages 1-5)        | Enabled |
| tab4         | Tab 4 — Delivery & Cash Tracking (Pages 1-3) | Enabled |
| tab5         | Tab 5 — Data Backup (Page 1)                 | Enabled |
| tab6         | Tab 6 — CCBPL Accounts (Pages 1-4)           | Enabled |
| tab7         | Tab 7 — Reports & Alerts (Pages 1-2)         | Enabled |
| shop_details | Shop Details                                 | Enabled |

---

### /admin/settings

#### Section 1 — Global Tabs & Pages

Same flag list as above — every toggle is GLOBAL (changes all distributions simultaneously).

#### Section 2 — Global Alert Settings (was Section 3; old Section 2 deleted — v7)

| Alert Type         | Status  | Action  |
| ------------------ | ------- | ------- |
| Cash Not Deposited | Enabled | Disable |
| Overdue Threshold  | Enabled | Disable |

Below the two toggles: **Emergency Banner** composer — text box + Activate button → banner appears on every distribution's dashboard instantly until Admin clicks Deactivate.

**REMOVED — Section 2, Global Notifications (v7 Rule 1).** Zero notifications exist; nothing left to configure.

---

### /admin/logs

| PK  | Timestamp     | Pages Visited | IP Address   | MDOS User | Distribution       | Action |
| --- | ------------- | ------------- | ------------ | --------- | ------------------ | ------ |
| 1   | 18 Jun, 19:03 | 3 pages ▾     | 203.0.113.41 | Yes       | Ahmed Distribution | Delete |
| 2   | 18 Jun, 21:40 | 1 page        | 182.176.0.5  | No        | —                  | Delete |
| 3   | 19 Jun, 08:15 | 5 pages ▾     | 203.0.113.41 | Yes       | Ahmed Distribution | Delete |
| 4   | 19 Jun, 10:00 | 2 pages ▾     | 192.168.1.10 | Yes       | Khan Distributors  | Delete |
| 5   | 19 Jun, 14:30 | 4 pages ▾     | 203.0.113.55 | Yes       | Bilal Beverages    | Delete |

- Search by IP, date range, PKT time
- **Delete** / **Export to Excel**

---

## End-to-End System Narrative

### Part A — The One Idea Behind the Whole System

MDOS is one big shared database, split into invisible walls. Every row in every table belongs to exactly one `tenant_id`. Postgres RLS — not application code — refuses to ever show or change a row that does not belong to the logged-in tenant. This is the single most important safety rule in the whole system.

---

### Part B — The Complete Life of One Invoice

**Step 1 — Invoice Created**

- Check: does this `invoice_no` already exist for this `tenant_id`?
  - If yes + `delivery_status` is `delivered` or `undelivered` → stop: "Invoice No already existed in delivered / undelivered status."
  - If yes + `delivery_status` is `pending` → stop: "Invoice No already existed as Pending, so Reschedule it."
  - If no match → save. `delivery_status` starts as **`undispatched`**. `amount_received` starts at 0. `dm_id` = NULL.

**Step 2 — Stock Reserved**

Parse `products` text → `{product_name, quantity}` pairs → `warehouse_stock.qty_reserved += quantity` for each. Stock is **reserved**, not yet removed.

**Step 3 — Invoice Gets onto a Truck**

- **Auto-Assign ON** — when `dm_id` and `scheduled_date` are both set, a trigger matches `dm_routes` and creates/updates a `route_assignments` row automatically.
- **Auto-Assign OFF** — Distributor uploads a Route CSV/Excel; rows written directly to `route_assignments`.

**Step 4 — Truck Returns**

Distributor clicks Mark Truck Returned → `route_assignments.status = 'returned'`. Visual flag only — does not block other actions.

**Step 5 — Distributor Records What Happened (Tab 4 Page 1)**

Visit (visited / unvisited) + Delivery (delivered / undelivered) + optional Reason. Never part of the notification feature.

**Step 6 — Successful Delivery Moves Stock**

When `delivery_status` becomes `delivered`:

- `warehouse_stock.qty_total -= quantity` (for each product pair)
- `warehouse_stock.qty_reserved -= quantity` (same amount — goes from "promised" to "gone")

**REMOVED from this step** — WhatsApp send, Part C (four-layer check). Deleted in full (v7 Rule 1). A delivered invoice does exactly one thing: move stock.

**Step 7 — Money Comes In**

`amount_received` starts at 0. Editable from Tab 4 (invoice row) or Tab 2 (unpaid sub-page). Both write the same column. `payment_status` recalculates as a generated column instantly.

**Step 8 — Invoice Appears in Summaries**

No second save needed anywhere. Every summary — Tab 1 Mark Overdue check, Tab 2 credit balances, Tab 4 daily reconciliation, Stock Discrepancy Report — reads live from this one `invoices` row.

---

### Stock Can Also Arrive From Outside an Invoice

- **From CCBPL (Tab 6 Page 2)** — when status changes to "Stock Arrived", `warehouse_stock.qty_total` increments by `Received Qty`. (v8: no Flappy Qty auto-row on Tab 3 Page 2)
- **From a Stock Audit (Tab 3 Page 4)** — on Complete Audit, `warehouse_stock.qty_total` is corrected to physical count; difference stays for Stock Discrepancy Report.
- **From Empties handling (Tab 3 Page 5)** — every row logged to `empties_log` is a standalone record. The `empties_deposit` on the invoice is the deposit collected; empties quantities are tracked per entry in `empties_log`.

---

### Part C — [REMOVED — v7 Rule 1]

The four-layer WhatsApp check, three message templates, `sms_logs` write, `invoices.confirmation`, webhook handling, and `delivery_dispute` alert — all deleted. This heading is preserved to keep Part D/E/F lettering unchanged.

---

### Part D — Everything That Runs Automatically

Two pg_cron jobs only. Both run once for the whole database; they respect `tenant_id` naturally by copying it from each row they read.

- **Job 1 — Late Delivery Check (nightly)** — for everything undelivered, the new `late_deliveries` row copies whichever of `pending` / `undelivered` the invoice's `delivery_status` already holds (not always hard-coded `pending`).
- **Job 2 — Cash Not Deposited Check (hourly)**

**REMOVED — Job 3 (Nightly Backup)** — deleted in v7. Manual only.

---

### Part E — How an Alert Becomes Visible

Two alert types remain:

| Alert Type         | Fires When                                                                 |
| ------------------ | -------------------------------------------------------------------------- |
| Cash Not Deposited | Job 2 finds old undeposited cash                                           |
| Overdue Threshold  | A credit invoice's `due_date` has passed the tenant's `overdue_alert_days` |

Alerts appear live on the Alerts Feed via Supabase Realtime — the moment a row is inserted, it appears on screen without refresh. The Distributor clicks **Mark Read**. That is the only action. No Resolved/Disputed, no reason field on alerts.

---

### Part F — The Admin's Own View

The Admin logs in at `/admin`. They see every distribution. They can toggle any Tab or Page globally (writes one row in `global_feature_flags`; every Distributor's next page load sees the new value instantly). They compose and activate Emergency Banners. They read access logs. They do not interact with invoices, stock, or routes directly.

---

## Flow and Logic — How a Distribution Actually Uses MDOS

Parts A through F above explained the exact mechanics behind every action. This section is simpler on purpose — it just follows the story of how a distribution actually uses MDOS, page by page, including the Admin side, so the whole system makes sense as one connected picture rather than a list of separate features.

---

### Getting Started — Before Any Invoice Exists

- First, the Distributor opens **Shop Details** and brings in every shop they already deal with — either typing them in one at a time, or importing them all at once from a file, matched against **Outlet Code** [Finding 4]. This is the one-time setup step.
- Next, if Auto-Assign is going to be used, the Distributor opens **Tab 1 Page 2** and registers each Delivery Man's usual Truck and Route in the **DM/Truck/Route Registry** — again, either one at a time with Add Routes, or all at once with Import Routes. [FIX] This registry now sits **above** the daily assignment table on the same page, so it is the first thing seen there.
- Both of these can be corrected later at any time using the normal Edit button on each entry — this first pass is just to get the basic facts of the business into the system before daily work begins.
- Only once shops and routes exist does the Distributor start importing or typing in actual invoices.

---

### Tab 1 — Sales & Invoice Management

- **Page 1** is where every invoice is born — typed in by hand, or brought in from a Voyage file. [Finding 9] Every invoice now carries its own Discount and Advance Tax alongside the base Invoice Total, so Grand Total is always the number actually owed. [Finding 5] Empties/Deposit is logged here too, but kept separate from Grand Total.
- **Page 2** takes those invoices and groups them onto trucks, either automatically (Auto-Assign, using the routes registered during setup) or from an imported route file. [FIX — Tab 3 Page 3 removal] This page now also carries the Invoice Total and Products columns that used to live on a separate Physical Loading Count page — the Distributor checks what is really on the truck right here.
- **Page 3** watches quietly every night for any invoice that did not go perfectly — using exactly the Visit and Delivery information that gets recorded over on Tab 4 Page 1. It does not collect its own information; it simply reads what Tab 4 already knows. [FIX] Disputed, not Resolved, is now the action that needs a typed reason.

---

### Tab 2 — Credit Control

- **Page 1** reads the shop list straight from Shop Details and lays it out as a financial dashboard — credit limits, balances, and overdue amounts for the Credit shops (all now reading `grand_total` [Finding 9]), simple flat zeros for the Cash shops.
- The unpaid-invoices sub-page on Page 1 is also where the Distributor can mark a Credit invoice as paid, one invoice at a time, oldest first.
- **Page 2** is simply the list of every shop currently sitting in the Blocked state — pulled out on its own so it never gets lost inside the bigger Page 1 table. It is a live view onto `shops.is_blocked`, not a separate table of its own.

---

### Tab 3 — Inventory Control

- **Page 1** is the single number that matters most — how much stock actually exists right now. It almost never needs typing into directly, because several things keep it updated on their own: a new invoice reserves stock, a delivered invoice removes it for good, a CCBPL purchase marked Stock Arrived adds it, and a finished Stock Audit corrects it. [FIX — v8] Empties no longer live on this page at all — see Page 5.
- **Page 2** records anything damaged. [REMOVED] Unlike the prior draft, marking a row Adjusted no longer automatically writes a matching entry to any CCBPL ledger — the Distributor now records that by hand, on Tab 6 Page 1, if and when they choose to.
- [REMOVED] The prior draft's Page 3 — which checked the real, physical count loaded onto each truck against Tab 1 Page 2 — no longer exists as its own page. That same check now happens directly on Tab 1 Page 2 itself, using its two new fields.
- **Page 3** (was Page 4) handles the one simple case of a shop returning something it over-ordered, and feeds straight back into Page 1's stock count. [FIX] A reason is required only when the return is Rejected, and [FIX — v8] a View button now shows that reason in full without needing to open Edit.
- **Page 4** (was Page 5) is the full warehouse count — when it finds a difference, it does not just report it, it actually fixes Page 1's number to match reality.
- **Page 5** [NEW — Finding 5] is the Empties Log, its own dedicated page. Add Empty Entries links a new entry to an existing invoice by Invoice No — the system looks the invoice up itself and refuses the entry if no match exists, so the Shop and the invoice link are never typed by hand and can never point at the wrong shop.

---

### Tab 4 — Delivery & Cash Tracking

This Tab sits in the middle of almost everything else, so it is worth being extra clear about every page it touches.

- It **READS** invoice details from Tab 1 Page 1, and **READS** which truck and Delivery Man each invoice belongs to from Tab 1 Page 2.
- It **WRITES** the Submitted/Paid amount straight onto the invoice — and because Tab 2's sub-page and the Shop Details profile page both read that exact same number, all three screens always agree with each other without any extra syncing work.
- It **WRITES** the Visit and Delivery result onto the invoice too, which Tab 1 Page 3 reads every night to build its late-delivery list.
- A successful delivery here is also what tells Tab 3 Page 1 to actually remove the stock for good.
- **Page 2** (Cash Deposit Register) pulls its starting numbers from Page 1's daily totals, and feeds the Cash Not Deposited alert if a deposit is late.
- **Page 3** (the Reconciliation Dashboard) is really just a window onto Page 1 and Page 2's numbers, laid out so the Distributor can see exactly which step in the chain any missing cash disappeared at — now **two steps**, not four.

> **REMOVED from Tab 4's role in the system:** The prior draft said: "A successful delivery here is also what may trigger a WhatsApp message out to the shop" and "A shopkeeper's NO reply creates a Delivery Dispute alert, which shows up over on Tab 7 Page 2." Both clauses are deleted. A successful delivery now does exactly one cross-Tab thing — move the stock on Tab 3 Page 1 — and nothing a shopkeeper does can create an alert any more, because nothing is ever sent to a shopkeeper in the first place.

---

### Tab 5 — Data Backup

- [FIX] The Distributor copies every table belonging to their own distribution into a safe file by clicking **Backup Now** — there is no longer anything that runs on its own, on a schedule, overnight.
- [REMOVED] The prior draft's Page 2 — the same idea in smaller, module-wise pieces — no longer exists. There is exactly one backup, of everything, per click.
- Nothing is ever deleted automatically. Every backup, going back to the very first one, stays available forever, because the whole point of this Tab is to have proof whenever it is needed, even much later.

---

### Tab 6 — CCBPL Accounts

- **Page 1** is a simple day-to-day money diary for the business as a whole. [FIX] It now runs on a **negative-balance model** — purchasing stock is a liability from day one, and every sale or other earning brings the balance back up toward, and eventually past, zero.
- [REMOVED] The prior draft's Page 2 — the focused version of the same idea, but only for money owed to or from CCBPL specifically — no longer has its own page. It no longer gains an automatic row when damaged stock is Adjusted either; that connection is removed along with the page.
- **Page 2** (was Page 3) is where new stock officially enters the business. [FIX — v8] Nothing moves the moment Received Qty is typed in any more — a purchase sits **In Progress** with zero effect anywhere until the Distributor marks it **Stock Arrived**, which is the one moment Tab 3 Page 1's warehouse number and Tab 6 Page 1's Agency Ledger balance both update together, automatically. Flappy Qty no longer exists on this page at all — a damaged unit found in a shipment is now recorded separately, by hand, on Tab 3 Page 2, exactly like any other damaged stock.
- **Page 3** (was Page 4) is plain day-to-day running costs — fuel, repairs, and similar.
- **Page 4** (was Page 5) keeps a record of any real financial penalty CCBPL charges the distribution, with room for the Distributor to dispute one if they disagree.

---

### Tab 7 — Reports & Alerts

- **Page 1** compares what Tab 3 Page 4's audits found against what the system expected, as a simple before-the-fact record (the actual correction happens automatically back on Tab 3 Page 1, as explained above). [FIX — v8] Only products with a non-zero difference appear here — perfectly matched products are excluded.
- **Page 2** is the live feed of every alert as it happens — cash sitting too long without a deposit, or a shop quietly drifting past its overdue threshold. [REMOVED] A shopkeeper disputing a delivery is no longer one of the things that can appear here — there is no mechanism left that could ever produce that alert. [FIX] Every alert here is closed with a single **Mark Read** action, not a Resolved/Disputed choice.

---

### Shop Details

- This page is where shops are actually born and maintained — added, edited, switched between Cash and Credit, or removed. [Finding 4] Outlet Code, not phone, is now the permanent identity every other page and every import matches against.
- [FIX — v8] The page opens with a **UI switch** — **On Cash Shops / On Credit Shops** — at the very top. Only one table is visible at a time.
- Every other page that mentions a shop (Tab 2's credit table, every invoice's Shop column, the Returns page) is really just looking at the same `shops` table this page manages directly.
- Clicking into one shop's own Profile page is the closest thing MDOS has to a single full history of that shop — every invoice it has ever had, split by Cash and Credit via the toggle on the On-Credit profile.

> **REMOVED from Shop Details' own description:** The prior draft closed this bullet with "...plus the one switch deciding whether that shop even gets a WhatsApp message at all." That switch (the per-shop Notifications box) no longer exists, so a shop's Profile page now opens directly onto its invoice table and nothing else.

---

### System Settings

- This page manages exactly two things: whether **Auto-Assign** is switched on, and whether each of the two remaining alert types is switched on, along with their two timing numbers.

> **REVISED — the chain this page sits in:** The prior draft said: "Every switch here is the SECOND layer in a chain that starts at the Admin panel and ends, for notifications only, at one specific shop's own profile page." With the per-shop notification switch gone, there is no third link in that chain any more. What remains is simpler and still true: the Admin panel's Global Tabs & Pages and Global Alert Settings are the **first layer**, platform-wide; this page's own two switches are the **second layer**, per distribution; nothing here can turn something back on that the Admin has already switched off platform-wide.

---

### The Admin Panel — How It Watches Over Every Distribution

- The **Dashboard** is the Admin's master list of every distribution that exists — who they are, whether they currently have access, and a quick way to turn that access on or off. [RULE 3] Phone No. is now a required field for every distribution listed here, on its own, with no other feature riding on it.
- Clicking into one distribution from the Dashboard opens that distribution's own small control board — every Tab and Page can be switched on or off just for them. Anything changed here reaches that Distributor's own screen within about a second, with no need for them to refresh or sign out.

> **REMOVED from the per-distribution control board:** The prior draft continued: "...and (if they have a phone number) their own Delivery Confirmation switch can be overridden here too." That clause, and the switch it refers to, no longer exist. A distribution's control board is now only its Tabs & Pages matrix plus a read-only mirror of the platform's two Alert settings.

- **Settings** is the platform-wide version of the same idea — every switch here is the very first layer in the whole system's permission chain, affecting every distribution at once, instantly.
- **Logs** quietly record every visit to every page across the whole platform, grouped by who was visiting and from where, so the Admin can always answer "who accessed what, and when" if it is ever needed.

---

## Change Log — v7 → v8

| Area                             | Change                                                                                                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab 3 Page 1                     | `Empties` column removed                                                                                                                                                    |
| Tab 3 Page 5                     | **New page — Empties Log** with Add Empty Entries form and invoice-number linking                                                                                           |
| Tab 3 Page 3 (Returns)           | View button added; reason shown in inline context dropdown                                                                                                                  |
| Tab 4 Page 1 drill-down          | Edit / Delete action column added                                                                                                                                           |
| Tab 4 Page 2                     | Edit / Delete action column added                                                                                                                                           |
| Tab 4 Page 3                     | "Cash Submitted (to Distributor)" row completely removed                                                                                                                    |
| Tab 6 Page 2                     | Status workflow: "Under Review" → "In Progress"; "Complaint Submitted" → "Stock Arrived"; In Progress = zero DB writes; Stock Arrived = immediate warehouse + ledger writes |
| Tab 6 Page 2                     | Flappy Qty field removed                                                                                                                                                    |
| Tab 1 Page 1                     | Preseller, Promo Type, Promo, Invoice Date, Due Date, Scheduled Date confirmed in table view                                                                                |
| Tab 1 Page 2                     | Edit / Delete action column added to Daily Routes table                                                                                                                     |
| Tab 2 Page 1                     | Terms column added                                                                                                                                                          |
| Tab 2 Page 1 sub-page            | Days Past Due column added; Edit / Delete action added                                                                                                                      |
| Shop Details — On-Credit Profile | UI toggle added: Credit Invoices / Cash Invoices with distinct column sets                                                                                                  |
| All Shop Profiles                | Date / Month / Year filters added; defaults to current month + current year                                                                                                 |
| /admin/dashboard                 | Edit / Delete action column added; Phone No. confirmed mandatory                                                                                                            |
| /admin/tenants/[id]              | Tab 3 count updated to Pages 1-5; Tab 6 confirmed Pages 1-4                                                                                                                 |
| `warehouse_stock`                | `qty_empties` column removed                                                                                                                                                |
| `empties_log`                    | Table confirmed as sole tracker of empties quantity                                                                                                                         |
