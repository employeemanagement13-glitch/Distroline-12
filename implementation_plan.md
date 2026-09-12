# MDOS — 5-Day Build Plan: Implementation Plan

## Current Project State

The existing project has a **skeleton only** — not a blank slate, but close:
- Next.js 16.2.9 (App Router) + React 19, TypeScript, Tailwind CSS v4
- Clerk v7 wired into `layout.tsx` (modal sign-in/sign-up working)
- Supabase keys in `.env.local` (project already provisioned)
- `src/config/menu.ts` exists but maps **old pre-v7 tabs** (9 tabs, wrong pages, wrong paths)
- `twilio` package still installed — **must be removed**
- No database tables, no app routes, no components exist yet

Everything gets built from scratch except the Clerk + Supabase credentials and the landing page shell.

---

## User Review Required

> [!IMPORTANT]
> **Twilio package removal**: `twilio` is still in `package.json` and `.env.local` has Twilio keys. These will be removed on Day 1. Confirm this is acceptable.

> [!IMPORTANT]
> **Next.js version**: The project uses Next.js **16.2.9** (not 14 as listed in the Blueprint's Tech Stack). This version uses React Server Components, Server Actions (`use server`), and the App Router — same as described in the Blueprint. No change needed; the Blueprint description still applies.

> [!IMPORTANT]
> **Supabase migrations**: The schema SQL must be run manually in the Supabase dashboard (SQL Editor) — there is no migration runner in this stack. Each Day's schema work produces a `.sql` file that you run once.

> [!WARNING]
> **No existing pages to preserve**: The old menu structure (`menu.ts`) maps an entirely different tab structure. It will be fully replaced. The landing `page.tsx` will be kept as-is.

---

## Open Questions

> [!NOTE]
> **Admin access** ✅ ANSWERED — Same Clerk tenant; admin guard = hardcoded email check in middleware. `/admin/*` routes check `user.emailAddress === process.env.ADMIN_EMAIL`.

> [!NOTE]
> **Distributor onboarding** ✅ ANSWERED — Option A. Admin creates the `tenants` row from `/admin/dashboard`, sets `phone_number`, email, and distro name. The Distributor's Clerk account is then linked to that tenant via `public_metadata.tenant_id`. Distributors cannot self-register into a tenant.

---

## Architecture Decisions

| Decision | Choice | Reason |
|---|---|---|
| Data fetching | Server Components fetch directly from Supabase using service-role key on server; client components use `@supabase/ssr` browser client | Keeps sensitive keys server-side; RLS enforced on all client reads |
| Mutations | Server Actions (`'use server'`) called from Client Components | Next.js 16 pattern per docs |
| Auth guard | `middleware.ts` with Clerk `clerkMiddleware()` protects all routes except `/`, `/sign-in`, `/admin/login` | One guard point |
| Supabase tenant context | `current_tenant_id()` Postgres function reads from JWT claim; set via `auth.jwt() -> app_metadata -> tenant_id` | RLS works without passing tenant_id in every query |
| Real-time alerts | Supabase Realtime subscription inside a Client Component on Tab 7 Page 2 | Live feed without polling |
| Export | `xlsx` (SheetJS) + native Blob download for Excel; native CSV string for CSV | No server round-trip for export |
| PDF (Route Sheet / Invoice View) | `@react-pdf/renderer` in a Server Action that returns a blob URL | No client-side PDF dependency |

---

## File & Folder Structure

```
src/
├── app/
│   ├── layout.tsx                    ← keep, minor updates (sidebar nav)
│   ├── page.tsx                      ← keep landing page
│   ├── globals.css                   ← keep + extend
│   ├── dashboard/
│   │   └── page.tsx                  ← redirect shell; shows tab 1 page 1
│   ├── (distributor)/                ← route group; Clerk-protected
│   │   ├── layout.tsx                ← sidebar + top-bar shared layout
│   │   ├── tab1/
│   │   │   ├── invoices/page.tsx
│   │   │   ├── routes/page.tsx
│   │   │   └── late-delivery/page.tsx
│   │   ├── tab2/
│   │   │   ├── credit/page.tsx
│   │   │   └── blocked/page.tsx
│   │   ├── tab3/
│   │   │   ├── warehouse/page.tsx
│   │   │   ├── damaged/page.tsx
│   │   │   ├── returns/page.tsx
│   │   │   ├── audit/page.tsx
│   │   │   └── empties/page.tsx
│   │   ├── tab4/
│   │   │   ├── daily-summary/page.tsx
│   │   │   ├── deposits/page.tsx
│   │   │   └── reconciliation/page.tsx
│   │   ├── tab5/
│   │   │   └── backup/page.tsx
│   │   ├── tab6/
│   │   │   ├── ledger/page.tsx
│   │   │   ├── purchasing/page.tsx
│   │   │   ├── expenses/page.tsx
│   │   │   └── penalties/page.tsx
│   │   ├── tab7/
│   │   │   ├── discrepancy/page.tsx
│   │   │   └── alerts/page.tsx
│   │   ├── shop-details/
│   │   │   ├── page.tsx
│   │   │   └── [shopId]/page.tsx     ← shop profile
│   │   └── settings/page.tsx
│   ├── admin/
│   │   ├── layout.tsx                ← admin-only guard
│   │   ├── dashboard/page.tsx
│   │   ├── tenants/[id]/page.tsx
│   │   ├── settings/page.tsx
│   │   └── logs/page.tsx
│   └── api/
│       └── backup/route.ts           ← Backup Now endpoint
├── components/
│   ├── ui/                           ← Button, Input, Modal, Table, Badge, Tabs, Switch, Dropdown
│   ├── layout/                       ← Sidebar, TopBar, PageHeader
│   ├── invoice/                      ← InvoiceForm, InvoiceTable, InvoiceViewPdf
│   ├── shop/                         ← ShopTable, ShopProfile, OnCreditProfile, OnCashProfile
│   ├── export/                       ← ExportButtons (CSV + Excel, reused on every page)
│   └── realtime/                     ← AlertsFeed (Supabase Realtime client component)
├── lib/
│   ├── supabase/
│   │   ├── server.ts                 ← createServerClient (for Server Components + Actions)
│   │   └── client.ts                 ← createBrowserClient (for Client Components)
│   ├── actions/                      ← all Server Actions, one file per domain
│   │   ├── invoices.ts
│   │   ├── shops.ts
│   │   ├── routes.ts
│   │   ├── inventory.ts
│   │   ├── cash.ts
│   │   ├── ccbpl.ts
│   │   ├── backup.ts
│   │   └── admin.ts
│   ├── parsers/
│   │   ├── products.ts               ← "Coke 1.5L×20, Sprite×10" → [{name, qty}]
│   │   └── csvImport.ts              ← PapaParse wrapper for Voyage files
│   └── utils/
│       ├── export.ts                 ← toCSV() and toXlsx() helpers
│       └── agingBucket.ts            ← days → bucket label
├── config/
│   └── menu.ts                       ← REPLACED with v8 tabs
└── middleware.ts                     ← Clerk middleware
```

---

## Day 1 — Foundation: Auth Wiring, Package Cleanup, Layout Shell

> [!NOTE]
> **Schema is already applied.** Both `mdos_v7_schema.sql` and the `mdos_v8_consolidated_fixes.sql` patch are already running in Supabase. Day 1 skips schema work entirely and focuses on wiring the app to that schema.

### What gets built
1. **Package cleanup** — remove `twilio`; add `xlsx` (SheetJS); verify all other deps present
2. **`.env.local` cleanup** — remove Twilio vars; add `ADMIN_EMAIL` env var
3. **`middleware.ts`** — Clerk `clerkMiddleware()` protecting all routes; separate guard for `/admin/*` (email check against `ADMIN_EMAIL`); redirect unauthenticated users to sign-in
4. **`lib/supabase/server.ts`** — `createServerClient` for Server Components and Server Actions
5. **`lib/supabase/client.ts`** — `createBrowserClient` for Client Components
6. **`src/config/menu.ts`** — fully replaced with v8 7-tab structure and correct paths
7. **Distributor layout** — `src/app/(distributor)/layout.tsx` with left sidebar (7 tabs + Shop Details + Settings), collapsible, active-state highlighting
8. **Shared UI primitives** — `Button`, `Badge`, `Table`, `Modal`, `Input`, `Dropdown`, `Switch`, `Tabs` components in `src/components/ui/`
9. **`ExportButtons` component** — reusable CSV + Excel export buttons used on every listing page
10. **`PageHeader` component** — page title + subtitle + action slot used on every page

### End-of-day test
- `npm run dev` starts without errors
- Clerk sign-in modal works; signed-in user sees distributor layout with correct 7-tab sidebar
- `ADMIN_EMAIL` user navigating to `/admin/dashboard` is NOT blocked; any other email IS blocked and redirected
- Supabase `createServerClient` resolves without errors in a test Server Component

---

## Day 2 — Tab 1 Complete: Sales & Invoice Management

### What gets built
1. **Product parser** — `lib/parsers/products.ts`: `"Coke 1.5L×20, Sprite×10"` → `[{name:"Coke 1.5L", qty:20}, ...]`
2. **Stock reserve trigger** — Postgres function `reserve_stock_on_invoice()` called after invoice insert
3. **Stock move trigger** — Postgres function `move_stock_on_delivery()` called when `delivery_status` → `delivered`
4. **Tab 1 Page 1** — Invoice table with all columns (Preseller, Promo Type/Note, Invoice Date, Due Date, Sched. Date, Grand Total, Delivery, Payment, DM); full filter set; Add Invoice form with Finding 9/5 breakdown; CSV/Excel import via PapaParse; printed-invoice View via @react-pdf/renderer; Edit/Delete; Reschedule; two Export buttons
5. **Tab 1 Page 2** — DM/Truck/Route Registry (above daily table); Daily assignment table with Invoice Total + Products columns; sub-page with Products; Auto-Assign trigger wire-up; Mark Truck Returned; Edit/Delete on registry rows; Route Sheet PDF
6. **Tab 1 Page 3** — Late Delivery Tracker; Disputed needs reason (Resolved does not); Filters & Search subsection; Export buttons
7. **ExportButtons component** — reusable, takes `data[]` + `filename`; renders both CSV and Excel buttons

### End-of-day test
- Invoice created → stock reserved → assigned to truck → missed date → appears in Late Delivery Tracker
- All filters work on all three pages
- Both export buttons produce valid files on all three pages
- View button renders recognisable printed-invoice layout

---

## Day 3 — Tabs 2 & 3 + Shop Details

### What gets built
1. **Tab 2 Page 1** — Cash+Credit shop table with Terms column; unpaid sub-page with Days Past Due + Edit/Delete; Record Payment; Block Shop; Outlet Code in search [Finding 4]
2. **Tab 2 Page 2** — Blocked Accounts; Unblock action
3. **Tab 3 Page 1** — Warehouse Stock (no Empties column); Add Product; Edit/Delete
4. **Tab 3 Page 2** — Flappy/Damaged Stock; Product and Status as dropdowns; no auto-ledger write; no auto Pending row; Edit/Delete
5. **Tab 3 Page 3** — Returns/Wayback; reason required only on Rejected; View button shows reason inline in context dropdown; Approve restores stock
6. **Tab 3 Page 4** — Stock Count/Audit; Schedule → Start Count → Complete Audit (corrects warehouse qty); View Report
7. **Tab 3 Page 5** — Empties Log; Add Empty Entries form with Invoice No lookup (`log_empties_against_invoice`); Edit/Delete
8. **Shop Details page** — UI switch at top [On Cash Shops / On Credit Shops]; each view has own search + import; Outlet Code as leading column; Import matched on outlet_code
9. **Shop Profile — On-Credit** — Date/Month/Year filters (default current month + year); toggle [Credit Invoices / Cash Invoices]; Credit view has Aging Days + Bucket as two separate columns; Payment shows Paid / Partial / Outstanding
10. **Shop Profile — On-Cash** — Date/Month/Year filters; single invoice table

### End-of-day test
- Shop moved Cash → Credit → Cash; history intact throughout
- Damaged stock entry: Product and Status are dropdowns; marking Adjusted does NOT touch any ledger
- Return Approved: stock number goes up on Page 1; Return Rejected: reason field enforced; View button shows reason
- Shop Profile: toggle between Credit/Cash invoices works; Aging Days and Bucket are distinct columns

---

## Day 4 — Tab 4, Tab 6, Tab 5 + pg_cron Jobs

### What gets built
1. **Tab 4 Page 1** — Daily Summary (no Confirm. column); drill-down with Edit/Delete action; Grand Total used (not total_amount)
2. **Tab 4 Page 2** — Cash Deposit Register; pre-filled Add Deposit; Edit scope exactly as specified (Amount change requires reason); Edit/Delete column
3. **Tab 4 Page 3** — Cash Reconciliation Dashboard; **two rows only** (Cash Invoices Delivered + Bank Deposited); Year filter removed; Date filter + Status filter only
4. **Tab 6 Page 1** — Agency Ledger; negative-balance model; Add Revenue button
5. **Tab 6 Page 2** — Purchasing from CCBPL; **In Progress / Stock Arrived** status; In Progress = zero writes anywhere; Stock Arrived = atomic `qty_total += received_qty` + Agency Ledger post; **no Flappy Qty field**
6. **Tab 6 Page 3** — Agency Expenses; Edit/Delete
7. **Tab 6 Page 4** — CCBPL Penalties Register; Dispute action with typed note; Edit/Delete
8. **Tab 5 Page 1** — Backup Status; Backup Now button calls `/api/backup` route handler; Download link; no Module/Size columns; no second page; no cron
9. **pg_cron Job 1** — `check_late_deliveries()`: nightly; creates `late_deliveries` rows copying invoice's real `delivery_status`
10. **pg_cron Job 2** — `check_cash_not_deposited()`: hourly; inserts `alerts` rows for cash_not_deposited type

### End-of-day test
- Full cash day: Tab 4 P1 daily totals → Cash Deposit Register → Reconciliation Dashboard shows shortfall on Bank Deposited row only (Row 2)
- CCBPL purchase In Progress: warehouse stock unchanged, ledger unchanged. Mark Stock Arrived: both update atomically
- Tab 6 Page 2 has no Flappy Qty column anywhere
- Backup Now creates a record; Download produces a link

---

## Day 5 — Tab 7, Settings, Admin Panel, Deploy

### What gets built
1. **Tab 7 Page 1** — Stock Discrepancy Report; only Diff ≠ 0 rows; Resolved/Disputed via Edit (Resolved needs reason)
2. **Tab 7 Page 2** — Real-Time Alerts Feed; Supabase Realtime subscription; two alert types only; Mark Read is the only action; no Resolved/Disputed
3. **System Settings** — Section 2 (Auto-Assign toggle); Section 3 (Cash Not Deposited + Overdue Threshold toggles with Set Hrs / Days inputs, Overdue default = 0)
4. **Admin Panel**
   - `/admin/dashboard` — distribution list; Phone No. required; Edit/Delete per row; Access toggle; Export to Excel
   - `/admin/tenants/[id]` — Tabs & Pages matrix (v8 page counts); two alert settings mirror; no Notifications toggle
   - `/admin/settings` — Section 1 Global Tabs & Pages; Section 2 Global Alert Settings; Emergency Banner; no Global Notifications section
   - `/admin/logs` — session-grouped access log; search by IP, date, PKT time; Delete; Export to Excel
5. **Snyk security scan** — run after all code is written; fix any issues found; rescan
6. **Change Log test script** — verify each item in the Change Log is real: removals are gone, fixes behave as written
7. **Deploy to Vercel**; production Supabase project; full Part B walkthrough on live data

### Verification Plan

#### Automated (run on Day 5)
```bash
# Lint
npm run lint

# Type check
npx tsc --noEmit

# Snyk security scan (per global rule)
# Run via MCP tool after all code is complete
```

#### Manual Change Log Test Script (Day 5)
Run each item in the Change Log as a literal test:

| Test | Pass condition |
|---|---|
| Tab 3 Page 1: no Empties column | Column absent from warehouse table |
| Tab 3 Page 5: Empties Log exists | Page renders; Add form validates Invoice No |
| Tab 3 Page 3: View button | Clicking View shows reason inline (Rejected rows); "No reason" for Approved |
| Tab 4 Page 1 drill-down: Edit/Delete | Both buttons present per row |
| Tab 4 Page 2: Edit/Delete | Both buttons present per row |
| Tab 4 Page 3: no Cash Submitted row | Table has exactly 2 rows |
| Tab 6 Page 2: In Progress → Stock Arrived | Stock unchanged at In Progress; updates at Stock Arrived |
| Tab 6 Page 2: no Flappy Qty | Column absent from purchasing table |
| Tab 1 Page 1: Preseller column | Column visible in invoice table |
| Tab 1 Page 2: Edit/Delete on registry | Both buttons in registry table |
| Tab 2 Page 1: Terms column | Column visible |
| Tab 2 Page 1 sub-page: Days Past Due | Column visible; Edit/Delete present |
| Shop Details: UI switch | Toggle renders; only one table visible at a time |
| On-Credit Profile: Aging Days + Bucket | Two separate columns (not one combined) |
| Payment: Partial status | Rows with partial payment show "Partial" badge |
| Admin dashboard: Edit/Delete | Both buttons per row |
| Admin dashboard: Phone No. required | Form rejects empty Phone No. |
| No WhatsApp / Confirm. column anywhere | Grep confirms no "confirmation", "dispute_status", "sms_logs" in codebase |
| Alerts: only 2 types | alert_type CHECK constraint allows only 'cash_not_deposited' and 'overdue_threshold' |
| Alerts: Mark Read only | No Resolved/Disputed buttons on Tab 7 Page 2 |

#### Final Walkthrough
After deploy: follow Part B of the System Narrative (invoice created → stock reserved → assigned → delivered → stock removed → money recorded → appears in summaries) on production data, end to end.

---

## Notes for Execution

- **SheetJS (`xlsx`)** needs to be added: `npm install xlsx`
- **Twilio** needs to be removed: `npm uninstall twilio`; Twilio env vars cleared from `.env.local`
- Each day's Server Actions live in `lib/actions/` — one file per domain — so pages stay thin
- All tables use the same `tenant_id = current_tenant_id()` RLS policy; never skip it
- `current_tenant_id()` must be set via Clerk JWT `app_metadata.tenant_id` claim before any Supabase call
- Supabase pg_cron jobs are written as SQL and registered in the Supabase dashboard (Database → Extensions → pg_cron, then SQL Editor)
