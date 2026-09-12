import { PageHeader } from "@/components/layout/PageHeader";
import { PromoManagementClient } from "./PromoManagementClient";

export const metadata = { title: "Promo Management — MDOS" };

export default function PromoManagementPage() {
  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Promo Management"
        subtitle="Import and review daily promo discount invoices by shop"
      />
      <PromoManagementClient />
    </div>
  );
}
