"use server";

import { createClient, createAdminClient, getTenantId } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getWarehouseRGBLevels, getWarehouseEmptiesLevels } from "@/lib/actions/warehouse-catalogue";
import { ensureOverdueAlerts } from "@/lib/actions/alerts";
import { parseProductsWithCode } from "@/lib/parsers/products";


// --------------------------------------------------------------------------
// TYPES
// --------------------------------------------------------------------------

export interface InvoiceFilters {
  search?: string;
  invoiceType?: "cash" | "credit" | "";
  deliveryStatus?: string;
  paymentStatus?: string;
  scheduledDate?: string;
  presellerId?: string;
  dmId?: string;
}

export interface InvoiceFormData {
  invoice_no: string;
  shop_id: string;
  outlet_code?: string;
  outlet_name?: string;
  record_date?: string;
  delivery_date?: string;
  seller_code?: string;
  seller_name?: string;
  store_name?: string;
  outlet_type?: string;
  total_qty?: number;
  amount?: number;
  tax_return?: string;
  excl_tax?: number;
  sales_tax?: number;
  adv_tax?: number;
  disc_tot?: number;

  // Optional legacy fields for backward compatibility
  preseller_id?: string;
  dm_id?: string;
  products?: string;
  promo_type?: string;
  promo_note?: string;
  invoice_date?: string;
  scheduled_date?: string;
  due_date?: string;
  invoice_type?: "cash" | "credit" | string;
  invoice_total?: number;
  discount_amount?: number;
  advance_tax?: number;
  empties_deposit?: number;
  amount_received?: number;
  delivery_status?: string;
  visit_status?: string;
}

// --------------------------------------------------------------------------
// LIST
// --------------------------------------------------------------------------

export async function getInvoices(filters?: InvoiceFilters) {
  try {
    const supabase = await createClient();

    let query = supabase
      .from("invoices")
      .select(`*, shop:shops(shop_name, outlet_code)`)
      .order("record_date", { ascending: false, nullsFirst: false });

    if (filters?.search) {
      query = query.or(
        `invoice_no.ilike.%${filters.search}%,outlet_name.ilike.%${filters.search}%,outlet_code.ilike.%${filters.search}%`
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error("[getInvoices] error:", error.message);
      return [];
    }
    return data || [];
  } catch (err: any) {
    console.error("[getInvoices] unexpected error:", err?.message ?? err);
    return [];
  }
}

export async function createInvoice(formData: InvoiceFormData) {

  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized: Tenant session not found.");

  const defaultDate = formData.record_date || formData.delivery_date || new Date().toISOString().split("T")[0];

  let isCredit = (formData.outlet_type || "").toLowerCase() === "credit" || formData.invoice_type === "credit";
  if (!isCredit && formData.shop_id) {
    const { data: s } = await supabase.from("shops").select("shop_type, outlet_type").eq("id", formData.shop_id).maybeSingle();
    if (s && (s.shop_type === "credit" || (s.outlet_type || "").toLowerCase() === "credit")) {
      isCredit = true;
    }
  }

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      tenant_id: tenantId,
      invoice_no: formData.invoice_no,
      shop_id: formData.shop_id || null,
      outlet_code: formData.outlet_code || null,
      outlet_name: formData.outlet_name || null,
      record_date: formData.record_date || null,
      delivery_date: formData.delivery_date || null,
      seller_code: formData.seller_code || null,
      seller_name: formData.seller_name || null,
      store_name: formData.store_name || null,
      outlet_type: formData.outlet_type || null,
      total_qty: formData.total_qty ?? null,
      amount: formData.amount ?? null,
      tax_return: formData.tax_return || null,
      excl_tax: formData.excl_tax ?? null,
      sales_tax: formData.sales_tax ?? null,
      adv_tax: formData.adv_tax ?? null,
      disc_tot: formData.disc_tot ?? null,
      // Fallback defaults for legacy NOT NULL columns
      products: formData.products || "",
      invoice_date: defaultDate,
      scheduled_date: formData.delivery_date || defaultDate,
      invoice_type: isCredit ? "credit" : (formData.invoice_type || "cash"),
      invoice_total: formData.amount ?? 0,
      discount_amount: formData.discount_amount ?? 0,
      advance_tax: formData.adv_tax ?? 0,
      promo_type: formData.promo_type || "none",
      delivery_status: formData.delivery_status || "delivered",
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  if (isCredit) {
    try {
      await ensureOverdueAlerts();
    } catch (e: any) {
      console.error("[createInvoice ensureOverdueAlerts]", e?.message);
    }
  }

  if (formData.products && formData.invoice_no) {
    try {
      await deductWarehouseStockForInvoices(supabase, tenantId, [
        { invoice_no: formData.invoice_no, products: formData.products },
      ]);
    } catch (e: any) {
      console.error("[createInvoice deductWarehouseStockForInvoices]", e?.message);
    }
  }

  revalidatePath("/tab1/transactions");
  revalidatePath("/tab1/invoices");
  revalidatePath("/tab2/credit");
  revalidatePath("/tab7/alerts");
  revalidatePath("/inventory/warehouse");
  revalidatePath("/tab3/warehouse");
  return data;
}

// --------------------------------------------------------------------------
// UPDATE
// --------------------------------------------------------------------------

export async function updateInvoice(id: string, formData: Partial<InvoiceFormData>) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  const updatePayload: Record<string, unknown> = {};
  if (formData.invoice_no !== undefined) updatePayload.invoice_no = formData.invoice_no;
  if (formData.shop_id !== undefined) updatePayload.shop_id = formData.shop_id;
  if (formData.outlet_code !== undefined) updatePayload.outlet_code = formData.outlet_code || null;
  if (formData.outlet_name !== undefined) updatePayload.outlet_name = formData.outlet_name || null;
  if (formData.record_date !== undefined) updatePayload.record_date = formData.record_date || null;
  if (formData.delivery_date !== undefined) updatePayload.delivery_date = formData.delivery_date || null;
  if (formData.seller_code !== undefined) updatePayload.seller_code = formData.seller_code || null;
  if (formData.seller_name !== undefined) updatePayload.seller_name = formData.seller_name || null;
  if (formData.store_name !== undefined) updatePayload.store_name = formData.store_name || null;
  if (formData.outlet_type !== undefined) updatePayload.outlet_type = formData.outlet_type || null;
  if (formData.total_qty !== undefined) updatePayload.total_qty = formData.total_qty ?? null;
  if (formData.amount !== undefined) updatePayload.amount = formData.amount ?? null;
  if (formData.tax_return !== undefined) updatePayload.tax_return = formData.tax_return || null;
  if (formData.excl_tax !== undefined) updatePayload.excl_tax = formData.excl_tax ?? null;
  if (formData.sales_tax !== undefined) updatePayload.sales_tax = formData.sales_tax ?? null;
  if (formData.adv_tax !== undefined) updatePayload.adv_tax = formData.adv_tax ?? null;
  if (formData.disc_tot !== undefined) updatePayload.disc_tot = formData.disc_tot ?? null;
  if (formData.products !== undefined) updatePayload.products = formData.products || "";

  const { data, error } = await supabase
    .from("invoices")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  if (formData.products !== undefined && data?.invoice_no && tenantId) {
    try {
      await deductWarehouseStockForInvoices(supabase, tenantId, [
        { invoice_no: data.invoice_no, products: formData.products || "" },
      ]);
    } catch (e: any) {
      console.error("[updateInvoice deductWarehouseStockForInvoices]", e?.message);
    }
  }

  revalidatePath("/tab1/invoices");
  revalidatePath("/tab1/transactions");
  revalidatePath("/inventory/warehouse");
  revalidatePath("/tab3/warehouse");
  return data;
}

// --------------------------------------------------------------------------
// DELETE
// --------------------------------------------------------------------------

export async function deleteInvoice(id: string) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  if (tenantId) {
    const { data: inv } = await supabase
      .from("invoices")
      .select("invoice_no")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (inv?.invoice_no) {
      await supabase
        .from("sale_entries")
        .delete()
        .eq("sale_no", `INV-${inv.invoice_no.trim()}`)
        .eq("tenant_id", tenantId);
    }
  }

  const { error } = await supabase.from("invoices").delete().eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/tab1/invoices");
  revalidatePath("/tab1/transactions");
  revalidatePath("/inventory/warehouse");
  revalidatePath("/tab3/warehouse");
}

export async function deleteInvoices(ids: string[]) {
  if (!ids.length) return;
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized");
  const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : await createClient();

  const BATCH_SIZE = 200;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);

    const { data: invList } = await supabase
      .from("invoices")
      .select("invoice_no")
      .in("id", chunk)
      .eq("tenant_id", tenantId);

    if (invList && invList.length > 0) {
      const saleNos = invList
        .map((inv: any) => `INV-${inv.invoice_no?.trim()}`)
        .filter(Boolean);
      if (saleNos.length > 0) {
        await supabase
          .from("sale_entries")
          .delete()
          .in("sale_no", saleNos)
          .eq("tenant_id", tenantId);
      }
    }

    await supabase.from("invoice_line_items").delete().in("invoice_id", chunk);
    await supabase.from("invoice_returns").delete().in("invoice_id", chunk);
    const { error } = await supabase.from("invoices").delete().in("id", chunk).eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/tab1/invoices");
  revalidatePath("/tab1/transactions");
  revalidatePath("/inventory/warehouse");
  revalidatePath("/tab3/warehouse");
}

// --------------------------------------------------------------------------
// RESCHEDULE
// --------------------------------------------------------------------------

export async function rescheduleInvoice(id: string, newDate: string) {
  return updateInvoice(id, { record_date: newDate });
}

// --------------------------------------------------------------------------
// BULK IMPORT & MERGE
// --------------------------------------------------------------------------

export interface BulkInvoiceRow {
  invoice_no: string;
  shop_id?: string | null;
  outlet_code?: string | null;
  outlet_name?: string | null;
  record_date?: string | null;
  delivery_date?: string | null;
  seller_code?: string | null;
  seller_name?: string | null;
  store_name?: string | null;
  outlet_type?: string | null;
  total_qty?: number | null;
  amount?: number | null;
  tax_return?: string | null;
  excl_tax?: number | null;
  sales_tax?: number | null;
  adv_tax?: number | null;
  disc_tot?: number | null;
}

export async function bulkMergeInvoices(rows: BulkInvoiceRow[]) {
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized");

  const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : await createClient();

  if (!rows || rows.length === 0) return { inserted: 0, updated: 0 };

  const { data: creditShopsData } = await supabase
    .from("shops")
    .select("id, outlet_code, shop_type, outlet_type")
    .eq("tenant_id", tenantId)
    .or("shop_type.eq.credit,outlet_type.ilike.credit");

  const creditShopIds = new Set((creditShopsData || []).map((s) => s.id));
  const creditOutletCodes = new Set(
    (creditShopsData || []).map((s) => s.outlet_code).filter(Boolean)
  );

  const uniqueMap = new Map<string, BulkInvoiceRow>();
  for (const r of rows) {
    if (r && r.invoice_no) {
      uniqueMap.set(String(r.invoice_no).trim(), r);
    }
  }
  const cleanRows = Array.from(uniqueMap.values());

  let inserted = 0;
  let updated = 0;

  const BATCH = 100;
  for (let i = 0; i < cleanRows.length; i += BATCH) {
    const chunk = cleanRows.slice(i, i + BATCH);
    const invoiceNos = chunk.map((r) => String(r.invoice_no).trim()).filter(Boolean);

    const { data: existing } = await supabase
      .from("invoices")
      .select("id, invoice_no")
      .eq("tenant_id", tenantId)
      .in("invoice_no", invoiceNos);

    const existingMap = new Map((existing || []).map((e: any) => [e.invoice_no, e.id]));

    const inserts: any[] = [];
    const updates: { id: string; payload: Record<string, any> }[] = [];

    for (const r of chunk) {
      const invNo = String(r.invoice_no).trim();
      if (!invNo) continue;
      const existingId = existingMap.get(invNo);

      const isCredit =
        (r.outlet_type && r.outlet_type.toLowerCase() === "credit") ||
        (r.shop_id && creditShopIds.has(r.shop_id)) ||
        (r.outlet_code && creditOutletCodes.has(r.outlet_code));

      if (existingId) {
        const updatePayload: Record<string, any> = {};
        if (r.shop_id) updatePayload.shop_id = r.shop_id;
        if (r.outlet_code) updatePayload.outlet_code = r.outlet_code;
        if (r.outlet_name) updatePayload.outlet_name = r.outlet_name;
        if (r.record_date) updatePayload.record_date = r.record_date;
        if (r.delivery_date) updatePayload.delivery_date = r.delivery_date;
        if (r.seller_code) updatePayload.seller_code = r.seller_code;
        if (r.seller_name) updatePayload.seller_name = r.seller_name;
        if (r.store_name) updatePayload.store_name = r.store_name;
        if (r.outlet_type) updatePayload.outlet_type = r.outlet_type;
        if (r.total_qty != null) updatePayload.total_qty = r.total_qty;
        if (r.amount != null) {
          updatePayload.amount = r.amount;
          updatePayload.invoice_total = r.amount;
        }
        if (r.tax_return) updatePayload.tax_return = r.tax_return;
        if (r.excl_tax != null) updatePayload.excl_tax = r.excl_tax;
        if (r.sales_tax != null) updatePayload.sales_tax = r.sales_tax;
        if (r.adv_tax != null) updatePayload.adv_tax = r.adv_tax;
        if (r.disc_tot != null) updatePayload.disc_tot = r.disc_tot;
        if (isCredit) {
          updatePayload.invoice_type = "credit";
        }

        if (Object.keys(updatePayload).length > 0) {
          updates.push({ id: existingId, payload: updatePayload });
        }
      } else {
        const rowDate = r.record_date || r.delivery_date || new Date().toISOString().split("T")[0];
        inserts.push({
          tenant_id: tenantId,
          invoice_no: invNo,
          shop_id: r.shop_id || null,
          outlet_code: r.outlet_code || null,
          outlet_name: r.outlet_name || null,
          record_date: r.record_date || null,
          delivery_date: r.delivery_date || null,
          seller_code: r.seller_code || null,
          seller_name: r.seller_name || null,
          store_name: r.store_name || null,
          outlet_type: r.outlet_type || null,
          total_qty: r.total_qty ?? null,
          amount: r.amount ?? null,
          tax_return: r.tax_return || null,
          excl_tax: r.excl_tax ?? null,
          sales_tax: r.sales_tax ?? null,
          adv_tax: r.adv_tax ?? null,
          disc_tot: r.disc_tot ?? null,
          products: "",
          invoice_date: rowDate,
          scheduled_date: r.delivery_date || rowDate,
          invoice_type: isCredit ? "credit" : "cash",
          invoice_total: r.amount ?? 0,
          discount_amount: 0,
          advance_tax: r.adv_tax ?? 0,
          promo_type: "none",
          delivery_status: "delivered",
        });
      }
    }

    if (inserts.length > 0) {
      const { error: insertErr } = await supabase.from("invoices").insert(inserts);
      if (insertErr) {
        console.error("[bulkMergeInvoices insert error]:", insertErr.message);
        for (const item of inserts) {
          const { error: singleErr } = await supabase.from("invoices").insert(item);
          if (singleErr) {
            console.error("[bulkMergeInvoices single insert error]:", singleErr.message);
          } else {
            inserted++;
          }
        }
      } else {
        inserted += inserts.length;
      }
    }

    if (updates.length > 0) {
      const updatePromises = updates.map(({ id, payload }) =>
        supabase.from("invoices").update(payload).eq("id", id).eq("tenant_id", tenantId)
      );
      const results = await Promise.all(updatePromises);
      for (const res of results) {
        if (res.error) {
          console.error("[bulkMergeInvoices update error]:", res.error.message);
        } else {
          updated++;
        }
      }
    }
  }

  try {
    await ensureOverdueAlerts();
  } catch (e: any) {
    console.error("[bulkMergeInvoices ensureOverdueAlerts]", e?.message);
  }

  revalidatePath("/tab1/transactions");
  revalidatePath("/tab1/invoices");
  revalidatePath("/tab2/credit");
  revalidatePath("/tab7/alerts");
  return { inserted, updated, orphans: inserted };
}

export async function bulkImportInvoicesReport(rows: any[]) {
  return bulkMergeInvoices(rows);
}

export async function bulkImportSalesTax(rows: any[]) {
  return bulkMergeInvoices(rows);
}

export async function bulkImportSaleDetail(
  entries: { invoice_no: string; products: string }[]
) {
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized");

  const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : await createClient();

  let updated = 0;
  let notFound = 0;

  const BATCH = 50;
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH);
    const invoiceNos = chunk.map((e) => e.invoice_no);
    const variations = Array.from(
      new Set([
        ...invoiceNos,
        ...invoiceNos.map((s) => s.toLowerCase()),
        ...invoiceNos.map((s) => s.toUpperCase()),
      ])
    );

    const { data: existing } = await supabase
      .from("invoices")
      .select("id, invoice_no")
      .eq("tenant_id", tenantId)
      .in("invoice_no", variations);

    const existingMap = new Map<string, string>();
    for (const e of existing || []) {
      if (e.invoice_no) {
        existingMap.set(e.invoice_no, e.id);
        existingMap.set(e.invoice_no.toLowerCase(), e.id);
      }
    }

    const updatePromises = chunk.map(async (entry) => {
      const id =
        existingMap.get(entry.invoice_no) ||
        existingMap.get(entry.invoice_no.toLowerCase()) ||
        existingMap.get(entry.invoice_no.toUpperCase());

      if (!id) {
        return { notFound: true, error: null };
      }
      const { error } = await supabase
        .from("invoices")
        .update({ products: entry.products })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      return { notFound: false, error };
    });

    const results = await Promise.all(updatePromises);
    for (const res of results) {
      if (res.notFound) {
        notFound++;
      } else if (!res.error) {
        updated++;
      }
    }
  }

  revalidatePath("/tab1/transactions");
  revalidatePath("/tab1/invoices");

  // Deduct warehouse stock based on invoice products (non-returnable only)
  try {
    await deductWarehouseStockForInvoices(supabase, tenantId, entries);
  } catch (err: any) {
    console.error("[bulkImportSaleDetail] warehouse deduction error:", err?.message ?? err);
    // Non-fatal — don't throw, import still succeeded
  }

  return { updated, notFound };
}


// --------------------------------------------------------------------------
// PRIVATE — Warehouse stock deduction triggered by sale detail import
// --------------------------------------------------------------------------

/**
 * Deducts Ph.Case quantities from warehouse stock for each non-returnable product
 * found in the imported invoice product strings.
 * - Skips products whose category or product has is_returnable = true (per user rule)
 * - In MDOS, warehouse_standard_levels view dynamically subtracts SUM(sale_entry_lines.qty)
 *   from Ph.Case and recomputes Unit Case = ph_case × set_un_case.
 * - Records/updates deduplicated sale_entries (with sale_no = 'INV-' + invoice_no)
 *   and corresponding sale_entry_lines.
 */
export async function deductWarehouseStockForInvoices(
  supabase: any,
  tenantId: string,
  entries: { invoice_no: string; products: string }[]
) {
  if (!entries || entries.length === 0) return;

  // Step 1: Collect product codes & parse products for each invoice
  const allCodes = new Set<string>();
  const parsedByInvoice = new Map<string, { code: string; name: string; qty: number }[]>();

  for (const entry of entries) {
    if (!entry.products || !entry.invoice_no) continue;
    const items = parseProductsWithCode(entry.products);
    if (items.length > 0) {
      const invNo = String(entry.invoice_no).trim();
      parsedByInvoice.set(invNo, items);
      for (const item of items) {
        if (item.code) allCodes.add(item.code);
      }
    }
  }

  if (allCodes.size === 0) return;

  // Step 2: Query products and category metadata (is_returnable, set_un_case)
  const { data: prods, error: prodErr } = await supabase
    .from("products")
    .select("id, product_code, product_name, sale_rate, is_returnable, product_categories(id, title, set_un_case, is_returnable)")
    .eq("tenant_id", tenantId)
    .in("product_code", Array.from(allCodes));

  if (prodErr || !prods) {
    console.error("[deductWarehouseStockForInvoices] error fetching products:", prodErr?.message);
    return;
  }

  const prodMap = new Map<string, any>();
  prods.forEach((p: any) => {
    if (p.product_code) prodMap.set(p.product_code.trim(), p);
    if (p.product_name) prodMap.set(p.product_name.toLowerCase().trim(), p);
  });

  // Step 3: For each invoice, build non-returnable deduction lines
  // User rule: "do not deduct for Is Returnable? True products"
  const invoiceLinesMap = new Map<string, { product_id: string; sale_rate: number; qty: number }[]>();
  const allSaleNos: string[] = [];

  for (const [invNo, items] of parsedByInvoice.entries()) {
    const lines: { product_id: string; sale_rate: number; qty: number }[] = [];
    for (const item of items) {
      const prod = prodMap.get(item.code) || prodMap.get(item.name.toLowerCase().trim());
      if (!prod) {
        console.warn(`[deductWarehouseStockForInvoices] Code ${item.code} (${item.name}) not found in products table`);
        continue;
      }

      const isReturnable = Boolean(prod.is_returnable || prod.product_categories?.is_returnable);
      if (isReturnable) {
        // Skip returnable product from warehouse deduction per user rule
        continue;
      }

      lines.push({
        product_id: prod.id,
        sale_rate: Number(prod.sale_rate || 0),
        qty: item.qty,
      });
    }

    const saleNo = `INV-${invNo}`;
    if (lines.length > 0) {
      allSaleNos.push(saleNo);
      invoiceLinesMap.set(saleNo, lines);
    } else {
      // Empty or all returnable: remove any existing entry
      allSaleNos.push(saleNo);
      invoiceLinesMap.set(saleNo, []);
    }
  }

  if (allSaleNos.length === 0) return;

  // Step 4: Batch process sale_entries and sale_entry_lines via bulk upsert
  // In MDOS, warehouse_standard_levels view dynamically subtracts SUM(sale_entry_lines.qty)
  // from ph_case and recalculates unit_case = ph_case * set_un_case.
  const today = new Date().toISOString().slice(0, 10);

  const saleEntriesToUpsert: {
    tenant_id: string;
    sale_no: string;
    sale_date: string;
    total_amount: number;
  }[] = [];

  const saleNosToDelete: string[] = [];

  for (const saleNo of allSaleNos) {
    const lines = invoiceLinesMap.get(saleNo) || [];
    if (lines.length === 0) {
      saleNosToDelete.push(saleNo);
    } else {
      const totalAmount = lines.reduce((sum, l) => sum + l.sale_rate * l.qty, 0);
      saleEntriesToUpsert.push({
        tenant_id: tenantId,
        sale_no: saleNo,
        sale_date: today,
        total_amount: totalAmount,
      });
    }
  }

  if (saleNosToDelete.length > 0) {
    for (let i = 0; i < saleNosToDelete.length; i += 100) {
      const chunk = saleNosToDelete.slice(i, i + 100);
      await supabase.from("sale_entries").delete().in("sale_no", chunk).eq("tenant_id", tenantId);
    }
  }

  if (saleEntriesToUpsert.length > 0) {
    const upsertedMap = new Map<string, string>();
    for (let i = 0; i < saleEntriesToUpsert.length; i += 100) {
      const chunk = saleEntriesToUpsert.slice(i, i + 100);
      const { data: upserted, error: upErr } = await supabase
        .from("sale_entries")
        .upsert(chunk, { onConflict: "tenant_id,sale_no" })
        .select("id, sale_no");

      if (upErr) {
        console.error("[deductWarehouseStockForInvoices] Upsert error:", upErr.message);
        continue;
      }
      (upserted || []).forEach((u: any) => upsertedMap.set(u.sale_no, u.id));
    }

    const allEntryIds = Array.from(upsertedMap.values());
    for (let i = 0; i < allEntryIds.length; i += 100) {
      const chunk = allEntryIds.slice(i, i + 100);
      await supabase
        .from("sale_entry_lines")
        .delete()
        .in("sale_entry_id", chunk)
        .eq("tenant_id", tenantId);
    }

    const allLinesToInsert: any[] = [];
    for (const [saleNo, lines] of invoiceLinesMap.entries()) {
      const entryId = upsertedMap.get(saleNo);
      if (!entryId || lines.length === 0) continue;
      for (const line of lines) {
        allLinesToInsert.push({
          tenant_id: tenantId,
          sale_entry_id: entryId,
          product_id: line.product_id,
          sale_rate: line.sale_rate,
          qty: line.qty,
        });
      }
    }

    for (let i = 0; i < allLinesToInsert.length; i += 200) {
      const chunk = allLinesToInsert.slice(i, i + 200);
      const { error: linesErr } = await supabase.from("sale_entry_lines").insert(chunk);
      if (linesErr) {
        console.error("[deductWarehouseStockForInvoices] Lines insert error:", linesErr.message);
      }
    }
  }

  // Step 5: Revalidate warehouse catalogue and transactions
  revalidatePath("/inventory/warehouse");
  revalidatePath("/tab3/warehouse");
  revalidatePath("/tab1/transactions");
  revalidatePath("/tab1/invoices");
}

export async function syncAllInvoiceWarehouseDeductions() {
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized");
  const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : await createClient();

  const { data: invs, error } = await supabase
    .from("invoices")
    .select("invoice_no, products")
    .eq("tenant_id", tenantId)
    .neq("products", "")
    .not("products", "is", null);

  if (error || !invs) return { count: 0 };

  await deductWarehouseStockForInvoices(supabase, tenantId, invs);
  return { count: invs.length };
}


// --------------------------------------------------------------------------
// HELPER —  Get shops + employees for dropdowns
// --------------------------------------------------------------------------

export async function getShopsForDropdown() {
  try {
    const supabase = await createClient();
    const PAGE_SIZE = 1000;
    let allShops: any[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("shops")
        .select("id, shop_name, outlet_code, shop_type")
        .order("shop_name")
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error("[getShopsForDropdown] error:", error.message);
        break;
      }

      if (data && data.length > 0) {
        allShops.push(...data);
        if (data.length < PAGE_SIZE) hasMore = false;
        else from += PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    return allShops;
  } catch (err: any) {
    console.error("[getShopsForDropdown] unexpected error:", err?.message ?? err);
    return [];
  }
}

export async function getEmployeesForDropdown() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employees")
      .select("id, full_name, role")
      .order("full_name");
    if (error) {
      console.error("[getEmployeesForDropdown] error:", error.message);
      return [];
    }
    return data || [];
  } catch (err: any) {
    console.error("[getEmployeesForDropdown] unexpected error:", err?.message ?? err);
    return [];
  }
}

export async function saveInvoiceReturns(
  invoiceId: string,
  returns: { product_name: string; returned_qty: number; note?: string }[]
) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized: Tenant session not found.");

  const rows = returns
    .filter((r) => r.returned_qty > 0)
    .map((r) => ({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      product_name: r.product_name,
      returned_qty: r.returned_qty,
      return_date: new Date().toISOString().split("T")[0],
      note: r.note || null,
    }));

  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from("invoice_returns")
    .upsert(rows, { onConflict: "tenant_id,invoice_id,product_name" })
    .select();

  if (error) throw new Error(error.message);

  revalidatePath("/tab1/invoices");
  revalidatePath("/inventory/warehouse");
  return data;
}

export async function getInvoiceReturns(invoiceId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("invoice_returns")
      .select("*")
      .eq("invoice_id", invoiceId);
    if (error) { console.error("[getInvoiceReturns]", error.message); return []; }
    return data || [];
  } catch (err: any) {
    console.error("[getInvoiceReturns] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function getWarehouseProductNamesWithCategory(): Promise<{
  id: string;
  product_name: string;
  qty_total: number;
  available: number;
  sale_rate: number;
  is_returnable: boolean;
}[]> {
  try {
    const supabase = await createClient();
    const tenantId = await getTenantId();

    const [stdReq, rgbData, empData, catReq] = await Promise.all([
      supabase.from("warehouse_standard_levels").select("product_id, product_name, total_qty, flappy").eq("tenant_id", tenantId ?? ""),
      getWarehouseRGBLevels(),
      getWarehouseEmptiesLevels(),
      supabase.from("products").select("id, product_name, sale_rate, is_returnable").eq("tenant_id", tenantId ?? ""),
    ]);

    const returnableSet = new Set<string>();
    const saleRateMap = new Map<string, number>();
    const productIdMap = new Map<string, string>();

    if (catReq.data) {
      catReq.data.forEach((p: any) => {
        if (p.is_returnable) returnableSet.add(p.product_name);
        saleRateMap.set(p.product_name, Number(p.sale_rate) || 0);
        productIdMap.set(p.product_name, p.id);
      });
    }

    const seen = new Set<string>();
    const items: { id: string; product_name: string; qty_total: number; available: number; sale_rate: number; is_returnable: boolean }[] = [];

    if (stdReq.data) {
      stdReq.data.forEach((s: any) => {
        if (seen.has(s.product_name)) return;
        seen.add(s.product_name);
        const netTotal = Math.max(0, Number(s.total_qty || 0));
        items.push({
          id: productIdMap.get(s.product_name) || s.product_id || s.product_name,
          product_name: s.product_name,
          qty_total: netTotal,
          available: netTotal,
          sale_rate: saleRateMap.get(s.product_name) || 0,
          is_returnable: returnableSet.has(s.product_name),
        });
      });
    }

    if (rgbData) {
      rgbData.forEach((s: any) => {
        if (seen.has(s.product_name)) return;
        seen.add(s.product_name);
        items.push({
          id: productIdMap.get(s.product_name) || s.product_id || s.product_name,
          product_name: s.product_name,
          qty_total: s.total_qty || 0,
          available: s.available || 0,
          sale_rate: saleRateMap.get(s.product_name) || 0,
          is_returnable: true,
        });
      });
    }

    if (empData) {
      empData.forEach((s: any) => {
        if (seen.has(s.product_name)) return;
        seen.add(s.product_name);
        items.push({
          id: productIdMap.get(s.product_name) || s.product_id || s.product_name,
          product_name: s.product_name,
          qty_total: s.total_qty || 0,
          available: s.available || 0,
          sale_rate: saleRateMap.get(s.product_name) || 0,
          is_returnable: true,
        });
      });
    }

    if (catReq.data) {
      catReq.data.forEach((p: any) => {
        if (seen.has(p.product_name)) return;
        seen.add(p.product_name);
        items.push({
          id: p.id,
          product_name: p.product_name,
          qty_total: 0,
          available: 0,
          sale_rate: Number(p.sale_rate) || 0,
          is_returnable: Boolean(p.is_returnable),
        });
      });
    }

    items.sort((a, b) => a.product_name.localeCompare(b.product_name));
    return items;
  } catch (err: any) {
    console.error("[getWarehouseProductNamesWithCategory] error:", err?.message ?? err);
    return [];
  }
}

export async function saveAdditionalDiscount(invoiceId: string, amount: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ additional_discount: amount })
    .eq("id", invoiceId);
  if (error) throw new Error(error.message);
  revalidatePath("/tab1/invoices");
  revalidatePath("/reports/financial");
}


