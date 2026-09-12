"use server";

import { createClient, createAdminClient, getTenantId } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function ensureOverdueAlerts() {
  const tenantId = await getTenantId();
  if (!tenantId) return;

  const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : await createClient();

  // 1. Fetch credit_invoices_limit from tenant_settings (default = 1)
  const { data: tenantSettings } = await supabase
    .from("tenant_settings")
    .select("credit_invoices_limit")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const creditInvoicesLimit = Math.max(1, Number(tenantSettings?.credit_invoices_limit ?? 1));

  // 2. Fetch all credit shops
  const { data: creditShops } = await supabase
    .from("shops")
    .select("id, shop_name, outlet_code, shop_type")
    .eq("tenant_id", tenantId)
    .or("shop_type.eq.credit,outlet_type.ilike.credit");

  if (!creditShops || creditShops.length === 0) return;

  const shopMap = new Map<string, any>(creditShops.map((s) => [s.id, s]));
  const shopByOutletCode = new Map<string, any>(creditShops.map((s) => [s.outlet_code, s]));

  // 3. Fetch unpaid credit invoices for tenant
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(
      "id, tenant_id, invoice_no, shop_id, outlet_code, outlet_type, invoice_type, amount, invoice_total, grand_total, amount_received, record_date, delivery_date, invoice_date, scheduled_date"
    )
    .eq("tenant_id", tenantId)
    .or("invoice_type.eq.credit,outlet_type.ilike.credit");

  if (error || !invoices) return;

  // Group unpaid credit invoices by shop
  const shopInvoicesMap = new Map<string, any[]>();
  for (const inv of invoices) {
    const total = Number(inv.amount ?? inv.grand_total ?? inv.invoice_total ?? 0);
    const rec = Number(inv.amount_received ?? 0);
    const bal = total - rec;
    if (bal <= 0.01) continue; // fully paid

    const shop =
      (inv.shop_id && shopMap.get(inv.shop_id)) ||
      (inv.outlet_code && shopByOutletCode.get(inv.outlet_code));
    if (!shop) continue;

    if (!shopInvoicesMap.has(shop.id)) {
      shopInvoicesMap.set(shop.id, []);
    }
    shopInvoicesMap.get(shop.id)!.push({
      ...inv,
      balance: bal,
      date: inv.record_date || inv.delivery_date || inv.scheduled_date || inv.invoice_date || "",
    });
  }

  // Check each credit shop against creditInvoicesLimit
  for (const [shopId, unpaidInvoices] of shopInvoicesMap.entries()) {
    if (unpaidInvoices.length > creditInvoicesLimit) {
      const shop = shopMap.get(shopId)!;
      // Sort chronologically (oldest invoice first)
      unpaidInvoices.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      // The previous unpaid invoices causing the overdue status
      const overdueInvoices = unpaidInvoices.slice(0, unpaidInvoices.length - 1);
      const overdueInvoiceNos = overdueInvoices.map((i) => i.invoice_no).filter(Boolean);
      const overdueBalance = overdueInvoices.reduce((acc, curr) => acc + curr.balance, 0);

      const invListStr = overdueInvoiceNos.join(", ");
      const details = `Outlet ${shop.shop_name} (${shop.outlet_code}) is overdue — exceeded credit invoices limit (${creditInvoicesLimit}). Unpaid previous invoice(s): ${invListStr} with overdue balance Rs.${overdueBalance.toLocaleString()}.`;

      // Check if an alert already exists for this shop containing these invoice numbers
      const { data: existing } = await supabase
        .from("alerts")
        .select("id, details, status")
        .eq("tenant_id", tenantId)
        .eq("alert_type", "overdue_threshold")
        .like("details", `%${shop.shop_name}%`)
        .eq("status", "unread")
        .limit(1);

      if (existing && existing.length > 0) {
        if (existing[0].details.includes(invListStr)) {
          continue;
        }
        await supabase
          .from("alerts")
          .update({ details, severity: "HIGH" })
          .eq("id", existing[0].id);
      } else {
        await supabase.from("alerts").insert({
          tenant_id: tenantId,
          alert_type: "overdue_threshold",
          details,
          severity: "HIGH",
          status: "unread",
        });
      }
    }
  }
}

export async function getAlerts() {
  try {
    await ensureOverdueAlerts();

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("alerts")
      .select("*")
      .neq("alert_type", "cash_not_deposited")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getAlerts] error:", error.message);
      return [];
    }
    return data || [];
  } catch (err: any) {
    console.error("[getAlerts] unexpected error:", err?.message ?? err);
    return [];
  }
}

export async function markAlertRead(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alerts")
    .update({ status: "read" })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/tab7/alerts");
  return data;
}

