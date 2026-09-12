"use server";

import { createClient, getTenantId } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";


function revalidateAll() {
  revalidatePath("/prerequisites/discounts");
  revalidatePath("/reports/financial");
  revalidatePath("/income/statement");
  revalidatePath("/expenses/sheet");
}

export interface DiscountProductInput {
  product_id: string;
  sale_rate: number;
  discounted_rate: number;
  qty: number;
}

export interface DiscountConfigInput {
  shop_id: string;
  from_date: string;
  to_date: string;
  given_by_type: "owner" | "preseller";
  preseller_id?: string | null;
  products: DiscountProductInput[];
}

export async function getDiscountConfigs() {
  try {
    const supabase = await createClient();
    const tenantId = await getTenantId();
    if (!tenantId) return [];

    const [configsRes, configProductsRes, shopsRes, productsRes, employeesRes] = await Promise.all([
      supabase.from("discount_configs").select("*, shop:shops(id, outlet_code, shop_name)").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      supabase.from("discount_config_products").select("*").eq("tenant_id", tenantId),
      supabase.from("shops").select("id, outlet_code, shop_name"),
      supabase.from("products").select("id, product_name, product_code, sale_rate"),
      supabase.from("employees").select("id, full_name, employee_code"),
    ]);

    const rawConfigs = configsRes.data || [];
    const rawConfigProducts = configProductsRes.data || [];
    const shops = shopsRes.data || [];
    const products = productsRes.data || [];
    const employees = employeesRes.data || [];

    const shopMap = new Map(shops.map((s) => [s.id, s]));
    const productMap = new Map(products.map((p) => [p.id, p]));
    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    return rawConfigs.map((cfg) => ({
      ...cfg,
      shop: cfg.shop || shopMap.get(cfg.shop_id) || { id: cfg.shop_id, outlet_code: "", shop_name: "Shop" },
      preseller: cfg.preseller_id ? employeeMap.get(cfg.preseller_id) : null,
      discount_config_products: rawConfigProducts
        .filter((cp) => cp.discount_config_id === cfg.id)
        .map((cp) => ({
          ...cp,
          product: productMap.get(cp.product_id) || { id: cp.product_id, product_name: "", product_code: "" },
        })),
    }));
  } catch (err: any) {
    console.error("[getDiscountConfigs] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function createDiscountConfig(input: DiscountConfigInput) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Tenant not found");

  const { data: config, error: configErr } = await supabase
    .from("discount_configs")
    .insert({
      tenant_id: tenantId,
      shop_id: input.shop_id,
      from_date: input.from_date,
      to_date: input.to_date,
      given_by_type: input.given_by_type,
      preseller_id: input.preseller_id || null,
    })
    .select()
    .single();

  if (configErr) throw new Error(configErr.message);

  const productRows = input.products.map((p) => ({
    discount_config_id: config.id,
    tenant_id: tenantId,
    product_id: p.product_id,
    sale_rate: p.sale_rate,
    discounted_rate: p.discounted_rate,
    qty: p.qty,
  }));

  const { error: prodErr } = await supabase
    .from("discount_config_products")
    .insert(productRows);

  if (prodErr) throw new Error(prodErr.message);

  revalidateAll();
  return config;
}

export async function updateDiscountConfig(id: string, input: DiscountConfigInput) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Tenant not found");

  const { error: configErr } = await supabase
    .from("discount_configs")
    .update({
      shop_id: input.shop_id,
      from_date: input.from_date,
      to_date: input.to_date,
      given_by_type: input.given_by_type,
      preseller_id: input.preseller_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (configErr) throw new Error(configErr.message);

  const { error: delErr } = await supabase
    .from("discount_config_products")
    .delete()
    .eq("discount_config_id", id);

  if (delErr) throw new Error(delErr.message);

  const productRows = input.products.map((p) => ({
    discount_config_id: id,
    tenant_id: tenantId,
    product_id: p.product_id,
    sale_rate: p.sale_rate,
    discounted_rate: p.discounted_rate,
    qty: p.qty,
  }));

  const { error: prodErr } = await supabase
    .from("discount_config_products")
    .insert(productRows);

  if (prodErr) throw new Error(prodErr.message);

  revalidateAll();
}

export async function deleteDiscountConfig(id: string) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Tenant not found");

  const { error } = await supabase
    .from("discount_configs")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function getDiscountConfigsForShop(shopId: string, date?: string) {
  try {
    const supabase = await createClient();
    const tenantId = await getTenantId();
    if (!tenantId) return [];

    const [configsRes, configProductsRes, productsRes, employeesRes] = await Promise.all([
      supabase.from("discount_configs").select("*").eq("tenant_id", tenantId).eq("shop_id", shopId),
      supabase.from("discount_config_products").select("*").eq("tenant_id", tenantId),
      supabase.from("products").select("id, product_name"),
      supabase.from("employees").select("id, full_name"),
    ]);

    const rawConfigs = configsRes.data || [];
    const rawConfigProducts = configProductsRes.data || [];
    const products = productsRes.data || [];
    const employees = employeesRes.data || [];

    const productMap = new Map(products.map((p) => [p.id, p]));
    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    return rawConfigs
      .filter((cfg) => {
        if (!date) return true;
        const from = (cfg.from_date || "").split("T")[0];
        const to = (cfg.to_date || "").split("T")[0];
        return date >= from && date <= to;
      })
      .map((cfg) => ({
        ...cfg,
        preseller: cfg.preseller_id ? employeeMap.get(cfg.preseller_id) : null,
        discount_config_products: rawConfigProducts
          .filter((cp) => cp.discount_config_id === cfg.id)
          .map((cp) => ({
            ...cp,
            product: productMap.get(cp.product_id) || { id: cp.product_id, product_name: "" },
          })),
      }));
  } catch (err: any) {
    console.error("[getDiscountConfigsForShop] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function getDiscountReportData(params?: {
  from?: string;
  to?: string;
  givenByType?: "owner" | "preseller";
  presellerId?: string;
}) {
  try {
    const supabase = await createClient();
    const tenantId = await getTenantId();
    if (!tenantId) return [];

    const [configsRes, configProductsRes, shopsRes, productsRes, employeesRes, invoicesRes] = await Promise.all([
      supabase.from("discount_configs").select("*, shop:shops(id, outlet_code, shop_name)").eq("tenant_id", tenantId),
      supabase.from("discount_config_products").select("*").eq("tenant_id", tenantId),
      supabase.from("shops").select("id, outlet_code, shop_name"),
      supabase.from("products").select("id, product_name, product_code, sale_rate"),
      supabase.from("employees").select("id, full_name, employee_code"),
      supabase.from("invoices").select("id, invoice_no, record_date, invoice_date, scheduled_date, created_at, shop_id, outlet_name, outlet_code, preseller_id, shop:shops(id, outlet_code, shop_name)"),
    ]);

    const rawConfigs = configsRes.data || [];
    const rawConfigProducts = configProductsRes.data || [];
    const shops = shopsRes.data || [];
    const products = productsRes.data || [];
    const employees = employeesRes.data || [];
    const invoices = invoicesRes.data || [];

    const shopMap = new Map(shops.map((s) => [s.id, s]));
    const productMap = new Map(products.map((p) => [p.id, p]));
    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    const configsWithProducts = rawConfigs.map((cfg) => {
      const prods = rawConfigProducts
        .filter((cp) => cp.discount_config_id === cfg.id)
        .map((cp) => ({
          ...cp,
          product: productMap.get(cp.product_id) || { product_name: "Product" },
        }));
      return {
        ...cfg,
        shop: cfg.shop || shopMap.get(cfg.shop_id) || { shop_name: "Shop", outlet_code: "" },
        preseller: cfg.preseller_id ? employeeMap.get(cfg.preseller_id) : null,
        discount_config_products: prods,
      };
    });

    const configs = configsWithProducts.filter((cfg) => {
      if (params?.givenByType && cfg.given_by_type !== params.givenByType) return false;
      if (params?.givenByType === "preseller" && params?.presellerId && cfg.preseller_id !== params.presellerId) return false;
      return true;
    });

    if (configs.length === 0) return [];

    const rowsByDate = new Map<string, {
      date: string;
      shops: {
        shopName: string;
        invoiceNo: string;
        products: string;
        discount: number;
        givenBy: string;
      }[];
      totalDiscount: number;
    }>();

    for (const invoice of invoices) {
      const invDate = (
        (invoice.record_date && invoice.record_date.split("T")[0]) ||
        (invoice.scheduled_date && invoice.scheduled_date.split("T")[0]) ||
        (invoice.invoice_date && invoice.invoice_date.split("T")[0]) ||
        (invoice.created_at && invoice.created_at.split("T")[0]) ||
        ""
      ).trim();

      if (!invDate) continue;

      const filterFrom = params?.from ? params.from.split("T")[0].trim() : "";
      const filterTo = params?.to ? params.to.split("T")[0].trim() : "";

      if (filterFrom && invDate < filterFrom) continue;
      if (filterTo && invDate > filterTo) continue;

      const matchingConfigs = configs.filter((cfg) => {
        if (cfg.shop_id !== invoice.shop_id) return false;
        const cfgFrom = (cfg.from_date || "").split("T")[0].trim();
        const cfgTo = (cfg.to_date || "").split("T")[0].trim();
        if (invDate < cfgFrom || invDate > cfgTo) return false;
        return true;
      });

      if (matchingConfigs.length === 0) continue;

      for (const cfg of matchingConfigs) {
        let invoiceDiscount = 0;
        const productParts: string[] = [];

        for (const dp of cfg.discount_config_products) {
          const qty = Number(dp.qty) || 0;

          if (qty > 0) {
            const discPerUnit = Number(dp.sale_rate) - Number(dp.discounted_rate);
            const lineDisc = discPerUnit * qty;
            invoiceDiscount += lineDisc;
            const pName = dp.product?.product_name || "Product";
            productParts.push(`${pName}+${dp.discounted_rate}-${dp.sale_rate}×${qty}`);
          }
        }

        if (invoiceDiscount <= 0) continue;

        const shopName =
          (cfg.shop?.shop_name && cfg.shop.shop_name !== "Shop" ? cfg.shop.shop_name : "") ||
          invoice.outlet_name ||
          (Array.isArray(invoice.shop) ? invoice.shop[0]?.shop_name : (invoice.shop as any)?.shop_name) ||
          cfg.shop?.shop_name ||
          "Unknown Shop";
        const invoiceNo = invoice.invoice_no || "—";
        const givenByLabel =
          cfg.given_by_type === "preseller" && cfg.preseller?.full_name
            ? `Preseller (${cfg.preseller.full_name})`
            : "Owner";

        const shopRow = {
          shopName,
          invoiceNo,
          products: productParts.join(", "),
          discount: invoiceDiscount,
          givenBy: givenByLabel,
        };

        const existing = rowsByDate.get(invDate);
        if (existing) {
          existing.shops.push(shopRow);
          existing.totalDiscount += invoiceDiscount;
        } else {
          rowsByDate.set(invDate, {
            date: invDate,
            shops: [shopRow],
            totalDiscount: invoiceDiscount,
          });
        }
      }
    }

    return Array.from(rowsByDate.values()).sort((a, b) => b.date.localeCompare(a.date));
  } catch (err: any) {
    console.error("[getDiscountReportData] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function getMonthlyAdditionalDiscountsTotal(from?: string, to?: string): Promise<number> {
  const data = await getDiscountReportData({ from, to });
  return (data || []).reduce((acc, row) => acc + (Number(row.totalDiscount) || 0), 0);
}

export async function getShopInvoicesWithDiscounts(shopId: string) {
  try {
    const supabase = await createClient();
    const tenantId = await getTenantId();
    if (!tenantId) return [];

    const [configsRes, configProductsRes, productsRes, employeesRes, invoicesRes] = await Promise.all([
      supabase.from("discount_configs").select("*").eq("tenant_id", tenantId).eq("shop_id", shopId),
      supabase.from("discount_config_products").select("*").eq("tenant_id", tenantId),
      supabase.from("products").select("id, product_name, product_code, sale_rate"),
      supabase.from("employees").select("id, full_name, employee_code"),
      supabase.from("invoices").select("*").eq("shop_id", shopId).order("record_date", { ascending: false, nullsFirst: false }),
    ]);

    const rawConfigs = configsRes.data || [];
    const rawConfigProducts = configProductsRes.data || [];
    const products = productsRes.data || [];
    const employees = employeesRes.data || [];
    const invoices = invoicesRes.data || [];

    const productMap = new Map(products.map((p) => [p.id, p]));
    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    const configs = rawConfigs.map((cfg) => ({
      ...cfg,
      preseller: cfg.preseller_id ? employeeMap.get(cfg.preseller_id) : null,
      discount_config_products: rawConfigProducts
        .filter((cp) => cp.discount_config_id === cfg.id)
        .map((cp) => ({
          ...cp,
          product: productMap.get(cp.product_id) || { product_name: "Product" },
        })),
    }));

    return invoices.map((inv) => {
      const invDate = (
        (inv.record_date && inv.record_date.split("T")[0]) ||
        (inv.scheduled_date && inv.scheduled_date.split("T")[0]) ||
        (inv.invoice_date && inv.invoice_date.split("T")[0]) ||
        (inv.created_at && inv.created_at.split("T")[0]) ||
        ""
      ).trim();

      const activeConfigs = configs.filter((cfg) => {
        const cfgFrom = (cfg.from_date || "").split("T")[0].trim();
        const cfgTo = (cfg.to_date || "").split("T")[0].trim();
        return invDate >= cfgFrom && invDate <= cfgTo;
      });

      const allProductNames: string[] = [];
      let totalDiscount = 0;
      let givenBy: string | null = null;

      for (const cfg of activeConfigs) {
        for (const dp of cfg.discount_config_products) {
          const qty = Number(dp.qty) || 0;
          if (qty > 0) {
            const disc = (Number(dp.sale_rate) - Number(dp.discounted_rate)) * qty;
            totalDiscount += disc;
            const pName = dp.product?.product_name || "Product";
            allProductNames.push(`${pName}+${dp.discounted_rate}-${dp.sale_rate}×${qty}`);
          }
        }

        if (!givenBy) {
          if (cfg.given_by_type === "preseller" && cfg.preseller?.full_name) {
            givenBy = `Preseller (${cfg.preseller.full_name})`;
          } else {
            givenBy = "Owner";
          }
        }
      }

      return {
        ...inv,
        calculated_discount: totalDiscount,
        formatted_products: allProductNames.join(", ") || inv.products || "",
        given_by: givenBy || (inv.preseller_id && employeeMap.get(inv.preseller_id)?.full_name ? `Preseller (${employeeMap.get(inv.preseller_id)?.full_name})` : "Owner"),
      };
    });
  } catch (err: any) {
    console.error("[getShopInvoicesWithDiscounts] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function getAdditionalDiscountSummary(params?: { from?: string; to?: string }) {
  try {
    const supabase = await createClient();
    const tenantId = await getTenantId();
    if (!tenantId) return [];

    const [configsRes, configProductsRes, shopsRes, productsRes, employeesRes, invoicesRes] = await Promise.all([
      supabase.from("discount_configs").select("*, shop:shops(id, outlet_code, shop_name)").eq("tenant_id", tenantId),
      supabase.from("discount_config_products").select("*").eq("tenant_id", tenantId),
      supabase.from("shops").select("id, shop_name"),
      supabase.from("products").select("id, product_name"),
      supabase.from("employees").select("id, full_name"),
      supabase.from("invoices").select("id, invoice_no, record_date, invoice_date, scheduled_date, created_at, shop_id, amount, grand_total, outlet_name, outlet_code, shop:shops(id, outlet_code, shop_name)").eq("tenant_id", tenantId),
    ]);

    const rawConfigs = configsRes.data || [];
    const rawConfigProducts = configProductsRes.data || [];
    const shops = shopsRes.data || [];
    const products = productsRes.data || [];
    const employees = employeesRes.data || [];
    const invoices = invoicesRes.data || [];

    const shopMap = new Map(shops.map((s) => [s.id, s]));
    const productMap = new Map(products.map((p) => [p.id, p]));
    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    const filterFrom = params?.from ? params.from.split("T")[0].trim() : "";
    const filterTo = params?.to ? params.to.split("T")[0].trim() : "";

    const configsWithProducts = rawConfigs.map((cfg) => ({
      ...cfg,
      shop: cfg.shop || shopMap.get(cfg.shop_id) || { shop_name: "Unknown" },
      preseller: cfg.preseller_id ? employeeMap.get(cfg.preseller_id) : null,
      discount_config_products: rawConfigProducts
        .filter((cp) => cp.discount_config_id === cfg.id)
        .map((cp) => ({ ...cp, product: productMap.get(cp.product_id) || { product_name: "Product" } })),
    }));

    const shopSummaryMap = new Map<string, {
      shopId: string; shopName: string; givenBy: string;
      invoiceCount: number; salesTotal: number; discountTotal: number;
    }>();

    for (const invoice of invoices) {
      const invDate = (
        (invoice.record_date && invoice.record_date.split("T")[0]) ||
        (invoice.scheduled_date && invoice.scheduled_date.split("T")[0]) ||
        (invoice.invoice_date && invoice.invoice_date.split("T")[0]) ||
        (invoice.created_at && invoice.created_at.split("T")[0]) || ""
      ).trim();
      if (!invDate) continue;
      if (filterFrom && invDate < filterFrom) continue;
      if (filterTo && invDate > filterTo) continue;

      const matchingConfigs = configsWithProducts.filter((cfg) => {
        if (cfg.shop_id !== invoice.shop_id) return false;
        const cfgFrom = (cfg.from_date || "").split("T")[0].trim();
        const cfgTo = (cfg.to_date || "").split("T")[0].trim();
        return invDate >= cfgFrom && invDate <= cfgTo;
      });
      if (matchingConfigs.length === 0) continue;

      let invDiscount = 0;
      let givenByLabel = "Owner";

      for (const cfg of matchingConfigs) {
        for (const dp of cfg.discount_config_products) {
          const qty = Number(dp.qty) || 0;
          if (qty > 0) invDiscount += (Number(dp.sale_rate) - Number(dp.discounted_rate)) * qty;
        }
        if (cfg.given_by_type === "preseller" && cfg.preseller?.full_name) {
          givenByLabel = `Preseller (${cfg.preseller.full_name})`;
        }
      }

      if (invDiscount <= 0) continue;

      const shopId = invoice.shop_id;
      const shopName =
        (matchingConfigs[0]?.shop?.shop_name && matchingConfigs[0].shop.shop_name !== "Unknown" ? matchingConfigs[0].shop.shop_name : "") ||
        invoice.outlet_name ||
        (Array.isArray(invoice.shop) ? invoice.shop[0]?.shop_name : (invoice.shop as any)?.shop_name) ||
        shopMap.get(shopId)?.shop_name ||
        "Unknown";
      const existing = shopSummaryMap.get(shopId);
      if (existing) {
        existing.invoiceCount += 1;
        existing.salesTotal += Number(invoice.amount ?? invoice.grand_total ?? 0);
        existing.discountTotal += invDiscount;
      } else {
        shopSummaryMap.set(shopId, {
          shopId, shopName, givenBy: givenByLabel,
          invoiceCount: 1,
          salesTotal: Number(invoice.amount ?? invoice.grand_total ?? 0),
          discountTotal: invDiscount,
        });
      }
    }

    return Array.from(shopSummaryMap.values()).sort((a, b) => a.shopName.localeCompare(b.shopName));
  } catch (err: any) {
    console.error("[getAdditionalDiscountSummary] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function getAdditionalDiscountShopSummary(shopId: string, params?: { from?: string; to?: string }) {
  try {
    const supabase = await createClient();
    const tenantId = await getTenantId();
    if (!tenantId) return [];

    const [configsRes, configProductsRes, productsRes, employeesRes, invoicesRes] = await Promise.all([
      supabase.from("discount_configs").select("*, shop:shops(id, outlet_code, shop_name)").eq("tenant_id", tenantId).eq("shop_id", shopId),
      supabase.from("discount_config_products").select("*").eq("tenant_id", tenantId),
      supabase.from("products").select("id, product_name"),
      supabase.from("employees").select("id, full_name"),
      supabase.from("invoices").select("id, invoice_no, record_date, invoice_date, scheduled_date, created_at, amount, grand_total, products, outlet_name, outlet_code, shop:shops(id, outlet_code, shop_name)").eq("tenant_id", tenantId).eq("shop_id", shopId).order("record_date", { ascending: false, nullsFirst: false }),
    ]);

    const rawConfigs = configsRes.data || [];
    const rawConfigProducts = configProductsRes.data || [];
    const products = productsRes.data || [];
    const employees = employeesRes.data || [];
    const invoices = invoicesRes.data || [];

    const productMap = new Map(products.map((p) => [p.id, p]));
    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    const filterFrom = params?.from ? params.from.split("T")[0].trim() : "";
    const filterTo = params?.to ? params.to.split("T")[0].trim() : "";

    const configs = rawConfigs.map((cfg) => ({
      ...cfg,
      preseller: cfg.preseller_id ? employeeMap.get(cfg.preseller_id) : null,
      discount_config_products: rawConfigProducts
        .filter((cp) => cp.discount_config_id === cfg.id)
        .map((cp) => ({ ...cp, product: productMap.get(cp.product_id) || { product_name: "Product" } })),
    }));

    const rows: { date: string; invoiceNo: string; grandTotal: number; products: string; givenBy: string; discount: number }[] = [];

    for (const inv of invoices) {
      const invDate = (
        (inv.record_date && inv.record_date.split("T")[0]) ||
        (inv.scheduled_date && inv.scheduled_date.split("T")[0]) ||
        (inv.invoice_date && inv.invoice_date.split("T")[0]) ||
        (inv.created_at && inv.created_at.split("T")[0]) || ""
      ).trim();
      if (!invDate) continue;
      if (filterFrom && invDate < filterFrom) continue;
      if (filterTo && invDate > filterTo) continue;

      const activeConfigs = configs.filter((cfg) => {
        const cfgFrom = (cfg.from_date || "").split("T")[0].trim();
        const cfgTo = (cfg.to_date || "").split("T")[0].trim();
        return invDate >= cfgFrom && invDate <= cfgTo;
      });

      const productParts: string[] = [];
      let invDiscount = 0;
      let givenBy = "";

      for (const cfg of activeConfigs) {
        for (const dp of cfg.discount_config_products) {
          const qty = Number(dp.qty) || 0;
          if (qty > 0) {
            const disc = (Number(dp.sale_rate) - Number(dp.discounted_rate)) * qty;
            invDiscount += disc;
            productParts.push(`${dp.product?.product_name || "Product"}+${dp.discounted_rate}-${dp.sale_rate}×${qty}`);
          }
        }
        if (invDiscount > 0 && !givenBy) {
          if (cfg.given_by_type === "preseller" && cfg.preseller?.full_name) {
            givenBy = `Preseller (${cfg.preseller.full_name})`;
          } else {
            givenBy = "Owner";
          }
        }
      }

      rows.push({
        date: invDate,
        invoiceNo: inv.invoice_no || "—",
        grandTotal: Number(inv.amount ?? inv.grand_total ?? 0),
        products: productParts.join(", "),
        givenBy: invDiscount > 0 ? givenBy : "",
        discount: invDiscount,
      });
    }

    return rows;
  } catch (err: any) {
    console.error("[getAdditionalDiscountShopSummary] unexpected:", err?.message ?? err);
    return [];
  }
}
