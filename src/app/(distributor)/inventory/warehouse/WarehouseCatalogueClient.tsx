"use client";

import { useState, useTransition, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { ExportButtons } from "@/components/export/ExportButtons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface PendingReturnInvoice {
  invoice_id: string;
  invoice_no: string;
  invoice_date: string;
  shop_name: string;
  outlet_code: string;
  pending_products: { product_name: string; invoiced_qty: number; returned_qty: number }[];
}

interface WarehouseRow {
  id: string;
  code: string;
  product_name: string;
  product_id?: string;
  total_qty: number;
  ph_case?: number;
  unit_case?: number;
  set_un_case?: number;
  flappy?: number;
  returned?: number;
  unreturned?: number;
  available?: number;
}

interface ProductForReport {
  id: string;
  product_name: string;
  product_code?: string | null;
  category_id?: string | null;
  product_categories?: { id: string; title: string; set_un_case: number; is_returnable?: boolean; is_rgb?: boolean } | null;
}

interface WarehouseCategory {
  title: string;
}

interface Props {
  category: WarehouseCategory;
  type: "standard" | "rgb" | "empties";
  data: WarehouseRow[];
  pendingReturns: PendingReturnInvoice[];
  allProducts?: ProductForReport[];
}

function getDummyStandardRows(categoryTitle: string): WarehouseRow[] {
  return [];
}

function StockReportModal({
  products,
  onClose,
  onSaved,
}: {
  products: ProductForReport[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  const [reportDate, setReportDate] = useState(today);
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<{ product: ProductForReport; ph_case: number; unit_case: number }[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const usedIds = lines.map((l) => l.product.id);
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return products
      .filter((p) => !usedIds.includes(p.id))
      .filter((p) => p.product_name.toLowerCase().includes(q) || (p.product_code ?? "").toLowerCase().includes(q))
      .slice(0, 20);
  }, [query, products, usedIds]);

  const addProduct = (p: ProductForReport) => {
    const setUnCase = (p.product_categories as any)?.set_un_case ?? 1;
    setLines((prev) => [...prev, { product: p, ph_case: 0, unit_case: 0 }]);
    setQuery("");
    setDropdownOpen(false);
  };

  const updatePhCase = (i: number, val: number) => {
    setLines((prev) => prev.map((l, idx) => {
      if (idx !== i) return l;
      const setUnCase = (l.product.product_categories as any)?.set_un_case ?? 1;
      return { ...l, ph_case: val, unit_case: parseFloat((val * setUnCase).toFixed(2)) };
    }));
  };

  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lines.length) { alert("Add at least one product."); return; }
    if (lines.some((l) => l.ph_case <= 0)) { alert("All Ph.Case values must be greater than 0."); return; }
    startTransition(async () => {
      try {
        const { createStockReport } = await import("@/lib/actions/warehouse-catalogue");
        await createStockReport(reportDate, lines.map((l) => ({ product_id: l.product.id, ph_case: l.ph_case, unit_case: l.unit_case })));
        onSaved();
      } catch (err: any) {
        alert(err.message ?? "Failed to save stock report.");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.48)", backdropFilter: "blur(4px)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 flex-shrink-0">
          <h3 className="text-[14px] font-bold text-zinc-900">Add Stock Report</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 text-lg">×</button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-6 pt-4 pb-3 flex-shrink-0 space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-500 mb-1 uppercase tracking-wide">Report Date</label>
              <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} required className="h-9 rounded-lg border border-zinc-200 px-3 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
            <div ref={dropRef} className="relative">
              <label className="block text-[11px] font-semibold text-zinc-500 mb-1 uppercase tracking-wide">Add Product</label>
              <div className="flex items-center border border-zinc-200 rounded-lg bg-white px-2.5 h-9 gap-2 focus-within:ring-2 focus-within:ring-red-500 transition-all">
                <Search className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                <input type="text" value={query} placeholder="Search product..." onFocus={() => setDropdownOpen(true)} onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true); }} className="flex-1 text-[12px] bg-transparent outline-none text-zinc-800 placeholder:text-zinc-400" />
              </div>
              {dropdownOpen && filtered.length > 0 && (
                <div className="absolute top-full mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-lg z-50 max-h-44 overflow-y-auto">
                  {filtered.map((p) => (
                    <button key={p.id} type="button" className="w-full text-left px-3 py-2 text-[12px] hover:bg-zinc-50 flex items-center justify-between" onClick={() => addProduct(p)}>
                      <span className="font-medium">{p.product_name}</span>
                      <span className="text-zinc-400 text-[11px]">{(p.product_categories as any)?.title ?? ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {lines.length > 0 && (
            <div className="px-6 flex-1 overflow-y-auto pb-2">
              <div className="bg-zinc-50 rounded-xl border border-zinc-200 overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-zinc-100 border-b border-zinc-200">
                      <th className="text-left px-3 py-2 font-semibold text-zinc-600">Product</th>
                      <th className="text-left px-3 py-2 font-semibold text-zinc-500">Category</th>
                      <th className="text-right px-3 py-2 font-semibold text-emerald-700">Ph.Case</th>
                      <th className="text-right px-3 py-2 font-semibold text-blue-700">Unit Case</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={l.product.id} className="border-b border-zinc-100">
                        <td className="px-3 py-2 font-medium text-zinc-800">{l.product.product_name}</td>
                        <td className="px-3 py-2 text-zinc-500 text-[11px]">{(l.product.product_categories as any)?.title ?? "—"}</td>
                        <td className="px-3 py-2">
                          <input type="number" min="0" step="1" value={l.ph_case || ""} placeholder="0" onChange={(e) => updatePhCase(i, parseFloat(e.target.value) || 0)} className="w-24 text-right text-[12px] border border-zinc-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-red-400 bg-white ml-auto block" />
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-blue-700">{l.unit_case.toLocaleString()}</td>
                        <td className="px-2 py-2 text-right">
                          <button type="button" onClick={() => removeLine(i)} className="text-zinc-400 hover:text-red-500 transition-colors">
                            <span className="text-base leading-none">×</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {lines.length === 0 && (
            <div className="px-6 py-6 text-center text-zinc-400 text-[12px]">Search and add products above.</div>
          )}
          <div className="px-6 py-4 border-t border-zinc-100 flex gap-2 flex-shrink-0">
            <Button type="submit" className="flex-1" disabled={isPending || lines.length === 0}>
              {isPending ? "Saving..." : "Save Stock Report"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}


export function WarehouseCatalogueClient({ category, type, data, pendingReturns, allProducts = [] }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [showPending, setShowPending] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [showStockReportModal, setShowStockReportModal] = useState(false);

  const standardDummyRows = type === "standard" ? getDummyStandardRows(category.title) : [];
  const mergedData = [...data, ...standardDummyRows].filter((row, index, array) => {
    const key = `${row.code.trim().toLowerCase()}|${row.product_name.trim().toLowerCase()}`;
    return array.findIndex((item) => `${item.code.trim().toLowerCase()}|${item.product_name.trim().toLowerCase()}` === key) === index;
  });

  const filteredData = mergedData.filter((row) =>
    row.product_name.toLowerCase().includes(search.toLowerCase()) ||
    row.code.toLowerCase().includes(search.toLowerCase())
  );

  const formatNum = (num: number | string | null | undefined) =>
    num != null
      ? Number(num).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })
      : "—";

  const exportData = filteredData.map((r) => ({
    Code: r.code,
    Product: r.product_name,
    "Ph.Case": r.ph_case ?? r.total_qty ?? 0,
    "Unit Case": r.unit_case ?? 0,
    Flappy: r.flappy ?? 0,
  }));

  const pendingLabel = type === "standard"
    ? "Invoices with Unreturned Non-Returnable Stock"
    : type === "rgb"
      ? "Invoices with Unreturned RGB Bottles"
      : "Invoices with Unreturned Empties";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h2 className="text-lg font-bold text-zinc-800">
          {category.title} Levels
        </h2>
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <Button
            variant="outline"
            onClick={() => setShowStockReportModal(true)}
            className="whitespace-nowrap border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          >
            + Add Stock Report
          </Button>
          <ExportButtons
            data={exportData}
            filename={`${category.title.toLowerCase().replace(/\s+/g, "_")}_stock`}
          />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Product Name</TableHead>
              <TableHead className="text-right text-emerald-700 font-semibold">Ph.Case</TableHead>
              <TableHead className="text-right text-blue-700 font-semibold">Unit Case</TableHead>
              <TableHead className="text-right">Flappy</TableHead>
              {pendingReturns.length > 0 && (
                <TableHead className="text-right">Pending Returns</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={pendingReturns.length > 0 ? 6 : 5}
                  className="text-center py-8 text-zinc-400"
                >
                  No stock records found for this category.
                </TableCell>
              </TableRow>
            ) : (
              filteredData.map((row, idx) => {
                const hasPending = pendingReturns.some((inv) =>
                  inv.pending_products.some(
                    (p) => p.product_name.toLowerCase().trim() === row.product_name.toLowerCase().trim()
                  )
                );

                return (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-xs text-zinc-500">
                      {row.code}
                    </TableCell>
                    <TableCell className="font-medium text-[13px]">
                      {row.product_name}
                    </TableCell>
                    <TableCell className="text-right font-bold text-[13px] text-emerald-700">
                      {formatNum(row.ph_case ?? row.total_qty ?? 0)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-[13px] text-blue-700">
                      {formatNum(row.unit_case ?? 0)}
                    </TableCell>
                    <TableCell className="text-right text-red-600 text-[13px]">
                      {formatNum(row.flappy ?? 0)}
                    </TableCell>
                    {pendingReturns.length > 0 && (
                      <TableCell className="text-right">
                        {hasPending ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedProduct(row.product_name);
                              setInvoiceSearch("");
                              setExpandedInvoice(null);
                              setShowPending(true);
                            }}
                          >
                            View
                          </Button>
                        ) : (
                          <span className="text-zinc-300 text-xs">—</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {showPending && (() => {
        const productFiltered = selectedProduct
          ? pendingReturns.filter((inv) =>
              inv.pending_products.some(
                (p) => p.product_name.toLowerCase().trim() === selectedProduct.toLowerCase().trim()
              )
            )
          : pendingReturns;

        const q = invoiceSearch.toLowerCase().trim();
        const visibleInvoices = q
          ? productFiltered.filter(
              (inv) =>
                inv.invoice_no.toLowerCase().includes(q) ||
                inv.shop_name.toLowerCase().includes(q) ||
                (inv.outlet_code || "").toLowerCase().includes(q)
            )
          : productFiltered;

        const exportRows = visibleInvoices.flatMap((inv) =>
          inv.pending_products.map((p) => ({
            "Invoice No": inv.invoice_no,
            "Shop": inv.shop_name,
            "Outlet Code": inv.outlet_code || "",
            "Date": inv.invoice_date,
            "Product": p.product_name,
            "Invoiced": p.invoiced_qty,
            "Returned": p.returned_qty,
            "Outstanding": p.invoiced_qty - p.returned_qty,
          }))
        );

        if (productFiltered.length === 0) {
          return (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-100">
              <span className="text-[12px] text-emerald-700 font-medium">
                ✓ All invoices fully returned for {selectedProduct || "this category"}.
              </span>
            </div>
          );
        }

        return (
          <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-amber-50 border-b border-amber-100">
              <div className="w-1.5 h-5 rounded-full bg-amber-400 shrink-0" />
              <span className="text-[13px] font-bold text-amber-800 shrink-0">{pendingLabel}</span>
              {selectedProduct && (
                <span className="text-[11px] text-amber-700 font-mono bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
                  {selectedProduct}
                </span>
              )}
              <span className="text-[11px] text-amber-600 font-medium shrink-0">
                {visibleInvoices.length} invoice{visibleInvoices.length !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
                <input
                  type="text"
                  placeholder="Search shop, outlet code, invoice no…"
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  className="h-7 px-2.5 text-[11px] rounded border border-amber-200 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 w-52"
                />
                <ExportButtons
                  data={exportRows}
                  filename={`${selectedProduct ? selectedProduct.replace(/\s+/g, "_") : "rgb"}_pending_invoices`}
                />
                <button
                  type="button"
                  onClick={() => { setShowPending(false); setInvoiceSearch(""); }}
                  className="h-7 px-3 text-[11px] font-semibold rounded border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors"
                >
                  Hide
                </button>
              </div>
            </div>

            {visibleInvoices.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-zinc-400">
                No invoices match your search.
              </div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {visibleInvoices.map((inv) => (
                  <div key={inv.invoice_id}>
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-50 transition-colors text-left"
                      onClick={() => setExpandedInvoice(expandedInvoice === inv.invoice_id ? null : inv.invoice_id)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[12px] font-bold text-zinc-700">{inv.invoice_no}</span>
                        <span className="text-[11px] text-zinc-500">{inv.shop_name}</span>
                        {inv.outlet_code && (
                          <span className="text-[10px] text-zinc-400 font-mono">{inv.outlet_code}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-zinc-400">{inv.invoice_date}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                          {inv.pending_products.length} product{inv.pending_products.length !== 1 ? "s" : ""} pending
                        </span>
                        <span className="text-zinc-400 text-[10px]">
                          {expandedInvoice === inv.invoice_id ? "▲" : "▼"}
                        </span>
                      </div>
                    </button>

                    {expandedInvoice === inv.invoice_id && (
                      <div className="px-4 pb-3 bg-zinc-50">
                        <div className="rounded-lg border border-zinc-200 overflow-hidden">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="bg-zinc-100 text-zinc-500 uppercase tracking-wide">
                                <th className="text-left px-3 py-2 font-semibold">Product</th>
                                <th className="text-right px-3 py-2 font-semibold">Invoiced</th>
                                <th className="text-right px-3 py-2 font-semibold">Returned</th>
                                <th className="text-right px-3 py-2 font-semibold text-amber-700">Outstanding</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 bg-white">
                              {inv.pending_products.map((p) => (
                                <tr key={p.product_name}>
                                  <td className="px-3 py-2 font-medium text-zinc-700">{p.product_name}</td>
                                  <td className="px-3 py-2 text-right text-zinc-500">{p.invoiced_qty}</td>
                                  <td className="px-3 py-2 text-right text-emerald-600">{p.returned_qty}</td>
                                  <td className="px-3 py-2 text-right font-bold text-amber-700">
                                    {p.invoiced_qty - p.returned_qty}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {showStockReportModal && (
        <StockReportModal
          products={allProducts}
          onClose={() => setShowStockReportModal(false)}
          onSaved={() => {
            setShowStockReportModal(false);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}
