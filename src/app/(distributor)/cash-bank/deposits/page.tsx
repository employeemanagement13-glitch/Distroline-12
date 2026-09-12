import { getCashDeposits } from "@/lib/actions/cash";
import { getBankAccounts } from "@/lib/actions/bank-accounts";
import { PageHeader } from "@/components/layout/PageHeader";
import { DepositsClient } from "./DepositsClient";

export default async function CashBankDepositsPage() {
  const [deposits, bankAccounts] = await Promise.all([
    getCashDeposits(),
    getBankAccounts(),
  ]);
  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Cash Deposit Register"
        subtitle="Cash & Bank — record and confirm cash deposits to named bank accounts"
      />
      <DepositsClient initialDeposits={deposits} bankAccounts={bankAccounts} />
    </div>
  );
}

