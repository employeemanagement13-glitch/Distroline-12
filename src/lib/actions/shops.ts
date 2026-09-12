"use server";

import { createClient, createAdminClient, getTenantId } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface ShopFormData {
  outlet_code?: string;
  shop_name?: string;
  owner_name?: string;
  phone?: string;
  shop_type?: "cash" | "credit";
  credit_limit?: number;
  credit_terms_days?: number;
  is_filer?: boolean;
  address?: string;
  main_channel_desc?: string;
  preseller_name?: string;
  segment_desc?: string;
  status?: string;
  tax_number?: string;
  sub_trade_channel?: string;
  trade_channel?: string;
  gps?: string;
  open_date?: string;
  filer_status?: string;
  outlet_type?: string;
}

// --------------------------------------------------------------------------
// LIST SHOPS
// --------------------------------------------------------------------------
export async function getShops(filters?: { search?: string; type?: "cash" | "credit" | "" }) {
  try {
    const supabase = await createClient();
    const PAGE_SIZE = 1000;
    let allShops: any[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from("shops")
        .select("*")
        .order("shop_name")
        .range(from, from + PAGE_SIZE - 1);

      if (filters?.type) {
        query = query.eq("shop_type", filters.type);
      }

      const { data, error } = await query;
      if (error) {
        console.error("[getShops] error:", error.message);
        break;
      }

      if (data && data.length > 0) {
        allShops.push(...data);
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
        }
      } else {
        hasMore = false;
      }
    }

    if (filters?.search && allShops.length > 0) {
      const s = filters.search.toLowerCase();
      return allShops.filter(
        (shop) =>
          shop.shop_name?.toLowerCase().includes(s) ||
          shop.outlet_code?.toLowerCase().includes(s) ||
          shop.owner_name?.toLowerCase().includes(s) ||
          shop.phone?.toLowerCase().includes(s) ||
          shop.address?.toLowerCase().includes(s) ||
          shop.main_channel_desc?.toLowerCase().includes(s) ||
          shop.preseller_name?.toLowerCase().includes(s) ||
          shop.segment_desc?.toLowerCase().includes(s) ||
          shop.status?.toLowerCase().includes(s) ||
          shop.tax_number?.toLowerCase().includes(s) ||
          shop.sub_trade_channel?.toLowerCase().includes(s) ||
          shop.trade_channel?.toLowerCase().includes(s) ||
          shop.gps?.toLowerCase().includes(s) ||
          shop.open_date?.toLowerCase().includes(s) ||
          shop.filer_status?.toLowerCase().includes(s) ||
          shop.outlet_type?.toLowerCase().includes(s)
      );
    }

    return allShops;
  } catch (err: any) {
    console.error("[getShops] unexpected error:", err?.message ?? err);
    return [];
  }
}

// --------------------------------------------------------------------------
// SHOP DETAILS BY ID
// --------------------------------------------------------------------------
export async function getShopById(id: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("shops").select("*").eq("id", id).single();
    if (error) {
      console.error("[getShopById] error:", error.message);
      return null;
    }
    return data;
  } catch (err: any) {
    console.error("[getShopById] unexpected error:", err?.message ?? err);
    return null;
  }
}

// --------------------------------------------------------------------------
// BLOCKED ACCOUNTS LIST
// --------------------------------------------------------------------------
export async function getBlockedShops() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("blocked_shops").select("*");
    if (error) {
      console.error("[getBlockedShops] error:", error.message);
      return [];
    }
    return data || [];
  } catch (err: any) {
    console.error("[getBlockedShops] unexpected error:", err?.message ?? err);
    return [];
  }
}

// --------------------------------------------------------------------------
// BLOCK SHOP
// --------------------------------------------------------------------------
export async function blockShop(id: string, reason: string) {
  if (!reason.trim()) throw new Error("A reason is required to block a shop.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shops")
    .update({
      is_blocked: true,
      block_reason: reason,
      blocked_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/tab2/credit");
  revalidatePath("/tab2/blocked");
  return data;
}

// --------------------------------------------------------------------------
// UNBLOCK SHOP
// --------------------------------------------------------------------------
export async function unblockShop(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shops")
    .update({
      is_blocked: false,
      block_reason: null,
      blocked_at: null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/tab2/credit");
  revalidatePath("/tab2/blocked");
  return data;
}

// --------------------------------------------------------------------------
// CREATE / UPDATE SHOP
// --------------------------------------------------------------------------
export async function createShop(formData: Partial<ShopFormData>) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized: Tenant session not found.");

  const payload: any = {
    tenant_id: tenantId,
    outlet_code: (formData.outlet_code || "").trim() || `OUT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`,
    shop_name: (formData.shop_name || "").trim(),
    owner_name: (formData.owner_name || "").trim() || null,
    phone: (formData.phone || "").trim(),
    is_filer: formData.filer_status ? formData.filer_status === "Yes" : !!formData.is_filer,
    shop_type: (formData.outlet_type || "").toLowerCase() === "credit" || formData.shop_type === "credit" ? "credit" : "cash",
    credit_limit: formData.credit_limit ?? 0,
    credit_terms_days: formData.credit_terms_days ?? 0,
    address: (formData.address || "").trim() || null,
    main_channel_desc: (formData.main_channel_desc || "").trim() || null,
    preseller_name: (formData.preseller_name || "").trim() || null,
    segment_desc: (formData.segment_desc || "").trim() || null,
    status: (formData.status || "Active").trim(),
    tax_number: (formData.tax_number || "").trim() || null,
    sub_trade_channel: (formData.sub_trade_channel || "").trim() || null,
    trade_channel: (formData.trade_channel || "").trim() || null,
    gps: (formData.gps || "").trim() || null,
    open_date: (formData.open_date || "").trim() || null,
    filer_status: formData.filer_status || (formData.is_filer ? "Yes" : "No"),
    outlet_type: (formData.outlet_type || "").trim() || null,
  };

  let { data, error } = await supabase
    .from("shops")
    .insert(payload)
    .select()
    .single();

  if (error) {
    const fallbackPayload: Record<string, any> = { ...payload };
    delete fallbackPayload.address;
    delete fallbackPayload.main_channel_desc;
    delete fallbackPayload.preseller_name;
    delete fallbackPayload.segment_desc;
    delete fallbackPayload.status;
    delete fallbackPayload.tax_number;
    delete fallbackPayload.sub_trade_channel;
    delete fallbackPayload.trade_channel;
    delete fallbackPayload.gps;
    delete fallbackPayload.open_date;
    delete fallbackPayload.filer_status;
    delete fallbackPayload.outlet_type;
    const retry = await supabase.from("shops").insert(fallbackPayload).select().single();
    if (retry.error) throw new Error(retry.error.message);
    data = retry.data;
  }

  revalidatePath("/tab2/credit");
  revalidatePath("/shop-details");
  return data;
}

export async function updateShop(id: string, formData: Partial<ShopFormData>) {
  const supabase = await createClient();
  const payload: any = {};
  if (formData.outlet_code !== undefined) payload.outlet_code = (formData.outlet_code || "").trim();
  if (formData.shop_name !== undefined) payload.shop_name = (formData.shop_name || "").trim();
  if (formData.owner_name !== undefined) payload.owner_name = (formData.owner_name || "").trim() || null;
  if (formData.phone !== undefined) payload.phone = (formData.phone || "").trim();
  if (formData.shop_type !== undefined) payload.shop_type = formData.shop_type;
  if (formData.credit_limit !== undefined) payload.credit_limit = formData.credit_limit;
  if (formData.credit_terms_days !== undefined) payload.credit_terms_days = formData.credit_terms_days;
  if (formData.address !== undefined) payload.address = (formData.address || "").trim() || null;
  if (formData.main_channel_desc !== undefined) payload.main_channel_desc = (formData.main_channel_desc || "").trim() || null;
  if (formData.preseller_name !== undefined) payload.preseller_name = (formData.preseller_name || "").trim() || null;
  if (formData.segment_desc !== undefined) payload.segment_desc = (formData.segment_desc || "").trim() || null;
  if (formData.status !== undefined) payload.status = (formData.status || "Active").trim();
  if (formData.tax_number !== undefined) payload.tax_number = (formData.tax_number || "").trim() || null;
  if (formData.sub_trade_channel !== undefined) payload.sub_trade_channel = (formData.sub_trade_channel || "").trim() || null;
  if (formData.trade_channel !== undefined) payload.trade_channel = (formData.trade_channel || "").trim() || null;
  if (formData.gps !== undefined) payload.gps = (formData.gps || "").trim() || null;
  if (formData.open_date !== undefined) payload.open_date = (formData.open_date || "").trim() || null;
  if (formData.outlet_type !== undefined) {
    payload.outlet_type = (formData.outlet_type || "").trim() || null;
    if (payload.outlet_type) {
      payload.shop_type = payload.outlet_type.toLowerCase() === "credit" ? "credit" : "cash";
    }
  }
  if (formData.filer_status !== undefined) {
    payload.filer_status = formData.filer_status;
    payload.is_filer = formData.filer_status === "Yes";
  } else if (formData.is_filer !== undefined) {
    payload.is_filer = !!formData.is_filer;
    payload.filer_status = formData.is_filer ? "Yes" : "No";
  }

  let { data, error } = await supabase
    .from("shops")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    const fallbackPayload: Record<string, any> = { ...payload };
    delete fallbackPayload.address;
    delete fallbackPayload.main_channel_desc;
    delete fallbackPayload.preseller_name;
    delete fallbackPayload.segment_desc;
    delete fallbackPayload.status;
    delete fallbackPayload.tax_number;
    delete fallbackPayload.sub_trade_channel;
    delete fallbackPayload.trade_channel;
    delete fallbackPayload.gps;
    delete fallbackPayload.open_date;
    delete fallbackPayload.filer_status;
    delete fallbackPayload.outlet_type;
    const retry = await supabase.from("shops").update(fallbackPayload).eq("id", id).select().single();
    if (retry.error) throw new Error(retry.error.message);
    data = retry.data;
  }

  revalidatePath("/tab2/credit");
  revalidatePath("/shop-details");
  return data;
}

export async function deleteShop(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("shops").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tab2/credit");
}

export async function deleteShops(ids: string[]) {
  if (!ids.length) return;
  const supabase = await createClient();
  const BATCH_SIZE = 200;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("shops").delete().in("id", chunk);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/tab2/credit");
  revalidatePath("/shop-details");
}

// --------------------------------------------------------------------------
// RECORD PAYMENT (Record payment per row)
// Increments amount_received on a credit invoice.
// --------------------------------------------------------------------------
export async function recordShopPayment(
  invoiceId: string,
  amount: number,
  description?: string,
  bankAccountId?: string
) {
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized: Tenant session not found.");
  const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : await createClient();

  const { data: invoice, error: getErr } = await supabase
    .from("invoices")
    .select("amount_received, grand_total, amount, shop_id")
    .eq("id", invoiceId)
    .single();

  if (getErr) throw new Error(getErr.message);

  const newAmount = Number(invoice.amount_received || 0) + amount;

  const { data, error } = await supabase
    .from("invoices")
    .update({ amount_received: newAmount })
    .eq("id", invoiceId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  const { error: payErr } = await supabase.from("shop_payments").insert({
    tenant_id: tenantId,
    shop_id: invoice.shop_id,
    invoice_id: invoiceId,
    bank_account_id: bankAccountId || null,
    amount,
    description: description || null,
    payment_date: new Date().toISOString().split("T")[0],
  });

  if (payErr) throw new Error(`shop_payments insert failed: ${payErr.message}. Run the DB migration mdos_v32_shop_payments.sql in Supabase first.`);

  revalidatePath("/tab2/credit");
  revalidatePath("/shop-details");
  revalidatePath("/cash-bank/bank-accounts");
  return data;
}

export async function getShopLedger(shopId: string, fromDate?: string, toDate?: string) {
  try {
    const supabase = await createClient();

    const [invoicesRes, paymentsRes] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, invoice_no, scheduled_date, invoice_type, grand_total, amount_received")
        .eq("shop_id", shopId)
        .order("scheduled_date", { ascending: true }),
      supabase
        .from("shop_payments")
        .select("id, invoice_id, amount, payment_date, description, bank_account:bank_accounts(bank_name, account_title), invoice:invoices(invoice_no)")
        .eq("shop_id", shopId)
        .order("payment_date", { ascending: true }),
    ]);

    const invoices = invoicesRes.data || [];
    const payments = paymentsRes.data || [];

    const entries: any[] = [];

    invoices.forEach((inv) => {
      const isCredit = inv.invoice_type === "credit";
      entries.push({
        id: `inv-${inv.id}`,
        date: inv.scheduled_date,
        voucher_no: inv.invoice_no,
        description: isCredit ? "CREDIT SALE." : "CASH SALE.",
        debit: Number(inv.grand_total || 0),
        credit: 0,
        affects_balance: isCredit,
        created_at: inv.scheduled_date + "T00:00:00",
      });
    });

    payments.forEach((p: any) => {
      const bankLabel = p.bank_account
        ? `${p.bank_account.bank_name} (${p.bank_account.account_title})`
        : "";
      entries.push({
        id: `pay-${p.id}`,
        date: p.payment_date,
        voucher_no: p.invoice?.invoice_no ? `REC/${p.invoice.invoice_no}` : "REC/PAYMENT",
        description: [p.description || "Online Rec", bankLabel].filter(Boolean).join(" - "),
        debit: 0,
        credit: Number(p.amount || 0),
        affects_balance: true,
        created_at: p.payment_date + "T12:00:00",
      });
    });

    entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    let running = 0;
    const computed = entries.map((e) => {
      if (e.affects_balance) {
        running = running + e.debit - e.credit;
      }
      return { ...e, balance: running };
    });

    if (fromDate || toDate) {
      return computed.filter((e) => {
        if (fromDate && e.date < fromDate) return false;
        if (toDate && e.date > toDate) return false;
        return true;
      });
    }

    return computed;
  } catch (err: any) {
    console.error("[getShopLedger] error:", err?.message ?? err);
    return [];
  }
}

export async function getShopInvoices(shopId: string, filters?: { year?: string; month?: string; type?: "cash" | "credit" | "" }) {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("invoices")
      .select(`
        *,
        dm:employees!invoices_dm_id_fkey(full_name),
        preseller:employees!invoices_preseller_id_fkey(full_name)
      `)
      .eq("shop_id", shopId)
      .order("scheduled_date", { ascending: false });

    if (filters?.type) {
      query = query.eq("invoice_type", filters.type);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[getShopInvoices] error:", error.message);
      return [];
    }

    let result = data || [];
    if (filters?.year) {
      result = result.filter((inv) => inv.scheduled_date.startsWith(filters.year!));
    }
    if (filters?.month) {
      result = result.filter((inv) => inv.scheduled_date.split("-")[1] === filters.month);
    }

    return result;
  } catch (err: any) {
    console.error("[getShopInvoices] unexpected error:", err?.message ?? err);
    return [];
  }
}

// --------------------------------------------------------------------------
// BULK IMPORT SHOPS [matched on outlet_code]
// --------------------------------------------------------------------------
export async function bulkImportShops(shopsList: Partial<ShopFormData>[]) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized: Tenant session not found.");

  const BATCH_SIZE = 100;
  const insertedData: any[] = [];

  for (let i = 0; i < shopsList.length; i += BATCH_SIZE) {
    const chunk = shopsList.slice(i, i + BATCH_SIZE);
    const shopsWithTenant = chunk.map((shop, idx) => ({
      tenant_id: tenantId,
      outlet_code: (shop.outlet_code || "").toString().trim() || `OUT-${Date.now().toString().slice(-6)}-${i + idx}`,
      shop_name: (shop.shop_name || "").toString().trim(),
      owner_name: (shop.owner_name || "").toString().trim() || null,
      phone: (shop.phone || "").toString().trim(),
      is_filer: !!shop.is_filer,
      shop_type: shop.shop_type || "cash",
      credit_limit: shop.credit_limit ?? 0,
      credit_terms_days: shop.credit_terms_days ?? 0,
      address: (shop.address || "").toString().trim() || null,
      main_channel_desc: (shop.main_channel_desc || "").toString().trim() || null,
      preseller_name: (shop.preseller_name || "").toString().trim() || null,
      segment_desc: (shop.segment_desc || "").toString().trim() || null,
    }));

    let { data, error } = await supabase
      .from("shops")
      .upsert(shopsWithTenant, { onConflict: "tenant_id,outlet_code" })
      .select();

    if (error && (error.message.includes("address") || error.message.includes("main_channel_desc") || error.message.includes("preseller_name") || error.message.includes("segment_desc"))) {
      const fallbackList = shopsWithTenant.map((s) => {
        const copy: Record<string, any> = { ...s };
        delete copy.address;
        delete copy.main_channel_desc;
        delete copy.preseller_name;
        delete copy.segment_desc;
        return copy;
      });
      const retry = await supabase.from("shops").upsert(fallbackList, { onConflict: "tenant_id,outlet_code" }).select();
      if (retry.error) throw new Error(retry.error.message);
      if (retry.data) insertedData.push(...retry.data);
    } else if (error) {
      throw new Error(error.message);
    } else if (data) {
      insertedData.push(...data);
    }
  }

  revalidatePath("/tab2/credit");
  revalidatePath("/shop-details");
  return insertedData;
}

// --------------------------------------------------------------------------
// 1. BULK IMPORT OUTLETS [From Outlets Reports.xlsx]
// --------------------------------------------------------------------------
export async function bulkImportOutlets(outletsList: Partial<ShopFormData>[]) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized: Tenant session not found.");

  const BATCH_SIZE = 100;
  const insertedData: any[] = [];

  for (let i = 0; i < outletsList.length; i += BATCH_SIZE) {
    const chunk = outletsList.slice(i, i + BATCH_SIZE);
    const shopsWithTenant = chunk.map((shop, idx) => ({
      tenant_id: tenantId,
      outlet_code: (shop.outlet_code || "").toString().trim() || `OUT-${Date.now().toString().slice(-6)}-${i + idx}`,
      shop_name: (shop.shop_name || "").toString().trim(),
      owner_name: (shop.owner_name || "").toString().trim() || null,
      phone: (shop.phone || "").toString().trim(),
      status: (shop.status || "Active").toString().trim(),
      tax_number: (shop.tax_number || "").toString().trim() || null,
      sub_trade_channel: (shop.sub_trade_channel || "").toString().trim() || null,
      trade_channel: (shop.trade_channel || "").toString().trim() || null,
      gps: (shop.gps || "").toString().trim() || null,
      open_date: (shop.open_date || "").toString().trim() || null,
      is_filer: shop.filer_status ? shop.filer_status === "Yes" : !!shop.is_filer,
      filer_status: shop.filer_status || (shop.is_filer ? "Yes" : "No"),
      outlet_type: (shop.outlet_type || "").toString().trim() || null,
      shop_type: (shop.outlet_type || "").toString().toLowerCase() === "credit" || shop.shop_type === "credit" ? "credit" : "cash",
      credit_limit: shop.credit_limit ?? 0,
      credit_terms_days: shop.credit_terms_days ?? 0,
    }));

    let { data, error } = await supabase
      .from("shops")
      .upsert(shopsWithTenant, { onConflict: "tenant_id,outlet_code" })
      .select();

    if (error) {
      const fallbackList = shopsWithTenant.map((s) => {
        const copy: Record<string, any> = { ...s };
        delete copy.status;
        delete copy.tax_number;
        delete copy.sub_trade_channel;
        delete copy.trade_channel;
        delete copy.gps;
        delete copy.open_date;
        delete copy.filer_status;
        delete copy.outlet_type;
        return copy;
      });
      const retry = await supabase.from("shops").upsert(fallbackList, { onConflict: "tenant_id,outlet_code" }).select();
      if (retry.error) throw new Error(retry.error.message);
      if (retry.data) insertedData.push(...retry.data);
    } else if (data) {
      insertedData.push(...data);
    }
  }

  revalidatePath("/tab2/credit");
  revalidatePath("/shop-details");
  return insertedData;
}

// --------------------------------------------------------------------------
// 2. BULK IMPORT TRADE OUTLETS [From Outlet Trade.xlsx]
// --------------------------------------------------------------------------
export async function bulkImportTradeOutlets(tradeList: {
  outlet_code: string;
  address?: string;
  main_channel_desc?: string;
  preseller_name?: string;
  segment_desc?: string;
  phone?: string;
  outlet_type?: string;
}[]) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized: Tenant session not found.");

  const BATCH_SIZE = 25;
  let updatedCount = 0;

  for (let i = 0; i < tradeList.length; i += BATCH_SIZE) {
    const chunk = tradeList.slice(i, i + BATCH_SIZE);
    await Promise.all(
      chunk.map(async (item) => {
        const code = (item.outlet_code || "").toString().trim();
        if (!code) return;

        const payload: any = {};
        if (item.address !== undefined) payload.address = (item.address || "").toString().trim() || null;
        if (item.main_channel_desc !== undefined) payload.main_channel_desc = (item.main_channel_desc || "").toString().trim() || null;
        if (item.preseller_name !== undefined) payload.preseller_name = (item.preseller_name || "").toString().trim() || null;
        if (item.segment_desc !== undefined) payload.segment_desc = (item.segment_desc || "").toString().trim() || null;
        if (item.phone !== undefined && item.phone !== "") payload.phone = (item.phone || "").toString().trim();
        if (item.outlet_type !== undefined && item.outlet_type !== "") {
          payload.outlet_type = (item.outlet_type || "").toString().trim();
          payload.shop_type = payload.outlet_type.toLowerCase() === "credit" ? "credit" : "cash";
        }

        let { error } = await supabase
          .from("shops")
          .update(payload)
          .eq("outlet_code", code)
          .eq("tenant_id", tenantId);

        if (error && error.message.includes("outlet_type")) {
          const fallbackPayload = { ...payload };
          delete fallbackPayload.outlet_type;
          const retry = await supabase
            .from("shops")
            .update(fallbackPayload)
            .eq("outlet_code", code)
            .eq("tenant_id", tenantId);
          if (!retry.error) updatedCount++;
        } else if (!error) {
          updatedCount++;
        }
      })
    );
  }

  revalidatePath("/tab2/credit");
  revalidatePath("/shop-details");
  return { updated: updatedCount };
}

