# MDOS v8 Database Architecture Map

## Overview
MDOS v8 is a multi-tenant distribution management system built on Supabase (PostgreSQL). Every table carries `tenant_id` and is filtered through Row Level Security (RLS) policies.

---

## Core Tables & Relationships

### 1. Tenancy & Admin Layer

#### tenants
- **Purpose**: Root table for multi-tenancy - each distribution is a tenant
- **Key Columns**: id, distro_name, email, phone_number (NOT NULL), access_enabled
- **Relationships**: 
  - Referenced by: employees, shops, invoices, empties_log, warehouse_stock, dm_routes, route_assignments, late_deliveries, damaged_stock, returns_wayback, stock_audits, stock_discrepancies, cash_deposits, agency_ledger, ccbpl_ledger, ccbpl_purchases, agency_expenses, ccbpl_penalties, alerts, tenant_alert_settings, tenant_settings, backups, tenant_feature_flags
- **RLS Policies**: 
  - `tenants_select`: authenticated users can read their own tenant OR platform admins
  - `tenants_admin_write`: platform admins only for writes
- **Triggers**: `trg_tenants_updated_at` (auto-updates updated_at)

#### admins
- **Purpose**: Platform administrator accounts
- **Key Columns**: id, full_name, email (unique)
- **RLS Policies**: `admins_platform_only` - platform admins only
- **No tenant_id** - platform-level table

#### admin_logs
- **Purpose**: Audit log for platform admin activity
- **Key Columns**: pk_timestamp, ip_address, is_mdos_user, tenant_id (nullable), visited_pages[], pages_visited (generated)
- **RLS Policies**: `admin_logs_platform_only` - platform admins only
- **Relationships**: tenant_id references tenants(id)

#### admin_broadcast_banners
- **Purpose**: Platform-wide announcements
- **Key Columns**: message, active, created_by
- **RLS Policies**: 
  - Read: active banners visible to all, platform admins see all
  - Write: platform admins only
- **Relationships**: created_by references admins(id)

---

### 2. Employee & Shop Management

#### employees
- **Purpose**: Delivery Men (DM) and Presellers
- **Key Columns**: tenant_id, full_name, role ('dm' or 'preseller'), phone
- **Relationships**: 
  - tenant_id → tenants(id)
  - Referenced by: invoices (preseller_id, dm_id), dm_routes (dm_id), route_assignments (dm_id)
- **RLS Policies**: `employees_owner_all` - tenant isolation
- **Index**: idx_employees_tenant

#### shops
- **Purpose**: Retail outlets (cash and credit shops)
- **Key Columns**: 
  - tenant_id, outlet_code (permanent identity, unique per tenant), shop_name, owner_name
  - phone (NOT NULL, editable contact field)
  - shop_type ('cash' or 'credit'), credit_limit, credit_terms_days
  - is_blocked, block_reason, blocked_at
- **Relationships**: 
  - tenant_id → tenants(id)
  - Referenced by: invoices, empties_log, returns_wayback
- **RLS Policies**: `shops_owner_all` - tenant isolation
- **Constraints**: 
  - UNIQUE(tenant_id, outlet_code) - [FINDING 4]
  - CHECK: block_reason required if is_blocked
- **Indexes**: 
  - idx_shops_tenant
  - idx_shops_outlet_code_trgm (GIN trigram for partial search)
  - idx_shops_shop_name_trgm (GIN trigram for partial search)

#### blocked_shops (VIEW)
- **Purpose**: Filtered view of blocked shops with overdue calculation
- **Definition**: shops WHERE is_blocked = true
- **Additional Column**: overdue (sum of unpaid credit invoices past due_date)
- **Security**: security_invoker = true

---

### 3. Invoice Management

#### invoices
- **Purpose**: Core sales transactions
- **Key Columns**: 
  - tenant_id, invoice_no (unique per tenant), shop_id
  - preseller_id, dm_id (nullable until route assignment)
  - products (text: "Coke 1.5L×20, Sprite 500ml×10")
  - promo_type ('in_kind', 'in_rupees', 'none'), promo_note
  - invoice_date, due_date (credit only), scheduled_date
  - invoice_type ('cash' or 'credit')
  - invoice_total, discount_amount, advance_tax
  - grand_total (GENERATED: invoice_total - discount_amount + advance_tax)
  - empties_deposit (separate from grand_total) - [FINDING 5]
  - amount_received
  - payment_status (GENERATED: 'paid'/'partial'/'outstanding') - [FIX 1]
  - visit_status ('visited'/'unvisited')
  - delivery_status ('undispatched'/'pending'/'delivered'/'undelivered')
  - reason
- **Relationships**: 
  - tenant_id → tenants(id)
  - shop_id → shops(id) (RESTRICT)
  - preseller_id → employees(id) (SET NULL)
  - dm_id → employees(id) (SET NULL)
  - Referenced by: empties_log, late_deliveries, returns_wayback
- **RLS Policies**: `invoices_owner_all` - tenant isolation
- **Triggers**: 
  - `trg_invoices_updated_at` - auto-updates updated_at
  - `trg_reserve_stock_on_invoice` - reserves stock on INSERT
  - `trg_move_stock_on_delivery` - moves stock + posts revenue on delivery
- **Indexes**: 
  - idx_invoices_tenant
  - idx_invoices_shop
  - idx_invoices_dm
  - idx_invoices_sched_date

---

### 4. Empties Management [FINDING 5]

#### empties_log
- **Purpose**: Dedicated tracking of returnable bottles/empties
- **Key Columns**: 
  - tenant_id, shop_id, invoice_id (nullable, matched by invoice_no)
  - product_name, quantity, deposit_amount
  - log_date (defaults to current_date)
- **Relationships**: 
  - tenant_id → tenants(id)
  - shop_id → shops(id) (RESTRICT)
  - invoice_id → invoices(id) (SET NULL)
- **RLS Policies**: `empties_log_owner_all` - tenant isolation
- **Index**: idx_empties_log_tenant
- **Function**: `log_empties_against_invoice()` - safe linking with warning on no match

#### empties_on_hand (VIEW)
- **Purpose**: Summary of empties by product
- **Definition**: GROUP BY tenant_id, product_name → SUM(quantity), SUM(deposit_amount)
- **Security**: security_invoker = true

---

### 5. Warehouse Stock

#### warehouse_stock
- **Purpose**: Physical inventory tracking
- **Key Columns**: 
  - tenant_id, product_name
  - qty_total, qty_reserved, qty_flappy
  - qty_available (GENERATED: qty_total - qty_reserved)
- **Relationships**: 
  - tenant_id → tenants(id)
  - Referenced by: triggers (stock movement)
- **RLS Policies**: `warehouse_stock_owner_all` - tenant isolation
- **Constraints**: UNIQUE(tenant_id, product_name)
- **Index**: idx_warehouse_stock_tenant
- **Note**: qty_empties column REMOVED in v8 - now in empties_log only

---

### 6. Route & Delivery Management

#### dm_routes
- **Purpose**: One-time DM/Truck/Route registry
- **Key Columns**: tenant_id, dm_id, truck_no, route_name
- **Relationships**: 
  - tenant_id → tenants(id)
  - dm_id → employees(id) (CASCADE)
- **RLS Policies**: `dm_routes_owner_all` - tenant isolation
- **Constraints**: UNIQUE(tenant_id, truck_no)

#### route_assignments
- **Purpose**: Daily route assignments (Tab 1 Page 2)
- **Key Columns**: 
  - tenant_id, truck_no, dm_id (nullable), route_name
  - assignment_date, status ('not_started'/'in_progress'/'returned') - [FIX 3]
- **Relationships**: 
  - tenant_id → tenants(id)
  - dm_id → employees(id) (SET NULL)
- **RLS Policies**: `route_assignments_owner_all` - tenant isolation
- **Constraints**: UNIQUE(tenant_id, truck_no, assignment_date)
- **Index**: idx_route_assignments_tenant

#### late_deliveries
- **Purpose**: Auto-populated tracking of undelivered invoices
- **Key Columns**: 
  - tenant_id, invoice_id
  - days_late, reason, status ('pending'/'undelivered'/'resolved'/'disputed')
- **Relationships**: 
  - tenant_id → tenants(id)
  - invoice_id → invoices(id) (CASCADE)
- **RLS Policies**: `late_deliveries_owner_all` - tenant isolation
- **Triggers**: `trg_late_deliveries_updated_at`
- **Constraints**: 
  - UNIQUE(tenant_id, invoice_id)
  - CHECK: reason required when status = 'disputed'
- **Scheduled Job**: `check_late_deliveries()` runs daily at 00:05

---

### 7. Inventory Control

#### damaged_stock
- **Purpose**: Tab 3 Page 2 - Flappy/Damaged stock logging
- **Key Columns**: 
  - tenant_id, product_name, quantity, damage_type
  - batch_no, webspace_ref
  - status ('pending'/'complaint_filed'/'adjusted')
  - note, recorded_date
- **RLS Policies**: `damaged_stock_owner_all` - tenant isolation

#### returns_wayback
- **Purpose**: Tab 3 Page 3 - Product returns from shops
- **Key Columns**: 
  - tenant_id, shop_id, product_name
  - original_invoice_id, received_qty
  - status ('pending'/'approved'/'rejected') - [FIX 2]
  - reason, return_date
- **Relationships**: 
  - tenant_id → tenants(id)
  - shop_id → shops(id) (RESTRICT)
  - original_invoice_id → invoices(id) (SET NULL)
- **RLS Policies**: `returns_wayback_owner_all` - tenant isolation
- **Triggers**: `trg_approve_return_restores_stock` - restores stock on approval
- **Constraints**: CHECK: reason required when status = 'rejected'

#### stock_audits
- **Purpose**: Tab 3 Page 4 - Scheduled stock counts
- **Key Columns**: 
  - tenant_id, scheduled_date, audit_date
  - status ('scheduled'/'in_progress'/'completed')
  - products_counted
- **RLS Policies**: `stock_audits_owner_all` - tenant isolation

#### stock_discrepancies
- **Purpose**: Tab 7 Page 1 - Audit discrepancies
- **Key Columns**: 
  - tenant_id, audit_id, product_name
  - system_qty, physical_qty
  - diff (GENERATED: physical_qty - system_qty)
  - status ('pending'/'resolved'/'disputed')
  - reason, audit_date
- **Relationships**: 
  - tenant_id → tenants(id)
  - audit_id → stock_audits(id) (SET NULL)
- **RLS Policies**: `stock_discrepancies_owner_all` - tenant isolation
- **Constraints**: CHECK: reason required when status = 'resolved'

---

### 8. Cash Management

#### cash_deposits
- **Purpose**: Tab 4 Page 2 - Bank deposit register
- **Key Columns**: 
  - tenant_id, deposit_date, amount, amount_change_reason
  - bank_name, bank_ref_no, for_date
  - status ('pending'/'deposited')
- **RLS Policies**: `cash_deposits_owner_all` - tenant isolation
- **Triggers**: `trg_cash_deposits_updated_at`
- **Scheduled Job**: `job_cash_not_deposited_check()` runs hourly, creates alerts

---

### 9. CCBPL Accounts

#### agency_ledger
- **Purpose**: Tab 6 Page 1 - Running balance of agency account
- **Key Columns**: 
  - tenant_id, entry_date, description, amount (+/-)
  - entry_type ('opening_balance'/'revenue'/'purchase_cost'/'expense'/'penalty')
  - ref_table, ref_id
- **Relationships**: 
  - tenant_id → tenants(id)
  - Referenced by: triggers (invoice delivery, purchases)
- **RLS Policies**: `agency_ledger_owner_all` - tenant isolation
- **Index**: idx_agency_ledger_tenant

#### agency_ledger_with_balance (VIEW)
- **Purpose**: Agency ledger with running balance calculation
- **Definition**: agency_ledger + window function SUM() OVER() for balance
- **Security**: security_invoker = true

#### ccbpl_ledger
- **Purpose**: CCBPL-specific ledger (kept for purchases/penalties, no dedicated page)
- **Key Columns**: 
  - tenant_id, entry_date, description, ref_no
  - you_owe, ccbpl_owes
  - entry_type ('purchase'/'deduction'/'incentive'/'penalty'/'payment')
  - ref_table, ref_id
- **RLS Policies**: `ccbpl_ledger_owner_all` - tenant isolation

#### ccbpl_purchases
- **Purpose**: Tab 6 Page 2 - Purchasing from CCBPL
- **Key Columns**: 
  - tenant_id, po_no, product_name
  - ordered_qty, received_qty, billed_amount
  - status ('in_progress'/'stock_arrived') - [v8 workflow rewrite]
- **RLS Policies**: `ccbpl_purchases_owner_all` - tenant isolation
- **Triggers**: `trg_ccbpl_purchase_stock_arrived` - updates stock + ledger on status change
- **Constraints**: UNIQUE(tenant_id, po_no)
- **Behavior**: 
  - 'in_progress': no stock/ledger impact
  - 'stock_arrived': increments warehouse_stock.qty_total, posts to agency_ledger

#### agency_expenses
- **Purpose**: Tab 6 Page 3 - Agency operating expenses
- **Key Columns**: 
  - tenant_id, expense_date, category, description
  - amount, paid_by
- **RLS Policies**: `agency_expenses_owner_all` - tenant isolation

#### ccbpl_penalties
- **Purpose**: Tab 6 Page 4 - CCBPL penalties register
- **Key Columns**: 
  - tenant_id, penalty_date, ccbpl_ref, amount, reason
  - status ('pending'/'disputed'/'settled'/'paid'/'resolved') - [FIX 2]
  - dispute_note
- **RLS Policies**: `ccbpl_penalties_owner_all` - tenant isolation

---

### 10. Alerts System

#### alerts
- **Purpose**: Tab 7 - System alerts (cash_not_deposited, overdue_threshold)
- **Key Columns**: 
  - tenant_id, alert_type, details, severity ('HIGH'/'MEDIUM'/'LOW')
  - status ('unread'/'read')
  - ref_table, ref_id
- **RLS Policies**: 
  - `alerts_select`: tenant can read their alerts
  - `alerts_mark_read`: tenant can mark as read (no insert/delete)
- **Index**: idx_alerts_tenant
- **Note**: Inserts are system-generated by scheduled jobs

#### tenant_alert_settings
- **Purpose**: Per-tenant alert configuration
- **Key Columns**: 
  - tenant_id (unique)
  - cash_not_deposited_enabled, cash_not_deposited_hours
  - overdue_threshold_enabled, overdue_threshold_days
- **Relationships**: tenant_id → tenants(id)
- **RLS Policies**: `tenant_alert_settings_owner_rw` - tenant or platform admin
- **Triggers**: `trg_tenant_alert_settings_updated_at`

#### global_alert_settings
- **Purpose**: Platform-wide alert on/off switches - [FIX 8]
- **Key Columns**: alert_type ('cash_not_deposited'/'overdue_threshold'), enabled
- **RLS Policies**: 
  - Read: all authenticated users
  - Write: platform admins only

---

### 11. Settings & Feature Flags

#### tenant_settings
- **Purpose**: Per-tenant system settings
- **Key Columns**: 
  - tenant_id (primary key)
  - auto_assign_enabled
- **Relationships**: tenant_id → tenants(id)
- **RLS Policies**: `tenant_settings_owner_rw` - tenant or platform admin
- **Triggers**: `trg_tenant_settings_updated_at`

#### global_feature_flags
- **Purpose**: Platform-wide feature toggles
- **Key Columns**: flag_key (primary key), label, enabled
- **RLS Policies**: 
  - Read: all authenticated users
  - Write: platform admins only
- **Seeded Flags**: tab1, tab2, tab3, tab4, tab5, tab6, tab7, shop_details

#### tenant_feature_flags
- **Purpose**: Per-tenant feature overrides
- **Key Columns**: 
  - tenant_id, flag_key (references global_feature_flags)
  - enabled
- **Relationships**: 
  - tenant_id → tenants(id)
  - flag_key → global_feature_flags(flag_key)
- **RLS Policies**: 
  - Select: tenant or platform admin
  - Write: platform admins only

---

### 12. Backup System

#### backups
- **Purpose**: Tab 5 Page 1 - Manual backup tracking
- **Key Columns**: 
  - tenant_id, backup_date, status ('in_progress'/'completed'/'failed')
  - file_path
- **RLS Policies**: `backups_owner_all` - tenant isolation
- **Note**: Manual-only, no scheduled cron jobs

---

## Triggers & Functions

### Helper Functions
- `current_tenant_id()`: Extracts tenant_id from Clerk JWT
- `is_platform_admin()`: Checks if user is platform admin
- `set_updated_at()`: Generic trigger function for updated_at timestamps

### Stock Flow Triggers
1. **trg_reserve_stock_on_invoice** (on invoices INSERT)
   - Function: `reserve_stock_on_invoice()`
   - Parses products text, increments warehouse_stock.qty_reserved

2. **trg_move_stock_on_delivery** (on invoices UPDATE)
   - Function: `move_stock_on_delivery()`
   - When delivery_status → 'delivered':
     - Decrements warehouse_stock.qty_total and qty_reserved
     - Posts revenue to agency_ledger

3. **trg_approve_return_restores_stock** (on returns_wayback UPDATE)
   - Function: `approve_return_restores_stock()`
   - When status → 'approved': increments warehouse_stock.qty_total

4. **trg_ccbpl_purchase_stock_arrived** (on ccbpl_purchases INSERT/UPDATE)
   - Function: `ccbpl_purchase_stock_arrived()`
   - When status → 'stock_arrived':
     - Increments warehouse_stock.qty_total
     - Posts purchase cost to agency_ledger

### Timestamp Triggers
- `trg_tenants_updated_at`
- `trg_invoices_updated_at`
- `trg_late_deliveries_updated_at`
- `trg_cash_deposits_updated_at`
- `trg_tenant_alert_settings_updated_at`
- `trg_tenant_settings_updated_at`

### Tenant Provisioning
- `trg_create_tenant_defaults` (on tenants INSERT)
  - Function: `create_tenant_defaults()`
  - Auto-creates tenant_settings and tenant_alert_settings rows

### Scheduled Jobs (pg_cron)
1. **mdos-late-delivery-check** (daily at 00:05)
   - Function: `check_late_deliveries()` or `job_late_delivery_check()`
   - Populates late_deliveries table

2. **mdos-cash-not-deposited-check** (hourly)
   - Function: `job_cash_not_deposited_check()`
   - Creates alerts for undeposited cash
   - Respects global_alert_settings + tenant_alert_settings

### Specialized Functions
- `log_empties_against_invoice()`: Safe empties logging with invoice matching
- `credit_shop_aging` (VIEW): Per-invoice aging for Tab 2 and Shop Profile

---

## RLS Policy Summary

### Pattern 1: Tenant Isolation (Most Tables)
- **Policy Name**: `{table}_owner_all`
- **Using**: `tenant_id = current_tenant_id()`
- **With Check**: `tenant_id = current_tenant_id()`
- **Applied to**: employees, shops, invoices, empties_log, warehouse_stock, dm_routes, route_assignments, late_deliveries, damaged_stock, returns_wayback, stock_audits, stock_discrepancies, cash_deposits, agency_ledger, ccbpl_ledger, ccbpl_purchases, agency_expenses, ccbpl_penalties, backups

### Pattern 2: Platform Admin Only
- **Applied to**: admins, admin_logs
- **Using/With Check**: `is_platform_admin() = true`

### Pattern 3: Tenant + Platform Admin
- **Applied to**: tenant_alert_settings, tenant_settings, tenant_feature_flags
- **Using**: `tenant_id = current_tenant_id() OR is_platform_admin()`
- **With Check**: `tenant_id = current_tenant_id()` (tenant only for writes)

### Pattern 4: Read-Only for Tenants
- **Applied to**: alerts
- **Select**: `tenant_id = current_tenant_id()`
- **Update (mark read only)**: `tenant_id = current_tenant_id()`
- **No Insert/Delete**: System-generated only

### Pattern 5: Global Flags (Read All, Write Admin)
- **Applied to**: global_feature_flags, global_alert_settings
- **Select**: `true` (all authenticated)
- **Write**: `is_platform_admin() = true`

### Pattern 6: Tenant Self-Read + Platform Admin
- **Applied to**: tenants
- **Select**: `id = current_tenant_id() OR is_platform_admin()`
- **Write**: `is_platform_admin() = true`

---

## Dependency Graph

```
tenants (ROOT)
├── employees
│   └── invoices (preseller_id, dm_id)
│   └── dm_routes (dm_id)
│   └── route_assignments (dm_id)
├── shops
│   └── invoices (shop_id)
│   └── empties_log (shop_id)
│   └── returns_wayback (shop_id)
├── invoices
│   └── empties_log (invoice_id)
│   └── late_deliveries (invoice_id)
│   └── returns_wayback (original_invoice_id)
├── warehouse_stock (updated by triggers)
├── dm_routes
├── route_assignments
├── late_deliveries
├── damaged_stock
├── returns_wayback
├── stock_audits
│   └── stock_discrepancies (audit_id)
├── cash_deposits
├── agency_ledger (updated by triggers)
├── ccbpl_ledger
├── ccbpl_purchases
├── agency_expenses
├── ccbpl_penalties
├── alerts
├── tenant_alert_settings
├── tenant_settings
├── backups
└── tenant_feature_flags
    └── global_feature_flags (referenced)

admins (PLATFORM LEVEL)
└── admin_broadcast_banners (created_by)

global_feature_flags (PLATFORM LEVEL)
└── tenant_feature_flags (flag_key)

global_alert_settings (PLATFORM LEVEL)
```

---

## Key Data Flows

### Invoice → Stock Flow
1. Invoice created → `trg_reserve_stock_on_invoice` → warehouse_stock.qty_reserved++
2. Invoice delivered → `trg_move_stock_on_delivery` → 
   - warehouse_stock.qty_total--
   - warehouse_stock.qty_reserved--
   - agency_ledger (revenue entry)

### Purchase → Stock Flow
1. CCBPL purchase created (status='in_progress') → no impact
2. Purchase marked 'stock_arrived' → `trg_ccbpl_purchase_stock_arrived` →
   - warehouse_stock.qty_total++
   - agency_ledger (purchase cost entry)

### Returns Flow
1. Return logged (status='pending') → no impact
2. Return approved → `trg_approve_return_restores_stock` → warehouse_stock.qty_total++

### Cash → Alert Flow
1. Cash invoice delivered → amount_received recorded
2. Hourly job checks for undeposited cash → creates alert if threshold exceeded
3. Cash deposit recorded → alert condition cleared

### Late Delivery Flow
1. Invoice scheduled_date passes with delivery_status != 'delivered'
2. Daily job populates late_deliveries table
3. DM reschedules or marks resolved/disputed

---

## Critical Constraints & Business Rules

1. **Outlet Code Identity**: shops.outlet_code is permanent, unique per tenant [FINDING 4]
2. **Generated Column Chain**: invoices.grand_total is generated, payment_status cannot reference it (formula inlined) [FINDING 9]
3. **Empties Separation**: empties_deposit is separate from grand_total, tracked in empties_log [FINDING 5]
4. **Payment Status**: Three states - paid, partial, outstanding [FIX 1]
5. **Purchase Workflow**: Two-state only - in_progress → stock_arrived (no stock/ledger impact until arrived) [v8]
6. **Tenant ID Defaults**: All tenant_id columns default to current_tenant_id() for RLS compliance [FIX 10]
7. **Phone Required**: shops.phone is NOT NULL [FIX 5]
8. **Route Status**: Includes 'not_started' state [FIX 3]
9. **Penalty Status**: Includes 'paid' and 'resolved' [FIX 2]
10. **Return Status**: Includes 'pending' for Receive → Approve/Reject flow [day3]

---

## v8 Changes from v7

1. **Empties Log**: New dedicated table, qty_empties removed from warehouse_stock
2. **Purchase Workflow**: Status simplified to in_progress/stock_arrived
3. **Flappy Qty**: Removed from Tab 6 Page 2, manual logging only
4. **Shop Profile**: Credit/Cash invoice toggle with date filters
5. **Payment Status**: Added 'partial' state
6. **Route Status**: Added 'not_started' state
7. **Global Alert Settings**: New platform-wide toggle layer
8. **Tenant ID Defaults**: Auto-populated from JWT for RLS compliance
9. **Returns Wayback**: Added 'pending' status for approval workflow
10. **Admin Logs**: Enhanced with visited_pages array

---

## Extensions Required

- **pgcrypto**: For UUID generation
- **pg_trgm**: For trigram indexes on outlet_code and shop_name
- **pg_cron**: For scheduled jobs (late delivery check, cash deposit check)

---

## Security Model

All database access is mediated through:
1. **Clerk Authentication**: JWT contains tenant_id and app_role claims
2. **Row Level Security**: Every query filtered by tenant_id = current_tenant_id()
3. **Platform Admin Role**: Separate role with is_platform_admin() check
4. **Security Invoker Views**: Views use security_invoker = true to respect RLS

No direct table access bypasses RLS - all operations go through policy checks.
