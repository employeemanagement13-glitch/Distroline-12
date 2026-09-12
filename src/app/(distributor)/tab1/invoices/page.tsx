import { getInvoices, getShopsForDropdown } from "@/lib/actions/invoices";
import { InvoicesClient } from "./InvoicesClient";

export default async function InvoicesPage() {
  const [invoices, shops] = await Promise.all([
    getInvoices(),
    getShopsForDropdown(),
  ]);

  return (
    <div className="p-6">
      <InvoicesClient 
        initialInvoices={invoices} 
        shops={shops} 
      />
    </div>
  );
}

