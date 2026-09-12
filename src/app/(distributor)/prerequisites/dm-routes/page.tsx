import { getDmRoutes, getLoaders } from "@/lib/actions/routes";
import { getEmployeesForDropdown } from "@/lib/actions/invoices";
import { DmRoutesClient } from "./DmRoutesClient";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata = { title: "Delivery Vehicles — MDOS" };

export default async function DmRoutesPage() {
  const [registry, loaders, employees] = await Promise.all([
    getDmRoutes(),
    getLoaders(),
    getEmployeesForDropdown(),
  ]);

  return (
    <div className="p-6">
      <PageHeader
        title="Delivery Vehicles"
        subtitle="Prerequisites — Delivery Vehicles & Loaders Registry"
      />
      <DmRoutesClient registry={registry} loaders={loaders} employees={employees} />
    </div>
  );
}
