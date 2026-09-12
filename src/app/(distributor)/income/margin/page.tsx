import { getSchemeIncome } from "@/lib/actions/scheme-income";
import { getProducts } from "@/lib/actions/products";
import { getInvoices } from "@/lib/actions/invoices";
import { getBankAccounts } from "@/lib/actions/bank-accounts";
import { PageHeader } from "@/components/layout/PageHeader";
import { IncomeMarginClient } from "./IncomeMarginClient";

export const metadata = { title: "Income Management — MDOS" };

export default async function IncomeMarginPage() {
  const [schemeRows, products, invoices, bankAccounts] = await Promise.all([
    getSchemeIncome(),
    getProducts(),
    getInvoices(),
    getBankAccounts(),
  ]);
  
  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Income Management"
        subtitle="Margin calculator + CCBPL scheme income tracker"
      />
      <IncomeMarginClient
        schemeRows={schemeRows}
        products={products}
        invoices={invoices}
        bankAccounts={bankAccounts}
      />
    </div>
  );
}


