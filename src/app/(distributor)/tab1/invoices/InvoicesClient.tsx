"use client";

import { useState, useTransition } from "react";
import { InvoiceTable } from "@/components/invoice/InvoiceTable";
import { InvoiceForm } from "@/components/invoice/InvoiceForm";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { deleteInvoice } from "@/lib/actions/invoices";
import { useRouter } from "next/navigation";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";

interface InvoicesClientProps {
  initialInvoices: any[];
  shops: any[];
  employees?: any[];
  warehouseStock?: any[];
}

export function InvoicesClient({
  initialInvoices,
  shops,
}: InvoicesClientProps) {
  const [showForm, setShowForm] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [viewInvoice, setViewInvoice] = useState<any>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  useRealtimeTable("invoices", () => router.refresh());

  const handleEdit = (invoice: any) => {
    setEditData(invoice);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this invoice?")) return;
    startTransition(async () => {
      await deleteInvoice(id);
      router.refresh();
    });
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditData(null);
    router.refresh();
  };

  const fmt = (v: any) =>
    v != null && v !== ""
      ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "—";

  return (
    <div>
      <PageHeader
        title="Invoice Generation"
        subtitle="Manage, generate, and import all sales invoices and sales tax summaries"
      />

      <InvoiceTable
        invoices={initialInvoices}
        shops={shops}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onView={setViewInvoice}
      />

      {showForm && (
        <InvoiceForm
          shops={shops}
          onClose={() => { setShowForm(false); setEditData(null); }}
          onSuccess={handleFormSuccess}
          editData={editData}
        />
      )}

      {viewInvoice && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <h2 className="text-lg font-bold text-zinc-900">
                Invoice: {viewInvoice.invoice_no}
              </h2>
              <button
                onClick={() => setViewInvoice(null)}
                className="text-zinc-400 hover:text-zinc-700 font-bold text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-zinc-500">Outlet Code:</span>
                <span className="font-mono font-medium">{viewInvoice.outlet_code || "—"}</span>

                <span className="text-zinc-500">Outlet Name:</span>
                <span className="font-medium">{viewInvoice.outlet_name || "—"}</span>

                <span className="text-zinc-500">Record Date:</span>
                <span>{viewInvoice.record_date || "—"}</span>

                <span className="text-zinc-500">Delivery Date:</span>
                <span>{viewInvoice.delivery_date || "—"}</span>

                <span className="text-zinc-500">Seller Code:</span>
                <span className="font-mono">{viewInvoice.seller_code || "—"}</span>

                <span className="text-zinc-500">Seller Name:</span>
                <span>{viewInvoice.seller_name || "—"}</span>

                <span className="text-zinc-500">Store Name:</span>
                <span>{viewInvoice.store_name || "—"}</span>

                <span className="text-zinc-500">Type:</span>
                <span className="capitalize">{viewInvoice.outlet_type || viewInvoice.type || "—"}</span>

                <span className="text-zinc-500">Total Qty:</span>
                <span>{viewInvoice.total_qty ?? "—"}</span>

                <span className="text-zinc-500">Tax Return:</span>
                <span>{viewInvoice.tax_return || "—"}</span>
              </div>

              <hr className="my-3 border-zinc-100" />

              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-zinc-500">Excl Tax:</span>
                <span>Rs. {fmt(viewInvoice.excl_tax)}</span>

                <span className="text-zinc-500">Sales Tax:</span>
                <span>Rs. {fmt(viewInvoice.sales_tax)}</span>

                <span className="text-zinc-500">Adv. Tax:</span>
                <span>Rs. {fmt(viewInvoice.adv_tax)}</span>

                <span className="text-zinc-500">Disc. Tot:</span>
                <span>Rs. {fmt(viewInvoice.disc_tot)}</span>

                <span className="text-zinc-500 font-bold">Amount:</span>
                <span className="font-bold text-red-600">
                  {viewInvoice.amount != null ? `Rs. ${fmt(viewInvoice.amount)}` : "—"}
                </span>
              </div>

              {viewInvoice.products && (
                <>
                  <hr className="my-3 border-zinc-100" />
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Products</span>
                    <p className="text-xs text-zinc-700 bg-zinc-50 p-2.5 rounded border border-zinc-200 font-mono whitespace-pre-wrap leading-relaxed break-words">
                      {viewInvoice.products}
                    </p>
                  </div>
                </>
              )}
            </div>
            <div className="mt-6">
              <Button variant="outline" onClick={() => setViewInvoice(null)} className="w-full">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
