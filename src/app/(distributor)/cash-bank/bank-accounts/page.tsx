import { getBankAccounts, getVendorAccounts } from "@/lib/actions/bank-accounts";
import { PageHeader } from "@/components/layout/PageHeader";
import { BankAccountsClient } from "./BankAccountsClient";

export default async function BankAccountsPage() {
  const [bankAccounts, vendorAccounts] = await Promise.all([
    getBankAccounts(),
    getVendorAccounts(),
  ]);
  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Bank & Vendor Accounts"
        subtitle="Cash & Bank — manage bank accounts and vendor credit ledger accounts"
      />
      <BankAccountsClient initialAccounts={bankAccounts} initialVendorAccounts={vendorAccounts} />
    </div>
  );
}


