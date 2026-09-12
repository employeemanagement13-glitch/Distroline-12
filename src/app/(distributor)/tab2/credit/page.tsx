import { getShops } from "@/lib/actions/shops";
import { getInvoices } from "@/lib/actions/invoices";
import { getBankAccounts } from "@/lib/actions/bank-accounts";
import { getSettings } from "@/lib/actions/settings";
import { CreditClient } from "./CreditClient";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function CreditPage() {
  const [{ settings }, shops, invoices, bankAccounts] = await Promise.all([
    getSettings(),
    getShops(),
    getInvoices(),
    getBankAccounts(),
  ]);

  return (
    <div className="p-6">
      <PageHeader
        title="Credit Invoices & Balances"
        subtitle="Tab 2, Page 1 — Track credit outlets, unpaid credit invoices, overdue status and payments"
      />
      <CreditClient
        initialShops={shops}
        invoices={invoices}
        bankAccounts={bankAccounts}
        creditInvoicesLimit={settings?.credit_invoices_limit ?? 1}
      />
    </div>
  );
}

