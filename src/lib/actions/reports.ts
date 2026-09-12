"use server";

import { createClient, createAdminClient, getTenantId } from "@/lib/supabase/server";
import { parseProducts } from "@/lib/parsers/products";

// ─── STOCK LEDGER ─────────────────────────────────────────────────────────────
// productId here is the UUID from the products table.
// The UI resolves product_name → product_id via getProducts() below.

export async function getStockLedger(params: {
  productId: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_stock_ledger", {
      p_product_id: params.productId,
      p_date_from:  params.dateFrom || null,
      p_date_to:    params.dateTo   || null,
    });
    if (error) { console.error("[getStockLedger]", error.message); return []; }
    return data || [];
  } catch (err: any) {
    console.error("[getStockLedger] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function getEmptyLedger(params: {
  productId: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_empty_ledger", {
      p_product_id: params.productId,
      p_date_from:  params.dateFrom || null,
      p_date_to:    params.dateTo   || null,
    });
    if (error) { console.error("[getEmptyLedger]", error.message); return []; }
    return data || [];
  } catch (err: any) {
    console.error("[getEmptyLedger] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function deleteEmptyLedgerEntry(eventId: string, sourceType: string) {
  try {
    const supabase = await createClient();

    if (sourceType === "po" || sourceType === "po_return") {
      const { data: entry } = await supabase
        .from("sell_in_return_entries")
        .select("sell_in_line_id, returned_qty")
        .eq("id", eventId)
        .single();

      if (entry) {
        await supabase.from("sell_in_return_entries").delete().eq("id", eventId);
        const { data: sal } = await supabase
          .from("sell_in_arrived_lines")
          .select("returned_qty")
          .eq("sell_in_line_id", entry.sell_in_line_id)
          .single();
        if (sal) {
          const newRet = Math.max(0, (sal.returned_qty || 0) - (entry.returned_qty || 0));
          await supabase
            .from("sell_in_arrived_lines")
            .update({ returned_qty: newRet })
            .eq("sell_in_line_id", entry.sell_in_line_id);
        }
      } else {
        await supabase.from("sell_in_arrived_lines").delete().eq("id", eventId);
      }
    } else if (sourceType === "returns") {
      await supabase.from("invoice_returns").delete().eq("id", eventId);
    } else if (sourceType === "invoice") {
      await supabase.from("invoice_line_items").delete().eq("id", eventId);
    }

    return { success: true };
  } catch (err: any) {
    console.error("[deleteEmptyLedgerEntry]", err.message);
    throw new Error(err.message);
  }
}

export async function getInvoicesForLedger(productName: string, date: string) {
  try {
    const supabase = await createClient();
    const normName = productName.toLowerCase().trim();

    // Try invoice_line_items table first (normalized schema)
    // Filter by invoice_date on the joined invoices table to avoid fetching all rows
    const { data: lineItems } = await supabase
      .from("invoice_line_items")
      .select(`
        quantity,
        line_amount,
        invoice:invoices(
          id,
          invoice_no,
          invoice_date,
          payment_status,
          shop:shops(shop_name, outlet_code)
        ),
        product:products(product_name)
      `)
      .eq("invoice:invoices.invoice_date", date);

    const directMatches = (lineItems || [])
      .filter((item: any) =>
        item.invoice &&
        item.invoice.invoice_date === date &&
        item.product &&
        item.product.product_name.toLowerCase().trim() === normName
      )
      .map((item: any) => ({
        invoice_no: item.invoice.invoice_no || "-",
        invoice_date: item.invoice.invoice_date,
        shop_name: item.invoice?.shop?.shop_name || "-",
        outlet_code: item.invoice?.shop?.outlet_code || "-",
        product_name: item.product.product_name,
        quantity: item.quantity,
        amount: item.line_amount,
        payment_status: item.invoice.payment_status || "-",
      }));

    if (directMatches.length > 0) return directMatches;

    // Fallback: read from the invoices.products text column using the shared parseProducts parser
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_no, invoice_date, products, payment_status, shop:shops(shop_name, outlet_code)")
      .eq("invoice_date", date);

    const fallbackMatches: any[] = [];
    (invoices || []).forEach((inv: any) => {
      if (!inv.products) return;
      const parsed = parseProducts(inv.products);
      for (const { name, qty } of parsed) {
        if (name.toLowerCase().trim() === normName) {
          fallbackMatches.push({
            invoice_no: inv.invoice_no || "-",
            invoice_date: inv.invoice_date,
            shop_name: inv.shop?.shop_name || "-",
            outlet_code: inv.shop?.outlet_code || "-",
            product_name: name,
            quantity: qty,
            amount: 0,
            payment_status: inv.payment_status || "-",
          });
        }
      }
    });

    return fallbackMatches;
  } catch (err: any) {
    console.error("[getInvoicesForLedger] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function getReturnsForLedger(productName: string, date: string) {
  try {
    const supabase = await createClient();
    const normName = productName.toLowerCase().trim();

    const { data: returnsData, error } = await supabase
      .from("invoice_returns")
      .select(`
        id,
        return_date,
        product_name,
        returned_qty,
        note,
        invoice:invoices(
          invoice_no,
          shop:shops(shop_name, outlet_code)
        )
      `)
      .gt("returned_qty", 0);

    if (error) {
      console.error("[getReturnsForLedger]", error.message);
      return [];
    }

    const filtered = (returnsData || [])
      .filter((r: any) => {
        if (!r.product_name) return false;
        const pName = r.product_name.toLowerCase().trim();
        const matchesProduct = pName === normName || normName.includes(pName) || pName.includes(normName);
        const matchesDate = !date || r.return_date === date || String(r.return_date).startsWith(date);
        return matchesProduct && matchesDate;
      })
      .map((r: any) => ({
        invoice_no: r.invoice?.invoice_no || "—",
        return_date: r.return_date,
        shop_name: r.invoice?.shop?.shop_name || "—",
        outlet_code: r.invoice?.shop?.outlet_code || "—",
        product_name: r.product_name,
        returned_qty: r.returned_qty,
        note: r.note || "—",
        status: "approved",
      }));

    return filtered;
  } catch (err: any) {
    console.error("[getReturnsForLedger] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function getStockBalanceByLevel(params?: {
  dateFrom?: string;
  dateTo?: string;
}) {
  try {
    const supabase = await createClient();
    if (params?.dateFrom || params?.dateTo) {
      const { data, error } = await supabase.rpc("get_stock_balance_filtered", {
        p_date_from: params.dateFrom || null,
        p_date_to:   params.dateTo   || null,
      });
      if (error) { console.error("[getStockBalanceByLevel RPC]", error.message); return []; }
      return data || [];
    }
    const { data, error } = await supabase
      .from("stock_balance_by_level")
      .select("product_name, packing_qty, total_qty_in, total_qty_out, net_balance")
      .order("product_name");
    if (error) { console.error("[getStockBalanceByLevel]", error.message); return []; }
    return data || [];
  } catch (err: any) {
    console.error("[getStockBalanceByLevel] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function getSalePurchaseSummary(params?: {
  dateFrom?: string;
  dateTo?: string;
}) {
  try {
    const supabase = await createClient();
    if (params?.dateFrom || params?.dateTo) {
      const { data, error } = await supabase.rpc("get_sale_purchase_filtered", {
        p_date_from: params.dateFrom || null,
        p_date_to:   params.dateTo   || null,
      });
      if (error) { console.error("[getSalePurchaseSummary RPC]", error.message); return []; }
      return data || [];
    }
    const { data, error } = await supabase
      .from("sale_purchase_summary")
      .select("*")
      .order("product_name");
    if (error) { console.error("[getSalePurchaseSummary]", error.message); return []; }
    return data || [];
  } catch (err: any) {
    console.error("[getSalePurchaseSummary] unexpected:", err?.message ?? err);
    return [];
  }
}



export async function getStockDiscrepancies() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("stock_discrepancies_view")
      .select("product_name, audit_date, system_qty, physical_qty, diff, status, reason")
      .order("audit_date", { ascending: false });
    if (error) { console.error("[getStockDiscrepancies]", error.message); return []; }
    return data || [];
  } catch (err: any) {
    console.error("[getStockDiscrepancies] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function getWHTaxSummary(params?: {
  dateFrom?: string;
  dateTo?: string;
}) {
  try {
    const supabase = await createClient();
    
    let query = supabase
      .from("sell_in_orders")
      .select("transaction_date, po_no, company_inv_no, sell_in_lines(qty, rate, invoice_type)")
      .in("status", ["stock_arrived", "on_credit", "billed"])
      .order("transaction_date", { ascending: false });

    if (params?.dateFrom) query = query.gte("transaction_date", params.dateFrom);
    if (params?.dateTo)   query = query.lte("transaction_date", params.dateTo);

    const { data, error } = await query;
    if (error) { console.error("[getWHTaxSummary]", error.message); return []; }
    
    return (data || []).map((order: any) => {
      const totalAmount = order.sell_in_lines?.reduce((sum: number, line: any) => {
        if (line.invoice_type === 'purchase') {
          return sum + ((Number(line.qty) || 0) * (Number(line.rate) || 0));
        }
        return sum;
      }, 0) || 0;
      
      return {
        date: order.transaction_date,
        voucher: order.po_no,
        vendor: "CCBPL",
        ccbpl_invoice_no: order.company_inv_no,
        wh_tax_total: totalAmount * 0.001
      };
    });
  } catch (err: any) {
    console.error("[getWHTaxSummary] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function getTrialBalance() {
  try {
    const supabase = await createClient();
    // trial_balance view: code, category, label, total_debit, total_credit, net_balance
    const { data, error } = await supabase
      .from("trial_balance")
      .select("code, category, label, total_debit, total_credit, net_balance")
      .order("category")
      .order("code");
    if (error) { console.error("[getTrialBalance]", error.message); return []; }
    return data || [];
  } catch (err: any) {
    console.error("[getTrialBalance] unexpected:", err?.message ?? err);
    return [];
  }
}

// Returns { id, product_name } pairs for use in stock ledger product dropdown
export async function getProducts(): Promise<{ id: string; product_name: string }[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .select("id, product_name")
      .eq("active", true)
      .order("product_name");
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

export async function getReturnableProducts(): Promise<{ id: string; product_name: string }[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .select("id, product_name, category_id, is_returnable, product_categories(is_returnable)")
      .eq("active", true)
      .order("product_name");
    if (error || !data) return [];
    
    return data.filter((p: any) => {
      const isRet = Boolean(p.product_categories?.is_returnable || p.is_returnable);
      if (isRet) return true;
      const lower = (p.product_name || "").toLowerCase().trim();
      return (
        lower.includes("rgb") ||
        lower.includes("pallet") ||
        lower.includes("shell") ||
        lower.includes("sheet") ||
        lower.includes("empties") ||
        lower.includes("crate")
      );
    }).map((p: any) => ({ id: p.id, product_name: p.product_name }));
  } catch {
    return [];
  }
}

// Legacy alias kept for backward compat
export async function getProductNames(): Promise<string[]> {
  const products = await getProducts();
  return products.map((p) => p.product_name);
}

// ─── NEW: ADVANCE TAX REPORT ─────────────────────────────────────────────────

export async function getAdvanceTaxReport(params?: {
  dateFrom?: string;
  dateTo?: string;
}) {
  try {
    const supabase = await createClient();
    const tenantId = await getTenantId();
    if (!tenantId) return [];

    const { data, error } = await supabase
      .from("invoices")
      .select("record_date, invoice_date, amount, grand_total, adv_tax, advance_tax")
      .eq("tenant_id", tenantId)
      .order("record_date", { ascending: false, nullsFirst: false });

    if (error) {
      let vQuery = supabase
        .from("advance_tax_report")
        .select("date, sale, cash_collection, tax_collected")
        .order("date", { ascending: false });
      if (params?.dateFrom) vQuery = vQuery.gte("date", params.dateFrom);
      if (params?.dateTo)   vQuery = vQuery.lte("date", params.dateTo);
      const { data: vData } = await vQuery;
      return vData || [];
    }

    const map = new Map<string, { date: string; sale: number; cash_collection: number; tax_collected: number }>();
    for (const inv of (data || [])) {
      const d = (inv.record_date || inv.invoice_date || "").split("T")[0];
      if (!d) continue;
      if (params?.dateFrom && d < params.dateFrom) continue;
      if (params?.dateTo && d > params.dateTo) continue;

      const sale = Number(inv.amount ?? inv.grand_total ?? 0);
      const tax = Number(inv.adv_tax ?? inv.advance_tax ?? 0);

      const existing = map.get(d);
      if (existing) {
        existing.sale += sale;
        existing.tax_collected += tax;
      } else {
        map.set(d, { date: d, sale, cash_collection: 0, tax_collected: tax });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  } catch (err: any) {
    console.error("[getAdvanceTaxReport] unexpected:", err?.message ?? err);
    return [];
  }
}

// ─── NEW: DISCOUNT REPORT ────────────────────────────────────────────────────

export async function getDiscountReport(params?: {
  dateFrom?: string;
  dateTo?: string;
}) {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("discount_report")
      .select("date, sale, cash_collection, discount_given")
      .order("date", { ascending: false });

    if (params?.dateFrom) query = query.gte("date", params.dateFrom);
    if (params?.dateTo)   query = query.lte("date", params.dateTo);

    const { data, error } = await query;
    if (error) { console.error("[getDiscountReport]", error.message); return []; }
    return data || [];
  } catch (err: any) {
    console.error("[getDiscountReport] unexpected:", err?.message ?? err);
    return [];
  }
}

// ─── NEW: ADDITIONAL DISCOUNTS REPORT ────────────────────────────────────────

export async function getAdditionalDiscountsReport(params?: {
  dateFrom?: string;
  dateTo?: string;
}) {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("invoices")
      .select(`
        id,
        invoice_no,
        invoice_date,
        products,
        grand_total,
        additional_discount,
        shop:shops(shop_name, outlet_code)
      `)
      .order("invoice_date", { ascending: false });

    if (params?.dateFrom) query = query.gte("invoice_date", params.dateFrom);
    if (params?.dateTo)   query = query.lte("invoice_date", params.dateTo);

    const { data: allInvoices, error } = await query;
    if (error) {
      console.error("[getAdditionalDiscountsReport]", error.message);
      return [];
    }

    const dateMap = new Map<string, {
      date: string;
      sale: number;
      additional_discount: number;
      invoices: any[];
    }>();

    (allInvoices || []).forEach((inv: any) => {
      const d = inv.invoice_date;
      if (!d) return;
      if (!dateMap.has(d)) {
        dateMap.set(d, {
          date: d,
          sale: 0,
          additional_discount: 0,
          invoices: [],
        });
      }
      const entry = dateMap.get(d)!;
      entry.sale += Number(inv.grand_total || 0);
      const addDisc = Number(inv.additional_discount || 0);
      if (addDisc > 0) {
        entry.additional_discount += addDisc;
        entry.invoices.push({
          id: inv.id,
          invoice_no: inv.invoice_no,
          shop_name: inv.shop?.shop_name || "—",
          outlet_code: inv.shop?.outlet_code || "—",
          products: inv.products || "—",
          grand_total: Number(inv.grand_total || 0),
          additional_discount: addDisc,
        });
      }
    });

    const result = Array.from(dateMap.values())
      .filter((entry) => entry.additional_discount > 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    return result;
  } catch (err: any) {
    console.error("[getAdditionalDiscountsReport] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function getSaleEntriesForLedger(saleNo: string) {
  try {
    const supabase = await createClient();
    const tenantId = await getTenantId();
    if (!tenantId) return [];

    const { data, error } = await supabase
      .from("sale_entry_lines")
      .select(`
        qty, sale_rate, amount,
        product:products(product_name),
        sale_entry:sale_entries!inner(tenant_id, sale_no)
      `)
      .eq("sale_entry.tenant_id", tenantId)
      .eq("sale_entry.sale_no", saleNo);

    if (error) { console.error("[getSaleEntriesForLedger]", error.message); return []; }

    return (data || []).map((l: any) => ({
      product_name: l.product?.product_name ?? "—",
      sale_rate: Number(l.sale_rate || 0),
      qty: Number(l.qty || 0),
      amount: Number(l.amount || 0),
    }));
  } catch (err: any) {
    console.error("[getSaleEntriesForLedger] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function getDateWiseSalesSummary(params?: {
  from?: string;
  to?: string;
}) {
  try {
    const supabase = await createClient();
    const tenantId = await getTenantId();
    if (!tenantId) return [];

    let query = supabase
      .from("invoices")
      .select(`
        id,
        invoice_no,
        record_date,
        invoice_date,
        amount,
        invoice_total,
        invoice_type,
        outlet_type,
        shop:shops(id, shop_name, outlet_code, shop_type, outlet_type)
      `)
      .eq("tenant_id", tenantId);

    if (params?.from) {
      query = query.gte("record_date", params.from);
    }
    if (params?.to) {
      query = query.lte("record_date", params.to);
    }

    query = query.order("record_date", { ascending: false, nullsFirst: false });

    const PAGE_SIZE = 1000;
    let allInvoices: any[] = [];
    let fromIndex = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await query.range(fromIndex, fromIndex + PAGE_SIZE - 1);
      if (error) {
        console.error("[getDateWiseSalesSummary] error:", error.message);
        break;
      }
      if (data && data.length > 0) {
        allInvoices.push(...data);
        if (data.length < PAGE_SIZE) hasMore = false;
        else fromIndex += PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    const dateMap = new Map<string, { date: string; sales: number; cash: number; credit: number }>();

    for (const inv of allInvoices) {
      const dateStr = (inv.record_date || inv.invoice_date || "").split("T")[0];
      if (!dateStr) continue;

      const amt = Number(inv.amount ?? inv.invoice_total ?? 0);

      const invType = (inv.invoice_type || "").toLowerCase();
      const outType = (inv.outlet_type || "").toLowerCase();
      const shopType = (inv.shop?.shop_type || "").toLowerCase();
      const shopOutType = (inv.shop?.outlet_type || "").toLowerCase();

      const isCredit =
        invType === "credit" ||
        outType === "credit" ||
        shopType === "credit" ||
        shopOutType === "credit";

      const existing = dateMap.get(dateStr);
      if (existing) {
        existing.sales += amt;
        if (isCredit) {
          existing.credit += amt;
        } else {
          existing.cash += amt;
        }
      } else {
        dateMap.set(dateStr, {
          date: dateStr,
          sales: amt,
          cash: isCredit ? 0 : amt,
          credit: isCredit ? amt : 0,
        });
      }
    }

    return Array.from(dateMap.values()).sort((a, b) => b.date.localeCompare(a.date));
  } catch (err: any) {
    console.error("[getDateWiseSalesSummary] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function getShopWiseSalesSummary(params: {
  shopId: string;
  from?: string;
  to?: string;
}) {
  try {
    const supabase = await createClient();
    const tenantId = await getTenantId();
    if (!tenantId || !params.shopId) return [];

    const { data: shop } = await supabase
      .from("shops")
      .select("id, shop_name, outlet_code, shop_type, outlet_type")
      .eq("id", params.shopId)
      .maybeSingle();

    if (!shop) return [];

    const isShopCredit =
      (shop.shop_type || "").toLowerCase() === "credit" ||
      (shop.outlet_type || "").toLowerCase() === "credit";

    let query = supabase
      .from("invoices")
      .select(`
        id,
        invoice_no,
        record_date,
        invoice_date,
        amount,
        invoice_total,
        invoice_type,
        outlet_type,
        payment_status,
        amount_received,
        shop_id,
        outlet_code
      `)
      .eq("tenant_id", tenantId);

    if (shop.outlet_code) {
      query = query.or(`shop_id.eq.${shop.id},outlet_code.eq.${shop.outlet_code}`);
    } else {
      query = query.eq("shop_id", shop.id);
    }

    if (params.from) {
      query = query.gte("record_date", params.from);
    }
    if (params.to) {
      query = query.lte("record_date", params.to);
    }

    query = query.order("record_date", { ascending: false, nullsFirst: false });

    const PAGE_SIZE = 1000;
    let allInvoices: any[] = [];
    let fromIndex = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await query.range(fromIndex, fromIndex + PAGE_SIZE - 1);
      if (error) {
        console.error("[getShopWiseSalesSummary] error:", error.message);
        break;
      }
      if (data && data.length > 0) {
        allInvoices.push(...data);
        if (data.length < PAGE_SIZE) hasMore = false;
        else fromIndex += PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    return allInvoices.map((inv) => {
      const invType = (inv.invoice_type || "").toLowerCase();
      const outType = (inv.outlet_type || "").toLowerCase();
      const isCredit =
        isShopCredit ||
        invType === "credit" ||
        outType === "credit";

      const saleAmount = Number(inv.amount ?? inv.invoice_total ?? 0);
      const paidAmt = Number(inv.amount_received || 0);
      const rawStatus = (inv.payment_status || "").toLowerCase();

      let status: "Paid" | "Partial" | "Unpaid" = "Unpaid";
      if (!isCredit) {
        status = "Paid";
      } else {
        if (rawStatus === "paid" || (saleAmount > 0 && paidAmt >= saleAmount - 0.01)) {
          status = "Paid";
        } else if (rawStatus === "partial" || paidAmt > 0.01) {
          status = "Partial";
        } else {
          status = "Unpaid";
        }
      }

      return {
        id: inv.id,
        invoice_no: inv.invoice_no || "—",
        date: (inv.record_date || inv.invoice_date || "").split("T")[0] || "—",
        sale: saleAmount,
        type: isCredit ? ("Credit" as const) : ("Cash" as const),
        status,
      };
    });
  } catch (err: any) {
    console.error("[getShopWiseSalesSummary] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function getCreditSummaryReport(params?: {
  from?: string;
  to?: string;
}) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return [];

    const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createAdminClient()
      : await createClient();

    const { data: shopsData, error: shopsErr } = await supabase
      .from("shops")
      .select("id, shop_name, outlet_code, shop_type, outlet_type")
      .eq("tenant_id", tenantId)
      .or("shop_type.eq.credit,outlet_type.ilike.credit")
      .order("shop_name");

    if (shopsErr || !shopsData || shopsData.length === 0) return [];

    const creditShops = shopsData;
    const creditShopIds = new Set(creditShops.map((s) => s.id));
    const creditOutletCodes = new Set(
      creditShops.map((s) => s.outlet_code).filter(Boolean)
    );
    const shopMap = new Map<string, any>(creditShops.map((s) => [s.id, s]));
    const shopByCode = new Map<string, any>(
      creditShops.map((s) => [s.outlet_code, s])
    );

    const PAGE_SIZE = 1000;
    let allInvoices: any[] = [];
    let fromIdx = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_no,
          record_date,
          invoice_date,
          amount,
          grand_total,
          invoice_total,
          invoice_type,
          outlet_type,
          amount_received,
          payment_status,
          shop_id,
          outlet_code
        `)
        .eq("tenant_id", tenantId)
        .range(fromIdx, fromIdx + PAGE_SIZE - 1);

      if (error) {
        console.error("[getCreditSummaryReport] invoices error:", error.message);
        break;
      }
      if (data && data.length > 0) {
        allInvoices.push(...data);
        if (data.length < PAGE_SIZE) hasMore = false;
        else fromIdx += PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    let allPayments: any[] = [];
    fromIdx = 0;
    hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("shop_payments")
        .select("id, shop_id, amount, payment_date")
        .eq("tenant_id", tenantId)
        .range(fromIdx, fromIdx + PAGE_SIZE - 1);

      if (error) {
        console.error("[getCreditSummaryReport] payments error:", error.message);
        break;
      }
      if (data && data.length > 0) {
        allPayments.push(...data);
        if (data.length < PAGE_SIZE) hasMore = false;
        else fromIdx += PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    const paymentTotals = new Map<string, number>();
    for (const p of allPayments) {
      if (p.shop_id) {
        paymentTotals.set(
          p.shop_id,
          (paymentTotals.get(p.shop_id) || 0) + Number(p.amount || 0)
        );
      }
    }

    const shopCreditSales = new Map<string, number>();
    const shopUnpaidInvoices = new Map<string, any[]>();

    for (const inv of allInvoices) {
      const invType = (inv.invoice_type || "").toLowerCase();
      const outType = (inv.outlet_type || "").toLowerCase();
      const isCredit =
        invType === "credit" ||
        outType === "credit" ||
        (inv.shop_id && creditShopIds.has(inv.shop_id)) ||
        (inv.outlet_code && creditOutletCodes.has(inv.outlet_code));

      if (!isCredit) continue;

      const shop =
        (inv.shop_id && shopMap.get(inv.shop_id)) ||
        (inv.outlet_code && shopByCode.get(inv.outlet_code));

      if (!shop) continue;

      const saleAmt = Number(inv.amount ?? inv.grand_total ?? inv.invoice_total ?? 0);
      const paidAmt = Number(inv.amount_received || 0);
      const remainingAmt = Math.max(0, saleAmt - paidAmt);

      shopCreditSales.set(
        shop.id,
        (shopCreditSales.get(shop.id) || 0) + saleAmt
      );

      const d = (inv.record_date || inv.invoice_date || "").split("T")[0];
      if (remainingAmt > 0.01) {
        if (params?.from && d < params.from) continue;
        if (params?.to && d > params.to) continue;

        let status: "Paid" | "Partial" | "Unpaid" = "Unpaid";
        if (paidAmt >= saleAmt - 0.01 && saleAmt > 0) {
          status = "Paid";
        } else if (paidAmt > 0.01) {
          status = "Partial";
        } else {
          status = "Unpaid";
        }

        if (!shopUnpaidInvoices.has(shop.id)) {
          shopUnpaidInvoices.set(shop.id, []);
        }
        shopUnpaidInvoices.get(shop.id)!.push({
          id: inv.id,
          invoice_no: inv.invoice_no || "—",
          date: d || "—",
          sale: saleAmt,
          paid: paidAmt,
          remaining: remainingAmt,
          status,
        });
      }
    }

    const result: any[] = [];
    for (const shop of creditShops) {
      const totalSales = shopCreditSales.get(shop.id) || 0;
      const totalPaid = paymentTotals.get(shop.id) || 0;
      const balance = Math.max(0, totalSales - totalPaid);

      if (balance <= 0.01) continue;

      const invoices = shopUnpaidInvoices.get(shop.id) || [];
      if (invoices.length === 0) continue;

      invoices.sort((a, b) => b.date.localeCompare(a.date));

      result.push({
        shop_id: shop.id,
        shop_name: shop.shop_name,
        outlet_code: shop.outlet_code || "",
        balance,
        invoices,
      });
    }

    result.sort((a, b) => a.shop_name.localeCompare(b.shop_name));
    return result;
  } catch (err: any) {
    console.error("[getCreditSummaryReport] unexpected:", err?.message ?? err);
    return [];
  }
}



