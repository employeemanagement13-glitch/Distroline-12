import { getShops } from "@/lib/actions/shops";
import { ShopDetailsClient } from "./ShopDetailsClient";
import { PageHeader } from "@/components/layout/PageHeader";

export const dynamic = "force-dynamic";

export default async function ShopDetailsPage() {
  const shops = await getShops();

  return (
    <div className="p-6">
      <PageHeader
        title="Shop Details"
        subtitle="Manage outlet profiles, addresses, channels, and records"
      />
      <ShopDetailsClient initialShops={shops} />
    </div>
  );
}

