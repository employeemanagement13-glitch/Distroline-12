import { getSellInOrders, getProducts } from "@/lib/actions/sell-in";
import { getBankAccounts, getVendorAccounts } from "@/lib/actions/bank-accounts";
import { PageHeader } from "@/components/layout/PageHeader";
import { SellInClient } from "./SellInClient";

export default async function SellInPage() {
  const [orders, bankAccounts, products, vendorAccounts] = await Promise.all([
    getSellInOrders(),
    getBankAccounts(),
    getProducts(),
    getVendorAccounts(),
  ]);
  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Sell In (CCBPL Purchases)"
        subtitle="Inventory — manage CCBPL purchase orders through the 4-stage lifecycle: In Progress → Stock Arrived → On Credit → Billed"
      />
      <SellInClient
        initialOrders={orders}
        bankAccounts={bankAccounts}
        products={products}
        vendorAccounts={vendorAccounts}
      />
    </div>
  );
}


