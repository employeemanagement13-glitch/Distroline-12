import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { redirect } from "next/navigation";

import { DamagedClient } from "../../tab3/damaged/DamagedClient";
import { WarehouseCatalogueClient } from "./WarehouseCatalogueClient";

import { getDamagedStock, getWarehouseProductNames } from "@/lib/actions/inventory";
import { getPurchases } from "@/lib/actions/ccbpl";

import { 
  getWarehouseCategories, 
  getWarehouseStandardLevels, 
  getWarehouseRGBLevels, 
  getWarehouseEmptiesLevels,
  getPendingReturnsInvoices,
  getCategoryHasStock,
  getProductsForStockReport,
} from "@/lib/actions/warehouse-catalogue";

export default async function UnifiedWarehousePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const categories = await getWarehouseCategories();

  const defaultHead = categories.length > 0 ? categories[0].id : "damaged";
  const head = typeof params.head === "string" ? params.head : defaultHead;

  const activeCategory = categories.find((c: any) => c.id === head);

  if (head !== "damaged" && !activeCategory && categories.length > 0) {
    redirect(`?head=${categories[0].id}`);
  }

  let damagedProps: { damaged: any[]; purchases: any[]; stock: any[] } | null = null;
  let catalogueProps: { type: "standard" | "rgb" | "empties"; data: any; pendingReturns: any[]; allProducts: any[] } | null = null;

  if (head === "damaged") {
    const [damaged, purchases, stock] = await Promise.all([
      getDamagedStock(),
      getPurchases(),
      getWarehouseProductNames(),
    ]);
    damagedProps = { damaged, purchases, stock };
  } else if (activeCategory) {
    const returnType = !activeCategory.is_returnable
      ? "standard"
      : activeCategory.is_rgb
        ? "rgb"
        : "empties";

    const [data, pendingReturns, prods] = await Promise.all([
      getWarehouseStandardLevels(activeCategory.id),
      getPendingReturnsInvoices(returnType),
      getProductsForStockReport(),
    ]);

    catalogueProps = {
      type: returnType,
      data,
      pendingReturns,
      allProducts: prods,
    };
  }

  const tabs = [
    ...categories.map((c: any) => ({ key: c.id, label: c.title })),
    { key: "damaged", label: "Damaged Stock" },
  ];

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Warehouse Stock"
        subtitle="Inventory — Manage physical stock by catalogue heads, damages, and returns"
      />

      {/* Unified MDOS Red Heads — pill style matching StockReports */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((v) => (
          <Link
            key={v.key}
            href={`?head=${v.key}`}
            className={[
              "px-3 py-1.5 text-xs font-semibold rounded-full border transition-all",
              head === v.key
                ? "border-transparent shadow-sm"
                : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-400",
            ].join(" ")}
            style={head === v.key ? { background: "var(--primary)", color: "#fff" } : {}}
          >
            {v.label}
          </Link>
        ))}
      </div>

      {/* Render Active Head */}
      <div>
        {activeCategory && catalogueProps && (
          <WarehouseCatalogueClient
            category={activeCategory}
            type={catalogueProps.type}
            data={catalogueProps.data}
            pendingReturns={catalogueProps.pendingReturns}
            allProducts={catalogueProps.allProducts}
          />
        )}
        {head === "damaged" && damagedProps && (
          <DamagedClient 
            initialDamaged={damagedProps.damaged} 
            products={damagedProps.stock} 
            purchases={damagedProps.purchases} 
          />
        )}
      </div>
    </div>
  );
}
