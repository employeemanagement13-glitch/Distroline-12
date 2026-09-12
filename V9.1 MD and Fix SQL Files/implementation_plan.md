# Expense → Bank Account Ledger Tracking

Link all 6 expense types to a bank account and write a `bank_account_ledger` row on each save.

## Architecture

The `bank_account_ledger` table is read-only from the app currently (only SELECTed in `getBankAccountLedger`). All writes will be direct Supabase inserts inside the server actions, the same pattern used by the existing deposits/sell-in flows that presumably write to it via DB triggers or direct inserts.

Since no existing code writes to `bank_account_ledger`, I'll add a shared helper `insertBankLedgerEntry` in `bank-accounts.ts` and call it from each expense action after the primary insert succeeds.

**Ledger row schema used:**
| Column | Value |
|---|---|
| `bank_account_id` | chosen account id |
| `txn_date` | actual expense date |
| `txn_type` | `"Expense"` |
| `reference` | see per-type below |
| `amount_in` | `0` |
| `amount_out` | expense amount |
| `tenant_id` | from `getTenantId()` |
| `source_type` | new nullable column — e.g. `"payroll"`, `"fuel"`, `"bill"`, `"entertainment"`, `"petty"`, `"penalty"` |
| `source_id` | new nullable column — FK to the created record's `id` |

> [!IMPORTANT]
> **`source_type` / `source_id` columns** need to be added to `bank_account_ledger` in Supabase. These are nullable so existing rows are unaffected. Without them the ledger entry cannot be cleaned up if the expense is deleted. I'll add delete-cleanup logic only for the new entries.

## Reference Formats Per Type

| Type | Reference string |
|---|---|
| Salary | `{emp_code} \| {full_name} \| Salary` |
| Fuel | `{truck_no} \| {driver_name} \| Fuel` |
| Bill | `{bill_name} \| Bill` |
| Entertainment | `{description} \| Entertainment` |
| Petty | `{description} \| Petty` |
| Penalty | `{description} \| Penalty` |

## Expense Date Per Type

| Type | Date field |
|---|---|
| Salary | `salary_month` first day (`YYYY-MM-01`) |
| Fuel | `entry_date` |
| Bill | `{year}-{month_index}-01` (approx, first of month) |
| Entertainment | same |
| Petty | same |
| Penalty | same |

## Open Questions

> [!IMPORTANT]
> 1. **Do `source_type` and `source_id` columns exist** on `bank_account_ledger`? If not, the plan adds them as nullable TEXT columns — confirm you can run the migration in Supabase dashboard.
> 2. **Delete cascade**: When a payroll run or expense record is deleted, should the ledger entry be deleted too? Plan includes cleanup on delete.
> 3. **Fuel date**: Fuel has a specific `entry_date`. The user spec shows truck+driver as reference. Confirm the fuel bank account is selected per-entry (each row in TruckFuelClient), not per-truck summary.

## Proposed Changes

### `bank-accounts.ts`
#### [MODIFY] [bank-accounts.ts](file:///e:/MDOS/src/lib/actions/bank-accounts.ts)
- Add `insertBankLedgerEntry(payload)` helper.
- Add `deleteBankLedgerEntryBySource(sourceType, sourceId)` helper for delete cleanup.

---

### `payroll.ts`
#### [MODIFY] [payroll.ts](file:///e:/MDOS/src/lib/actions/payroll.ts)
- `createPayrollRun`: accepts optional `bank_account_id`. After insert, calls `insertBankLedgerEntry`.
- `deletePayrollRun`: calls `deleteBankLedgerEntryBySource("payroll", id)` before delete.

---

### `expenses.ts`
#### [MODIFY] [expenses.ts](file:///e:/MDOS/src/lib/actions/expenses.ts)
- `createBill` / `createEntertainment` / `createPetty` / `createPenalty`: each accepts `bank_account_id?` and `expense_date?`. After insert, calls `insertBankLedgerEntry`.
- Corresponding deletes: call `deleteBankLedgerEntryBySource`.

---

### `fuel.ts`
#### [MODIFY] [fuel.ts](file:///e:/MDOS/src/lib/actions/fuel.ts)
- `createFuelEntry`: accepts `bank_account_id?`. After insert, calls `insertBankLedgerEntry`.
- `deleteFuelEntry`: calls `deleteBankLedgerEntryBySource("fuel", id)`.

---

### `PayrollRunsClient.tsx`
#### [MODIFY] [PayrollRunsClient.tsx](file:///e:/MDOS/src/app/%28distributor%29/employee-management/payroll/PayrollRunsClient.tsx)
- Receives `bankAccounts: any[]` prop.
- Form adds **Bank Account** dropdown (required).
- `handleSubmit` passes `bank_account_id` in payload.

### `payroll/page.tsx`
#### [MODIFY] [page.tsx](file:///e:/MDOS/src/app/%28distributor%29/employee-management/payroll/page.tsx)
- Fetch `getBankAccounts()` and pass to `PayrollRunsClient`.

---

### `AgencyExpensesClient.tsx`
#### [MODIFY] [AgencyExpensesClient.tsx](file:///e:/MDOS/src/app/%28distributor%29/expenses/agency/AgencyExpensesClient.tsx)
- Receives `bankAccounts: any[]` prop.
- `BillsHead`, `EntertainmentHead`, `PettyHead`, `PenaltiesHead` each get a **Bank Account** dropdown + a **Date** field in their add modal.
- `FuelHead` — fuel entries are per-truck via `TruckFuelClient`. The bank account dropdown goes in `TruckFuelClient` form instead. `AgencyExpensesClient` passes `bankAccounts` through.

### `expenses/agency/page.tsx`
#### [MODIFY] [page.tsx](file:///e:/MDOS/src/app/%28distributor%29/expenses/agency/page.tsx)
- Fetch `getBankAccounts()` and pass to `AgencyExpensesClient`.

### `TruckFuelClient.tsx`
#### [MODIFY] [TruckFuelClient.tsx](file:///e:/MDOS/src/app/%28distributor%29/expenses/agency/fuel/%5Btruck_no%5D/TruckFuelClient.tsx)
- Receives `bankAccounts: any[]` prop.
- Add fuel entry form adds **Bank Account** dropdown.
- Passes `bank_account_id` to `createFuelEntry`.

### `expenses/agency/fuel/[truck_no]/page.tsx`
#### [MODIFY] [page.tsx](file:///e:/MDOS/src/app/%28distributor%29/expenses/agency/fuel/%5Btruck_no%5D/page.tsx)
- Fetch `getBankAccounts()` and pass to `TruckFuelClient`.

## Verification Plan

### Manual Verification
1. Add payroll run with bank account → check bank account ledger shows `EMP-001 | Name | Salary` row with correct amount_out.
2. Add fuel entry with bank account → check ledger row `LVE-XXX | Driver | Fuel`.
3. Add bill/entertainment/petty/penalty → check ledger rows with correct references and types.
4. Delete an expense → check ledger entry is removed.
5. Existing ledger entries (deposits, sell-in payments) are unaffected.
