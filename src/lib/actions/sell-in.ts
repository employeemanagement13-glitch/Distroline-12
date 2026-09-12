"use server";

import { createClient, getTenantId } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const REVALIDATE = ["/inventory/sell-in", "/cash-bank/bank-accounts", "/reports/financial", "/inventory/warehouse"];

// ------ SELL IN ORDERS ------------------------------------------------------------------------------------------------------------------------

export async function getSellInOrders(status?: string) {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("sell_in_orders")
      .select(`
        *,
        bank_account:bank_accounts(id, bank_name, account_title),
        vendor_account:vendor_accounts(id, vendor_name, account_title),
        sell_in_lines(*, product:products(id, product_name, purchase_rate, category_id, product_categories(id, title)))
      `)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) { console.error("[getSellInOrders]", error.message); return []; }
    return data || [];
  } catch (err: any) {
    console.error("[getSellInOrders] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function createSellInOrder(formData: {
  po_no: string;
  company_inv_no?: string;
  vehicle_no?: string;
  transaction_date: string;
}) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("sell_in_orders")
    .insert({ ...formData, tenant_id: tenantId, status: "in_progress" })
    .select().single();
  if (error) throw new Error(error.message);
  REVALIDATE.forEach(p => revalidatePath(p));
  return data;
}

export async function createSellInOrderWithLines(
  orderData: {
    po_no: string;
    company_inv_no?: string;
    vehicle_no?: string;
    transaction_date: string;
    status?: "in_progress" | "stock_arrived" | "on_credit" | "billed";
    credit_due_date?: string;
    paid_from_bank_account_id?: string;
    billed_date?: string;
    payment_voucher?: string;
    paid_amount?: number;
    vendor_account_id?: string;
  },
  lines: {
    product_id: string;
    qty: number;
    rate: number;
    packing_qty?: number;
    invoice_type?: "purchase" | "return";
  }[]
) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized");

  const intendedStatus = orderData.status || "in_progress";
  const insertPayload: any = {
    po_no: orderData.po_no,
    company_inv_no: orderData.company_inv_no,
    vehicle_no: orderData.vehicle_no,
    transaction_date: orderData.transaction_date,
    tenant_id: tenantId,
    status: "in_progress", // Always insert as in_progress first to allow lines to be added
  };

  if (orderData.credit_due_date) insertPayload.credit_due_date = orderData.credit_due_date;
  if (orderData.paid_from_bank_account_id) insertPayload.paid_from_bank_account_id = orderData.paid_from_bank_account_id;
  if (orderData.billed_date) insertPayload.billed_date = orderData.billed_date;
  if (orderData.payment_voucher) insertPayload.payment_voucher = orderData.payment_voucher;
  if (orderData.paid_amount !== undefined) insertPayload.paid_amount = orderData.paid_amount;
  if (orderData.vendor_account_id) insertPayload.vendor_account_id = orderData.vendor_account_id;

  const { data: order, error: orderErr } = await supabase
    .from("sell_in_orders")
    .insert(insertPayload)
    .select()
    .single();

  if (orderErr) throw new Error(orderErr.message);

  if (lines && lines.length > 0) {
    const lineRows = lines.map((l) => ({
      sell_in_order_id: order.id,
      tenant_id: tenantId,
      product_id: l.product_id,
      qty: l.qty,
      rate: l.rate,
      packing_qty: l.packing_qty || 1,
      invoice_type: l.invoice_type || "purchase",
    }));

    const { error: linesErr } = await supabase.from("sell_in_lines").insert(lineRows);
    if (linesErr) console.error("[createSellInOrderWithLines] lines error:", linesErr.message);
  }

  // Update status to intended status to properly fire triggers with lines present
  if (intendedStatus !== "in_progress") {
    const { error: updateErr } = await supabase
      .from("sell_in_orders")
      .update({ status: intendedStatus })
      .eq("id", order.id);
    if (updateErr) console.error("[createSellInOrderWithLines] status update error:", updateErr.message);
  }

  revalidatePath("/inventory/sell-in");
  return order;
}

export async function updateSellInOrderStatus(id: string, update: {
  status: "in_progress" | "stock_arrived" | "on_credit" | "billed";
  credit_due_date?: string;
  paid_from_bank_account_id?: string;
  billed_date?: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sell_in_orders")
    .update(update)
    .eq("id", id)
    .select().single();
  if (error) throw new Error(error.message);

  REVALIDATE.forEach(p => revalidatePath(p));
  return data;
}

export async function updateSellInOrder(id: string, formData: {
  po_no?: string;
  company_inv_no?: string;
  vehicle_no?: string;
  transaction_date?: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sell_in_orders")
    .update(formData)
    .eq("id", id)
    .select().single();
  if (error) throw new Error(error.message);
  REVALIDATE.forEach(p => revalidatePath(p));
  return data;
}

export async function updateSellInOrderWithLines(
  orderId: string,
  orderData: {
    po_no?: string;
    company_inv_no?: string;
    vehicle_no?: string;
    transaction_date?: string;
    status?: "in_progress" | "stock_arrived" | "on_credit" | "billed";
    credit_due_date?: string;
    paid_from_bank_account_id?: string;
    billed_date?: string;
    payment_voucher?: string;
    paid_amount?: number;
    vendor_account_id?: string;
  },
  lines?: {
    product_id: string;
    qty: number;
    rate: number;
    packing_qty?: number;
    invoice_type?: "purchase" | "return";
  }[]
) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized");

  const { data: order, error: orderErr } = await supabase
    .from("sell_in_orders")
    .update(orderData)
    .eq("id", orderId)
    .select()
    .single();

  if (orderErr) throw new Error(orderErr.message);

  if (lines) {
    await supabase.from("sell_in_lines").delete().eq("sell_in_order_id", orderId);

    if (lines.length > 0) {
      const lineRows = lines.map((l) => ({
        sell_in_order_id: orderId,
        tenant_id: tenantId,
        product_id: l.product_id,
        qty: l.qty,
        rate: l.rate,
        packing_qty: l.packing_qty || 1,
        invoice_type: l.invoice_type || "purchase",
      }));

      const { error: linesErr } = await supabase.from("sell_in_lines").insert(lineRows);
      if (linesErr) console.error("[updateSellInOrderWithLines] lines insert error:", linesErr.message);
    }
  }

  REVALIDATE.forEach((p) => revalidatePath(p));
  return order;
}

export async function deleteSellInOrder(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sell_in_orders").delete().eq("id", id);
  if (error) throw new Error(error.message);
  REVALIDATE.forEach(p => revalidatePath(p));
}

// ------ SELL IN LINES ------------------------------------------------------------------------------------------------------------------------

export async function getSellInLines(orderId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("sell_in_lines")
      .select(`
        *,
        product:products(id, product_name, purchase_rate, category_id, product_categories(id, title, is_returnable, is_rgb)),
        sell_in_arrived_lines(arrived_qty, returned_qty, returned_amt),
        sell_in_return_entries(id, returned_qty, returned_amt, return_date, created_at)
      `)
      .eq("sell_in_order_id", orderId)
      .order("created_at");
    if (error) { console.error("[getSellInLines]", error.message); return []; }
    return data || [];
  } catch (err: any) {
    console.error("[getSellInLines] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function createSellInLine(orderId: string, formData: {
  product_id: string;
  invoice_type: "purchase" | "return";
  packing_qty: number;
  qty: number;
  rate: number;
  wh_tax_pct?: number;
  unit_commission?: number;
  unit_scheme?: number;
}) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("sell_in_lines")
    .insert({ ...formData, sell_in_order_id: orderId, tenant_id: tenantId })
    .select(`*, product:products(id, product_name, purchase_rate, category_id, product_categories(id, title))`)
    .single();
  if (error) throw new Error(error.message);
  REVALIDATE.forEach(p => revalidatePath(p));
  return data;
}

export async function updateSellInLine(id: string, formData: {
  packing_qty?: number;
  qty?: number;
  rate?: number;
  wh_tax_pct?: number;
  unit_commission?: number;
  unit_scheme?: number;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sell_in_lines")
    .update(formData)
    .eq("id", id)
    .select(`*, product:products(id, product_name, purchase_rate, category_id, product_categories(id, title))`)
    .single();
  if (error) throw new Error(error.message);
  REVALIDATE.forEach(p => revalidatePath(p));
  return data;
}

export async function deleteSellInLine(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sell_in_lines").delete().eq("id", id);
  if (error) throw new Error(error.message);
  REVALIDATE.forEach(p => revalidatePath(p));
}

// ------ MARK SELL IN ARRIVED (new per-line confirmation) --------------------------------------------------
//
// Replaces one-click stock_arrived.
// Upserts one row per line into sell_in_arrived_lines, then marks order arrived.

export async function markSellInArrived(
  orderId: string,
  arrivedLines: { lineId: string; arrivedQty: number; returnedQty: number; returnedAmt?: number; returnDate?: string }[]
) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized");

  if (arrivedLines.length === 0) throw new Error("No lines provided.");

  // Upsert each arrived line (unique on sell_in_line_id)
  const rows = arrivedLines.map((l) => ({
    sell_in_order_id: orderId,
    sell_in_line_id:  l.lineId,
    arrived_qty:      l.arrivedQty,
    returned_qty:     l.returnedQty,
    returned_amt:     l.returnedAmt || 0,
    tenant_id:        tenantId,
  }));

  const { error: upsertErr } = await supabase
    .from("sell_in_arrived_lines")
    .upsert(rows, { onConflict: "sell_in_line_id" });

  if (upsertErr) throw new Error(upsertErr.message);

  // Upsert return entries for non-zero return lines (updates Qty per PO line instead of duplicating)
  const returnEntries = arrivedLines
    .filter((l) => l.returnedQty > 0)
    .map((l) => ({
      tenant_id:        tenantId,
      sell_in_order_id: orderId,
      sell_in_line_id:  l.lineId,
      returned_qty:     l.returnedQty,
      returned_amt:     l.returnedAmt || 0,
      return_date:      l.returnDate || new Date().toISOString().split("T")[0],
    }));

  if (returnEntries.length > 0) {
    const { error: entryErr } = await supabase
      .from("sell_in_return_entries")
      .upsert(returnEntries, { onConflict: "sell_in_line_id" });
    if (entryErr) console.error("[markSellInArrived] return entries upsert error:", entryErr.message);
  }

  const zeroLines = arrivedLines.filter((l) => l.returnedQty <= 0).map((l) => l.lineId);
  if (zeroLines.length > 0) {
    await supabase.from("sell_in_return_entries").delete().in("sell_in_line_id", zeroLines);
  }

  // Mark order as stock_arrived if it was previously in_progress (Pending).
  // If order was already on_credit or billed, preserve its payment status!
  const { data: existingOrder } = await supabase
    .from("sell_in_orders")
    .select("status")
    .eq("id", orderId)
    .single();

  if (existingOrder && existingOrder.status === "in_progress") {
    const { error: statusErr } = await supabase
      .from("sell_in_orders")
      .update({ status: "stock_arrived" })
      .eq("id", orderId);

    if (statusErr) throw new Error(statusErr.message);
  }

  REVALIDATE.forEach(p => revalidatePath(p));
}

// ------ PRODUCTS (for sell-in line item picker) ----------------------------------------------------------------------

export async function getProducts() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .select("id, product_name, purchase_rate, category_id, product_categories(id, title)")
      .order("product_name");
    if (error) { console.error("[getProducts]", error.message); return []; }
    return data || [];
  } catch (err: any) {
    console.error("[getProducts] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function deleteSellInOrders(ids: string[]) {
  if (!ids.length) return;
  const supabase = await createClient();
  const BATCH_SIZE = 200;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    await supabase.from("sell_in_lines").delete().in("order_id", chunk);
    const { error } = await supabase.from("sell_in_orders").delete().in("id", chunk);
    if (error) throw new Error(error.message);
  }
  REVALIDATE.forEach(p => revalidatePath(p));
}