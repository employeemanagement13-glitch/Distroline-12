import { getWHTaxSummary, getAdvanceTaxReport } from "@/lib/actions/reports";
import { getDiscountConfigs } from "@/lib/actions/discounts";
import { getEmployees } from "@/lib/actions/employees";
import { getShopsForDropdown } from "@/lib/actions/invoices";
import { PageHeader } from "@/components/layout/PageHeader";
import { FinancialReportsClient } from "./FinancialReportsClient";

export const metadata = { title: "Financial Reports — MDOS" };

export default async function FinancialReportsPage() {
  const [whTax, advanceTax, discountConfigs, employees, shops] = await Promise.all([
    getWHTaxSummary(),
    getAdvanceTaxReport(),
    getDiscountConfigs(),
    getEmployees(),
    getShopsForDropdown(),
  ]);

  const presellers = (employees || []).filter((e: any) => e.role === "preseller");

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Financial Reports"
        subtitle="WH Tax Summary · Advance Tax · Additional Discounts · Sales Summary · Credit Summary"
      />
      <FinancialReportsClient
        whTax={whTax}
        advanceTax={advanceTax}
        discountConfigs={discountConfigs || []}
        presellers={presellers}
        shops={shops || []}
      />
    </div>
  );
}
