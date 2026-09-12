"use server";

import { createClient, getTenantId } from "@/lib/supabase/server";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";

export async function getCurrentDistroName(): Promise<string | null> {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return null;
    const supabase = await createClient();
    const { data: tenant } = await supabase
      .from("tenants")
      .select("distro_name")
      .eq("id", tenantId)
      .single();
    return tenant?.distro_name || null;
  } catch (err) {
    return null;
  }
}

export async function getSettings() {
  noStore();
  try {
    const supabase = await createClient();
    const { data: settings, error: settingsErr } = await supabase
      .from("tenant_settings")
      .select("*")
      .single();
    const { data: alerts, error: alertsErr } = await supabase
      .from("tenant_alert_settings")
      .select("*")
      .single();
    
    // Get global alert settings to determine which options should be shown
    const { data: globalAlerts } = await supabase
      .from("global_alert_settings")
      .select("*");

    if (settingsErr && settingsErr.code !== "PGRST116") {
      console.error("[getSettings] settingsErr:", settingsErr.message);
    }
    if (alertsErr && alertsErr.code !== "PGRST116") {
      console.error("[getSettings] alertsErr:", alertsErr.message);
    }

    return {
      settings: settings
        ? { ...settings, credit_invoices_limit: settings.credit_invoices_limit ?? 1 }
        : { auto_assign_enabled: false, credit_invoices_limit: 1 },
      alerts: alerts || {
        cash_not_deposited_enabled: false,
        cash_not_deposited_hours: 24,
        overdue_threshold_enabled: false,
        overdue_threshold_days: 0,
      },
      globalAlerts: globalAlerts || [],
    };
  } catch (err: any) {
    console.error("[getSettings] unexpected error:", err?.message ?? err);
    return {
      settings: { auto_assign_enabled: false, credit_invoices_limit: 1 },
      alerts: {
        cash_not_deposited_enabled: false,
        cash_not_deposited_hours: 24,
        overdue_threshold_enabled: false,
        overdue_threshold_days: 0,
      },
      globalAlerts: [],
    };
  }
}

export async function updateCreditInvoicesLimit(limit: number) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized: Tenant session not found.");

  const cleanLimit = Math.max(1, Math.floor(Number(limit) || 1));

  const { error } = await supabase
    .from("tenant_settings")
    .upsert(
      { tenant_id: tenantId, credit_invoices_limit: cleanLimit },
      { onConflict: "tenant_id" }
    )
    .select();

  if (error) {
    console.error("[updateCreditInvoicesLimit] error:", error.message);
    throw new Error(
      `Failed to update credit invoices limit: ${error.message}. Please run supabase/mdos_v54_credit_limit_settings_and_deposits.sql in your Supabase SQL Editor.`
    );
  }

  revalidatePath("/settings");
  revalidatePath("/tab2/credit");
  return { success: true, credit_invoices_limit: cleanLimit };
}

export async function updateAutoAssign(enabled: boolean) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized: Tenant session not found.");

  const { error } = await supabase
    .from("tenant_settings")
    .upsert(
      { tenant_id: tenantId, auto_assign_enabled: enabled },
      { onConflict: "tenant_id" }
    )
    .select();
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function updateAlertSettings(formData: {
  cash_not_deposited_enabled: boolean;
  cash_not_deposited_hours: number;
  overdue_threshold_enabled: boolean;
  overdue_threshold_days: number;
}) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized: Tenant session not found.");

  const { error } = await supabase
    .from("tenant_alert_settings")
    .upsert(
      {
        tenant_id: tenantId,
        cash_not_deposited_enabled: formData.cash_not_deposited_enabled,
        cash_not_deposited_hours: formData.cash_not_deposited_hours,
        overdue_threshold_enabled: formData.overdue_threshold_enabled,
        overdue_threshold_days: formData.overdue_threshold_days,
      },
      { onConflict: "tenant_id" }
    )
    .select();
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  revalidatePath("/admin/tenants"); // Revalidate admin tenant config page to show updated alert settings
}




const ALL_REVALIDATE_PATHS = [
  "/tab1/invoices",
  "/tab1/transactions",
  "/tab1/routes",
  "/tab1/late-delivery",
  "/tab2/credit",
  "/tab2/blocked",
  "/tab3/warehouse",
  "/tab3/damaged",
  "/tab3/empties",
  "/tab3/returns",
  "/tab3/audit",
  "/tab4/daily-summary",
  "/tab4/deposits",
  "/tab4/reconciliation",
  "/tab5/backup",
  "/tab6/purchasing",
  "/tab6/expenses",
  "/tab6/penalties",
  "/tab6/ledger",
  "/tab7/alerts",
  "/tab7/discrepancy",
  "/shop-details",
  "/prerequisites/products",
  "/prerequisites/dm-routes",
  "/employees",
  "/employee-management/directory",
  "/employee-management/payroll",
  "/expenses/agency",
  "/expenses/sheet",
  "/income/margin",
  "/income/statement",
  "/inventory/sell-in",
  "/inventory/stock-reports",
  "/inventory/warehouse",
  "/inventory/audit",
  "/cash-bank/deposits",
  "/cash-bank/bank-accounts",
  "/settings",
  "/dashboard",
];

export async function wipeTenantData() {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized: Tenant session not found.");

  // 1. Try invoking PostgreSQL RPC function if installed
  const { data, error } = await supabase.rpc("wipe_tenant_data", {
    p_tenant_id: tenantId,
  });

  // 2. If RPC is not installed in database schema cache, execute direct sequenced deletions
  if (error) {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const db = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : supabase;

    // 1. Leaf / Dependent junction tables
    const { data: sellInOrders } = await db.from("sell_in_orders").select("id").eq("tenant_id", tenantId);
    const sellInOrderIds = (sellInOrders || []).map((o: any) => o.id);

    if (sellInOrderIds.length > 0) {
      const { data: sellInLines } = await db.from("sell_in_lines").select("id").in("order_id", sellInOrderIds);
      const sellInLineIds = (sellInLines || []).map((l: any) => l.id);

      if (sellInLineIds.length > 0) {
        await db.from("sell_in_return_entries").delete().in("sell_in_line_id", sellInLineIds);
        await db.from("sell_in_arrived_lines").delete().in("sell_in_line_id", sellInLineIds);
      }
      await db.from("sell_in_lines").delete().in("order_id", sellInOrderIds);
    }

    const { data: invoices } = await db.from("invoices").select("id").eq("tenant_id", tenantId);
    const invoiceIds = (invoices || []).map((i: any) => i.id);

    if (invoiceIds.length > 0) {
      await db.from("invoice_line_items").delete().in("invoice_id", invoiceIds);
      await db.from("invoice_returns").delete().in("invoice_id", invoiceIds);
    }

    const { data: audits } = await db.from("stock_audits").select("id").eq("tenant_id", tenantId);
    const auditIds = (audits || []).map((a: any) => a.id);
    if (auditIds.length > 0) {
      await db.from("stock_discrepancies").delete().in("audit_id", auditIds);
    }

    await db.from("shop_payments").delete().eq("tenant_id", tenantId);
    await db.from("late_deliveries").delete().eq("tenant_id", tenantId);

    // 2. Transactional Tables & Inventory
    await db.from("stock_movements").delete().eq("tenant_id", tenantId);
    await db.from("invoices").delete().eq("tenant_id", tenantId);
    await db.from("returns_wayback").delete().eq("tenant_id", tenantId);
    await db.from("sell_in_orders").delete().eq("tenant_id", tenantId);
    await db.from("route_assignments").delete().eq("tenant_id", tenantId);
    await db.from("stock_audits").delete().eq("tenant_id", tenantId);
    await db.from("damaged_stock").delete().eq("tenant_id", tenantId);
    await db.from("empties_log").delete().eq("tenant_id", tenantId);
    await db.from("warehouse_stock").delete().eq("tenant_id", tenantId);
    await db.from("cash_deposits").delete().eq("tenant_id", tenantId);
    await db.from("alerts").delete().eq("tenant_id", tenantId);

    // 3. Expenses & CCBPL
    await db.from("expense_bills").delete().eq("tenant_id", tenantId);
    await db.from("expense_entertainment").delete().eq("tenant_id", tenantId);
    await db.from("expense_petty").delete().eq("tenant_id", tenantId);
    await db.from("expense_penalties").delete().eq("tenant_id", tenantId);
    await db.from("fuel_entries").delete().eq("tenant_id", tenantId);
    await db.from("agency_expenses").delete().eq("tenant_id", tenantId);
    await db.from("ccbpl_penalties").delete().eq("tenant_id", tenantId);
    await db.from("ccbpl_purchases").delete().eq("tenant_id", tenantId);
    await db.from("scheme_income").delete().eq("tenant_id", tenantId);

    // 4. Payroll & HR
    await db.from("payroll_runs").delete().eq("tenant_id", tenantId);
    await db.from("payroll_sops").delete().eq("tenant_id", tenantId);
    await db.from("employee_ledger").delete().eq("tenant_id", tenantId);
    await db.from("employee_loans").delete().eq("tenant_id", tenantId);
    await db.from("employee_increments").delete().eq("tenant_id", tenantId);

    // 5. Prerequisites / Master Data
    await db.from("dm_routes").delete().eq("tenant_id", tenantId);
    await db.from("loaders").delete().eq("tenant_id", tenantId);
    await db.from("shops").delete().eq("tenant_id", tenantId);

    // Delete tenant products or unassigned products
    const { data: tenantProducts } = await db.from("products").select("id").or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
    const prodIds = (tenantProducts || []).map((p: any) => p.id);
    if (prodIds.length > 0) {
      await db.from("stock_movements").delete().in("product_id", prodIds);
      await db.from("sell_in_return_entries").delete().in("product_id", prodIds);
      await db.from("sell_in_arrived_lines").delete().in("product_id", prodIds);
      await db.from("sell_in_lines").delete().in("product_id", prodIds);
      await db.from("invoice_line_items").delete().in("product_id", prodIds);
      await db.from("invoice_returns").delete().in("product_id", prodIds);
      await db.from("stock_discrepancies").delete().in("product_id", prodIds);
      await db.from("damaged_stock").delete().in("product_id", prodIds);
      await db.from("empties_log").delete().in("product_id", prodIds);
      await db.from("warehouse_stock").delete().in("product_id", prodIds);
      await db.from("returns_wayback").delete().in("product_id", prodIds);
      await db.from("products").delete().in("id", prodIds);
    } else {
      await db.from("products").delete().eq("tenant_id", tenantId);
    }

    await db.from("product_categories").delete().eq("tenant_id", tenantId);
    await db.from("employees").delete().eq("tenant_id", tenantId);
    await db.from("vendor_accounts").delete().eq("tenant_id", tenantId);
    await db.from("bank_accounts").delete().eq("tenant_id", tenantId);
  }

  ALL_REVALIDATE_PATHS.forEach((path) => {
    revalidatePath(path);
  });

  return { success: true, tenant_id: tenantId };
}