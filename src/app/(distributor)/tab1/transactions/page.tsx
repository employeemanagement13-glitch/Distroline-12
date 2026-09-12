import { PageHeader } from "@/components/layout/PageHeader";
import { getInvoices, getShopsForDropdown } from "@/lib/actions/invoices";
import { InvoicesClient } from "../invoices/InvoicesClient";

export default async function SalesTransactionsPage() {
  const [invoices, shops] = await Promise.all([
    getInvoices(),
    getShopsForDropdown(),
  ]);

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Invoice Generation"
        subtitle="Sales & Credit — Manage daily invoices and report generation"
      />

      <div>
        <InvoicesClient
          initialInvoices={invoices}
          shops={shops}
        />
      </div>
    </div>
  );
}
