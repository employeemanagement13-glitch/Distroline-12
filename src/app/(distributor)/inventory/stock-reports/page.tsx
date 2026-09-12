import { getProducts, getReturnableProducts } from "@/lib/actions/reports";
import { PageHeader } from "@/components/layout/PageHeader";
import { StockReportsClient } from "./StockReportsClient";

export const metadata = { title: "Stock Reports — MDOS" };

export default async function StockReportsPage() {
  const [products, returnableProducts] = await Promise.all([
    getProducts(),
    getReturnableProducts(),
  ]);
  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Stock Reports"
        subtitle="Stock Ledger · Balance by Level · Sale/Purchase Summary · Empty Ledger"
      />
      <StockReportsClient
        products={products}
        returnableProducts={returnableProducts}
      />
    </div>
  );
}
