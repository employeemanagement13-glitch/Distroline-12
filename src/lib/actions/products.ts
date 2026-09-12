"use server";

import { createClient, getTenantId } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const REVALIDATE_PATHS = [
  "/prerequisites/products",
  "/inventory/stock-reports",
  "/inventory/sell-in",
];

function revalidateAll() {
  REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
}

// Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬ TYPES Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬

export type ProductCategory = {
  id: string;
  title: string;
  is_returnable: boolean;
  is_rgb: boolean;
  active: boolean;
  sort_order: number;
  set_un_case: number;
  packing_qty?: number;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: string;
  product_name: string;
  product_code: string | null;
  category_id: string | null;
  sale_rate: number;
  purchase_rate: number;
  packing_qty: number;
  is_returnable: boolean;
  active: boolean;
  created_at: string;
};

export type ProductWithCategory = Product & {
  product_categories: ProductCategory | null;
};

export type GroupedCategoryProducts = {
  category: ProductCategory;
  products: Product[];
};

// Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬ CATEGORY ACTIONS Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬

export async function getProductCategories(): Promise<ProductCategory[]> {
  try {
    const supabase = await createClient();
    const tenantId = await getTenantId();
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from("product_categories")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("sort_order")
      .order("title");

    if (error) {
      console.error("[getProductCategories]", error.message);
      return [];
    }
    return data || [];
  } catch (err: any) {
    console.error("[getProductCategories] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function createProductCategory(formData: {
  title: string;
  is_returnable: boolean;
  is_rgb: boolean;
  sort_order?: number;
  set_un_case?: number;
  packing_qty?: number;
}) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized");

  let insertData: any = { ...formData, tenant_id: tenantId };
  let { data, error } = await supabase
    .from("product_categories")
    .insert(insertData)
    .select()
    .single();

  if (error && error.message?.includes("packing_qty")) {
    delete insertData.packing_qty;
    const retry = await supabase
      .from("product_categories")
      .insert(insertData)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) throw new Error(error.message);
  revalidateAll();
  return data as ProductCategory;
}

export async function updateProductCategory(
  id: string,
  formData: Partial<{
    title: string;
    is_returnable: boolean;
    is_rgb: boolean;
    active: boolean;
    sort_order: number;
    set_un_case: number;
    packing_qty: number;
  }>
) {
  const supabase = await createClient();

  // If packing_qty is set for category, update all products belonging to this category
  if (formData.packing_qty !== undefined && Number(formData.packing_qty) > 0) {
    await supabase
      .from("products")
      .update({ packing_qty: Number(formData.packing_qty) })
      .eq("category_id", id);
  }

  let updateData: any = { ...formData };
  let { data, error } = await supabase
    .from("product_categories")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error && error.message?.includes("packing_qty")) {
    delete updateData.packing_qty;
    const retry = await supabase
      .from("product_categories")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) throw new Error(error.message);
  revalidateAll();
  return data as ProductCategory;
}

export async function deleteProductCategory(id: string) {
  const supabase = await createClient();

  // Unlink any products assigned to this category
  await supabase
    .from("products")
    .update({ category_id: null })
    .eq("category_id", id);

  const { error } = await supabase
    .from("product_categories")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidateAll();
}

// Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬ PRODUCT ACTIONS Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬Ãƒ¢"Ã¢"š¬

export async function getProducts(): Promise<Product[]> {
  try {
    const supabase = await createClient();
    const tenantId = await getTenantId();
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("product_name");

    if (error) {
      console.error("[getProducts]", error.message);
      return [];
    }
    return (data || []) as Product[];
  } catch (err: any) {
    console.error("[getProducts] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function getProductsGroupedByCategory(): Promise<{
  grouped: GroupedCategoryProducts[];
  uncategorised: Product[];
}> {
  try {
    const categories = await getProductCategories();
    const products = await getProducts();

    const categoryMap = new Map<string, GroupedCategoryProducts>();
    categories.forEach((cat) => {
      categoryMap.set(cat.id, { category: cat, products: [] });
    });

    const uncategorised: Product[] = [];

    products.forEach((prod) => {
      if (prod.category_id && categoryMap.has(prod.category_id)) {
        categoryMap.get(prod.category_id)!.products.push(prod);
      } else {
        uncategorised.push(prod);
      }
    });

    return {
      grouped: Array.from(categoryMap.values()),
      uncategorised,
    };
  } catch (err: any) {
    console.error("[getProductsGroupedByCategory] unexpected:", err?.message ?? err);
    return { grouped: [], uncategorised: [] };
  }
}

export async function createProduct(
  formData: Omit<Product, "id" | "created_at" | "updated_at" | "tenant_id" | "product_code"> & {
    product_code?: string;
  }
) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized");

  const normalizeText = (value: string, fallback: string, maxLength: number) => {
    const normalized = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    return normalized.length > 0 ? normalized.substring(0, maxLength) : fallback;
  };

  let code = formData.product_code;
  let baseCode = code ?? "";

  if (!baseCode) {
    let categoryTitle = "";
    if (formData.category_id) {
      const { data: cat } = await supabase
        .from("product_categories")
        .select("title")
        .eq("id", formData.category_id)
        .maybeSingle();
      categoryTitle = cat?.title ?? "";
    }

    const categoryPart = normalizeText(categoryTitle, "GEN", 10);
    const productPart = normalizeText(formData.product_name, "PRODUCT", 15);
    baseCode = `${categoryPart}-${productPart}`;
  }

  const { data: existingCodes, error: fetchError } = await supabase
    .from("products")
    .select("product_code")
    .eq("tenant_id", tenantId)
    .like("product_code", `${baseCode}%`);

  if (fetchError) throw new Error(fetchError.message);

  const takenCodes = new Set((existingCodes || []).map((row: any) => row.product_code).filter(Boolean));
  code = baseCode;
  let suffix = 2;
  while (takenCodes.has(code)) {
    code = `${baseCode}-${suffix}`;
    suffix += 1;
  }

  const { data, error } = await supabase
    .from("products")
    .insert({
      ...formData,
      product_code: code,
      tenant_id: tenantId,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidateAll();
  return data as Product;
}

export async function updateProduct(
  id: string,
  formData: Partial<{
    product_name: string;
    product_code: string;
    category_id: string | null;
    sale_rate: number;
    purchase_rate: number;
    packing_qty: number;
    is_returnable: boolean;
    active: boolean;
  }>
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update(formData)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidateAll();
  return data as Product;
}

export async function deleteProduct(id: string) {
  const supabase = await createClient();

  await supabase.from("stock_movements").delete().eq("product_id", id);
  await supabase.from("sell_in_return_entries").delete().eq("product_id", id);
  await supabase.from("sell_in_arrived_lines").delete().eq("product_id", id);
  await supabase.from("sell_in_lines").delete().eq("product_id", id);
  await supabase.from("invoice_line_items").delete().eq("product_id", id);
  await supabase.from("invoice_returns").delete().eq("product_id", id);
  await supabase.from("stock_discrepancies").delete().eq("product_id", id);
  await supabase.from("damaged_stock").delete().eq("product_id", id);
  await supabase.from("empties_log").delete().eq("product_id", id);
  await supabase.from("warehouse_stock").delete().eq("product_id", id);
  await supabase.from("returns_wayback").delete().eq("product_id", id);

  const { error } = await supabase.from("products").delete().eq("id", id);

  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteProducts(ids: string[]) {
  if (!ids.length) return;
  const supabase = await createClient();
  const BATCH_SIZE = 200;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    await supabase.from("stock_movements").delete().in("product_id", chunk);
    await supabase.from("sell_in_return_entries").delete().in("product_id", chunk);
    await supabase.from("sell_in_arrived_lines").delete().in("product_id", chunk);
    await supabase.from("sell_in_lines").delete().in("product_id", chunk);
    await supabase.from("invoice_line_items").delete().in("product_id", chunk);
    await supabase.from("invoice_returns").delete().in("product_id", chunk);
    await supabase.from("stock_discrepancies").delete().in("product_id", chunk);
    await supabase.from("damaged_stock").delete().in("product_id", chunk);
    await supabase.from("empties_log").delete().in("product_id", chunk);
    await supabase.from("warehouse_stock").delete().in("product_id", chunk);
    await supabase.from("returns_wayback").delete().in("product_id", chunk);
    const { error } = await supabase.from("products").delete().in("id", chunk);
    if (error) throw new Error(error.message);
  }
  revalidateAll();
}

export interface ProductImportItem {
  product_code?: string;
  product_name: string;
  category_title?: string;
  sale_rate?: number;
  purchase_rate?: number;
  packing_qty?: number;
  active?: boolean;
  is_returnable?: boolean;
  is_rgb?: boolean;
  un_case?: number;
}

export async function bulkImportProducts(productsList: ProductImportItem[]) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized: Tenant session not found.");
  if (!productsList || productsList.length === 0) {
    return { created: 0, updated: 0, categoriesCreated: 0, total: 0 };
  }

  // 1. Fetch all existing categories for this tenant
  const { data: existingCategoriesData, error: catFetchErr } = await supabase
    .from("product_categories")
    .select("*")
    .eq("tenant_id", tenantId);

  if (catFetchErr) throw new Error(catFetchErr.message);
  const categoriesList: ProductCategory[] = existingCategoriesData || [];

  // Map by lowercased title
  const categoryMap = new Map<string, ProductCategory>();
  categoriesList.forEach((c) => {
    categoryMap.set(c.title.toLowerCase().trim(), c);
  });

  // Extract category-level attributes from the imported rows
  const catAttributes = new Map<string, {
    is_rgb?: boolean;
    is_returnable?: boolean;
    set_un_case?: number;
    packing_qty?: number;
  }>();

  for (const p of productsList) {
    if (!p.category_title?.trim()) continue;
    const key = p.category_title.toLowerCase().trim();
    const existing = catAttributes.get(key) || {};
    if (p.is_rgb !== undefined && existing.is_rgb === undefined) existing.is_rgb = p.is_rgb;
    if (p.is_returnable !== undefined && existing.is_returnable === undefined) existing.is_returnable = p.is_returnable;
    if (p.un_case !== undefined && existing.set_un_case === undefined) existing.set_un_case = p.un_case;
    if (p.packing_qty !== undefined && existing.packing_qty === undefined) existing.packing_qty = p.packing_qty;
    catAttributes.set(key, existing);
  }

  // 2. Identify unique category titles to create or update
  const uniqueCategoryTitles = Array.from(
    new Set(
      productsList
        .map((p) => p.category_title?.trim())
        .filter((c): c is string => Boolean(c && c.length > 0))
    )
  );

  let categoriesCreated = 0;
  let maxSortOrder = categoriesList.reduce((max, c) => Math.max(max, c.sort_order || 0), 0);

  for (const catTitle of uniqueCategoryTitles) {
    const key = catTitle.toLowerCase();
    const attrs = catAttributes.get(key) || {};
    const hasExplicitRgb = attrs.is_rgb !== undefined;
    const is_rgb = hasExplicitRgb ? attrs.is_rgb! : /rgb/i.test(catTitle);
    const hasExplicitReturnable = attrs.is_returnable !== undefined;
    const is_returnable = hasExplicitReturnable ? attrs.is_returnable! : (is_rgb || /empt|glass|return/i.test(catTitle));
    const set_un_case = attrs.set_un_case !== undefined ? attrs.set_un_case : 1;
    const packing_qty = attrs.packing_qty !== undefined ? attrs.packing_qty : 1;

    if (!categoryMap.has(key)) {
      maxSortOrder += 10;
      let catInsert: any = {
        tenant_id: tenantId,
        title: catTitle,
        is_rgb,
        is_returnable,
        sort_order: maxSortOrder,
        set_un_case,
        active: true,
        packing_qty,
      };

      let { data: newCat, error: insertCatErr } = await supabase
        .from("product_categories")
        .insert(catInsert)
        .select()
        .single();

      if (insertCatErr && insertCatErr.message?.includes("packing_qty")) {
        delete catInsert.packing_qty;
        const retry = await supabase.from("product_categories").insert(catInsert).select().single();
        newCat = retry.data;
        insertCatErr = retry.error;
      }

      if (insertCatErr) {
        console.error("[bulkImportProducts] Failed to create category:", insertCatErr.message);
      } else if (newCat) {
        categoryMap.set(key, newCat as ProductCategory);
        categoriesCreated++;
      }
    } else {
      // Existing category: update attributes if specified in import
      const existingCat = categoryMap.get(key)!;
      const updateCatPayload: any = {};
      if (attrs.is_rgb !== undefined && attrs.is_rgb !== existingCat.is_rgb) updateCatPayload.is_rgb = attrs.is_rgb;
      if (attrs.is_returnable !== undefined && attrs.is_returnable !== existingCat.is_returnable) updateCatPayload.is_returnable = attrs.is_returnable;
      if (attrs.set_un_case !== undefined && attrs.set_un_case !== existingCat.set_un_case) updateCatPayload.set_un_case = attrs.set_un_case;
      if (attrs.packing_qty !== undefined && attrs.packing_qty !== existingCat.packing_qty) updateCatPayload.packing_qty = attrs.packing_qty;

      if (Object.keys(updateCatPayload).length > 0) {
        let { data: updatedCat, error: updateCatErr } = await supabase
          .from("product_categories")
          .update(updateCatPayload)
          .eq("id", existingCat.id)
          .select()
          .single();

        if (updateCatErr && updateCatErr.message?.includes("packing_qty")) {
          delete updateCatPayload.packing_qty;
          const retry = await supabase.from("product_categories").update(updateCatPayload).eq("id", existingCat.id).select().single();
          updatedCat = retry.data;
        }

        if (updatedCat) {
          categoryMap.set(key, updatedCat as ProductCategory);
        }
      }
    }
  }

  // 3. Fetch existing products for this tenant
  const { data: existingProductsData, error: prodFetchErr } = await supabase
    .from("products")
    .select("id, product_name, product_code")
    .eq("tenant_id", tenantId);

  if (prodFetchErr) throw new Error(prodFetchErr.message);

  const existingProds = existingProductsData || [];
  const prodCodeMap = new Map<string, { id: string; product_name: string }>();
  const prodNameMap = new Map<string, { id: string; product_code: string | null }>();
  const existingCodeSet = new Set<string>();

  existingProds.forEach((p) => {
    if (p.product_code) {
      prodCodeMap.set(p.product_code.toLowerCase().trim(), { id: p.id, product_name: p.product_name });
      existingCodeSet.add(p.product_code.toUpperCase().trim());
    }
    prodNameMap.set(p.product_name.toLowerCase().trim(), { id: p.id, product_code: p.product_code });
  });

  const normalizeText = (value: string, fallback: string, maxLength: number) => {
    const normalized = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    return normalized.length > 0 ? normalized.substring(0, maxLength) : fallback;
  };

  let createdCount = 0;
  let updatedCount = 0;

  for (const item of productsList) {
    const rawName = item.product_name.trim();
    if (!rawName) continue;

    const catKey = item.category_title ? item.category_title.toLowerCase().trim() : "";
    const matchedCategory = catKey ? categoryMap.get(catKey) : null;
    const category_id = matchedCategory ? matchedCategory.id : null;
    const is_returnable = item.is_returnable !== undefined
      ? item.is_returnable
      : (matchedCategory ? matchedCategory.is_returnable : false);

    const sale_rate = typeof item.sale_rate === "number" && !isNaN(item.sale_rate) ? item.sale_rate : 0;
    const purchase_rate = typeof item.purchase_rate === "number" && !isNaN(item.purchase_rate) ? item.purchase_rate : 0;
    const packing_qty = typeof item.packing_qty === "number" && !isNaN(item.packing_qty) && item.packing_qty > 0
      ? item.packing_qty
      : (matchedCategory?.packing_qty ?? 1);
    const active = item.active !== undefined ? item.active : true;

    // Check if product exists by code or by name
    const rawCode = item.product_code?.trim() || "";
    const codeKey = rawCode.toLowerCase();
    const nameKey = rawName.toLowerCase();

    let existingId: string | null = null;
    if (codeKey && prodCodeMap.has(codeKey)) {
      existingId = prodCodeMap.get(codeKey)!.id;
    } else if (prodNameMap.has(nameKey)) {
      existingId = prodNameMap.get(nameKey)!.id;
    }

    if (existingId) {
      // Update existing product
      const updatePayload: Record<string, any> = {
        product_name: rawName,
        category_id,
        sale_rate,
        purchase_rate,
        packing_qty,
        is_returnable,
        active,
      };
      if (rawCode) {
        updatePayload.product_code = rawCode;
      }

      const { error: updErr } = await supabase
        .from("products")
        .update(updatePayload)
        .eq("id", existingId);

      if (updErr) {
        console.error("[bulkImportProducts] Update error:", updErr.message);
      } else {
        updatedCount++;
      }
    } else {
      // Create new product
      let product_code = rawCode;
      if (!product_code) {
        const catPart = normalizeText(matchedCategory?.title || "", "GEN", 10);
        const prodPart = normalizeText(rawName, "PRODUCT", 15);
        let baseCode = `${catPart}-${prodPart}`;
        product_code = baseCode;
        let suffix = 2;
        while (existingCodeSet.has(product_code.toUpperCase())) {
          product_code = `${baseCode}-${suffix}`;
          suffix += 1;
        }
      }

      existingCodeSet.add(product_code.toUpperCase());

      const { data: newProd, error: insErr } = await supabase
        .from("products")
        .insert({
          tenant_id: tenantId,
          product_name: rawName,
          product_code,
          category_id,
          sale_rate,
          purchase_rate,
          packing_qty,
          is_returnable,
          active,
        })
        .select("id, product_name, product_code")
        .single();

      if (insErr) {
        console.error("[bulkImportProducts] Insert error:", insErr.message);
      } else if (newProd) {
        createdCount++;
        if (newProd.product_code) {
          prodCodeMap.set(newProd.product_code.toLowerCase().trim(), { id: newProd.id, product_name: newProd.product_name });
        }
        prodNameMap.set(newProd.product_name.toLowerCase().trim(), { id: newProd.id, product_code: newProd.product_code });
      }
    }
  }

  revalidateAll();
  return {
    created: createdCount,
    updated: updatedCount,
    categoriesCreated,
    total: productsList.length,
  };
}

