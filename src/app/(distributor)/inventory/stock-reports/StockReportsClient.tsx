"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useMemo, useState, useTransition, useEffect, useCallback } from "react";
import { ExportButtons } from "@/components/export/ExportButtons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/Table";
import {
  getStockLedger,
  getEmptyLedger,
  deleteEmptyLedgerEntry,
  getStockBalanceByLevel,
  getSalePurchaseSummary,
  getInvoicesForLedger,
  getReturnsForLedger,
  getSaleEntriesForLedger,
} from "@/lib/actions/reports";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";

type View =
  | "stock_ledger"
  | "balance_by_level"
  | "sale_purchase_summary";

const VIEWS: { key: View; label: string }[] = [
  { key: "stock_ledger", label: "Stock Ledger" },
  { key: "balance_by_level", label: "Balance by Level" },
  { key: "sale_purchase_summary", label: "Sale / Purchase Summary" },
];

const REPORT_FLAGS: Record<View, string> = {
  stock_ledger: "tab_stock_ledger",
  balance_by_level: "tab_stock_balance_level",
  sale_purchase_summary: "tab_sale_purchase_summary",
};

type DataRow = Record<string, any>;

const fmt = (n: unknown) =>
  n != null
    ? Number(n as number).toLocaleString(undefined, { minimumFractionDigits: 0 })
    : "—";

const fmtA = (n: unknown) =>
  n != null
    ? "Rs. " +
      Number(n as number).toLocaleString(undefined, { minimumFractionDigits: 2 })
    : "—";

interface Props {
  products: { id: string; product_name: string }[];
  returnableProducts: { id: string; product_name: string }[];
}

export function StockReportsClient({ products, returnableProducts }: Props) {
  const [view, setView] = useState<View>("stock_ledger");
  const [enabledFlags, setEnabledFlags] = useState<string[]>([]);
  const [flagsLoaded, setFlagsLoaded] = useState(false);

  const refreshFlags = useCallback(async () => {
    try {
      const res = await fetch(`/api/flags?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setEnabledFlags(data.enabledFlags ?? []);
      setFlagsLoaded(true);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    refreshFlags();
  }, [refreshFlags]);

  useRealtimeTable("global_feature_flags", refreshFlags);
  useRealtimeTable("tenant_feature_flags", refreshFlags);

  const visibleViews = useMemo(() => {
    if (!flagsLoaded) return VIEWS;
    return VIEWS.filter((v) => enabledFlags.includes(REPORT_FLAGS[v.key]));
  }, [flagsLoaded, enabledFlags]);

  useEffect(() => {
    if (visibleViews.length > 0 && !visibleViews.some((v) => v.key === view)) {
      setView(visibleViews[0].key);
    }
  }, [visibleViews, view]);

  return (
    <div className="space-y-4">
      {visibleViews.length === 0 && flagsLoaded ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center text-amber-800 text-sm">
          All reports on this page have been globally disabled by the administrator.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {visibleViews.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={[
                  "px-3 py-1.5 text-xs font-semibold rounded-full border transition-all",
                  view === v.key
                    ? "border-transparent shadow-sm"
                    : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-400",
                ].join(" ")}
                style={view === v.key ? { background: "var(--primary)", color: "#fff" } : {}}
              >
                {v.label}
              </button>
            ))}
          </div>

          {view === "stock_ledger" && visibleViews.some(v => v.key === "stock_ledger") && <StockLedger products={products} />}
          {view === "balance_by_level" && visibleViews.some(v => v.key === "balance_by_level") && <StockBalanceByLevel />}
          {view === "sale_purchase_summary" && visibleViews.some(v => v.key === "sale_purchase_summary") && <SalePurchaseSummary />}
        </>
      )}
    </div>
  );
}

function StockLedger({ products }: { products: { id: string; product_name: string }[] }) {
  const [, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState(products[0]?.id ?? "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<DataRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [modalState, setModalState] = useState<{
    open: boolean;
    title: string;
    type: "invoice" | "returns" | "sale_entry";
    date: string;
    productName: string;
    items: any[];
    loading: boolean;
  }>({
    open: false,
    title: "",
    type: "invoice",
    date: "",
    productName: "",
    items: [],
    loading: false,
  });

  const load = () => {
    if (!selectedId) return;
    setLoading(true);
    startTransition(async () => {
      try {
        const data = await getStockLedger({
          productId: selectedId,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        });
        setRows(data);
        setLoaded(true);
      } finally {
        setLoading(false);
      }
    });
  };

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedId)?.product_name ?? "",
    [products, selectedId]
  );

  const openInvoicesModal = (date: string) => {
    setModalState({
      open: true,
      title: `Invoices containing ${selectedProduct} on ${date}`,
      type: "invoice",
      date,
      productName: selectedProduct,
      items: [],
      loading: true,
    });
    startTransition(async () => {
      try {
        const data = await getInvoicesForLedger(selectedProduct, date);
        setModalState((prev) => ({ ...prev, items: data, loading: false }));
      } catch {
        setModalState((prev) => ({ ...prev, loading: false }));
      }
    });
  };

  const openReturnsModal = (date: string) => {
    setModalState({
      open: true,
      title: `Invoice Returns for ${selectedProduct} on ${date}`,
      type: "returns",
      date,
      productName: selectedProduct,
      items: [],
      loading: true,
    });
    startTransition(async () => {
      try {
        const data = await getReturnsForLedger(selectedProduct, date);
        setModalState((prev) => ({ ...prev, items: data, loading: false }));
      } catch {
        setModalState((prev) => ({ ...prev, loading: false }));
      }
    });
  };

  const openSaleEntriesModal = (date: string, sourceRef: string) => {
    setModalState({
      open: true,
      title: `Sale Entry — ${sourceRef || date}`,
      type: "sale_entry",
      date,
      productName: selectedProduct,
      items: [],
      loading: true,
    });
    startTransition(async () => {
      try {
        const data = await getSaleEntriesForLedger(sourceRef);
        setModalState((prev) => ({ ...prev, items: data, loading: false }));
      } catch {
        setModalState((prev) => ({ ...prev, loading: false }));
      }
    });
  };

  const exportData = rows.map((r) => ({
    Date: r.date,
    Product: r.product_name,
    Direction: r.direction,
    Source: r.source,
    Quantity: r.direction === "IN" ? `+${r.qty}` : `-${r.qty}`,
    "Running Balance": r.running_balance,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">Product</label>
          <SearchableSelect
            options={products.map((p) => ({
              value: p.id,
              label: p.product_name,
              sub: (p as any).product_code || undefined,
            }))}
            value={selectedId}
            onChange={(v) => setSelectedId(v)}
            placeholder="— Select product —"
            searchPlaceholder="Search by code or name..."
            className="w-64"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">From</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">To</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
        </div>
        <Button onClick={load} disabled={loading || !selectedId}>
          {loading ? "Loading..." : "Load Ledger"}
        </Button>
        {loaded && <ExportButtons data={exportData} filename={`stock_ledger_${selectedProduct}`} />}
      </div>

      {!loaded ? (
        <div className="text-center text-zinc-400 py-12 bg-white rounded-lg border border-zinc-200 text-sm">
          Select a product and click <strong>Load Ledger</strong> to view continuous transactions.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right font-semibold">Qty</TableHead>
                <TableHead className="text-right font-semibold" style={{ color: "var(--primary)" }}>
                  Running Balance
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-zinc-400 py-8">
                    No ledger transactions for selected product/period
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((item, i) => {
                  const isIn = item.direction === "IN";
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs text-zinc-600">{item.date}</TableCell>
                      <TableCell className="font-medium text-xs text-zinc-900">{item.product_name}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                            isIn ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {item.direction}
                        </span>
                      </TableCell>
                      <TableCell>
                        {item.source_type === "invoice" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openInvoicesModal(item.date)}
                            className="h-7 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
                          >
                            Invoice — View
                          </Button>
                        ) : item.source_type === "returns" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openReturnsModal(item.date)}
                            className="h-7 text-xs border-purple-200 text-purple-700 hover:bg-purple-50"
                          >
                            Returns & Wayback — View
                          </Button>
                        ) : item.source_type === "sale_entry" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openSaleEntriesModal(item.date, item.source_ref)}
                            className="h-7 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          >
                            Sales — View
                          </Button>
                        ) : (
                          <span className="font-mono text-xs text-zinc-700">{item.source}</span>
                        )}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono font-semibold text-xs ${
                          isIn ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {isIn ? `+${fmt(item.qty)}` : `—${fmt(item.qty)}`}
                      </TableCell>
                      <TableCell
                        className="text-right font-mono font-bold text-xs"
                        style={{ color: "var(--primary)" }}
                      >
                        {fmt(item.running_balance)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {modalState.open && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
              <h3 className="text-sm font-bold text-zinc-900">{modalState.title}</h3>
              <button
                onClick={() => setModalState((prev) => ({ ...prev, open: false }))}
                className="w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 text-lg"
              >
                ×
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {modalState.loading ? (
                <div className="py-12 text-center text-zinc-400 text-sm">Loading details...</div>
              ) : modalState.items.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 text-sm">No records found.</div>
              ) : modalState.type === "invoice" ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-zinc-100">
                      <TableHead>Invoice No</TableHead>
                      <TableHead>Shop</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modalState.items.map((item: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{item.invoice_no}</TableCell>
                        <TableCell>{item.shop_name}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(item.quantity)}</TableCell>
                        <TableCell className="text-right font-mono">{fmtA(item.amount)}</TableCell>
                        <TableCell className="capitalize text-xs text-zinc-600">{item.payment_status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : modalState.type === "sale_entry" ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-zinc-100">
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Sale Rate</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modalState.items.map((item: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-xs">{item.product_name}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(item.sale_rate)}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(item.qty)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold" style={{ color: "var(--primary)" }}>{fmtA(item.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-zinc-100">
                      <TableHead>Invoice No</TableHead>
                      <TableHead>Shop</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Returned Qty</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modalState.items.map((item: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{item.invoice_no}</TableCell>
                        <TableCell>{item.shop_name}</TableCell>
                        <TableCell>{item.product_name}</TableCell>
                        <TableCell className="text-right font-medium text-red-600">{fmt(item.returned_qty)}</TableCell>
                        <TableCell className="text-zinc-500">{item.note}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

            </div>
            <div className="px-6 py-3 border-t border-zinc-200 flex justify-end bg-zinc-50">
              <Button onClick={() => setModalState((prev) => ({ ...prev, open: false }))}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyLedger({ returnableProducts }: { returnableProducts: { id: string; product_name: string }[] }) {
  const [, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState(returnableProducts[0]?.id ?? "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<DataRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [modalState, setModalState] = useState<{
    open: boolean;
    title: string;
    type: "invoice" | "returns";
    date: string;
    productName: string;
    items: any[];
    loading: boolean;
  }>({
    open: false,
    title: "",
    type: "invoice",
    date: "",
    productName: "",
    items: [],
    loading: false,
  });

  const load = () => {
    if (!selectedId) return;
    setLoading(true);
    startTransition(async () => {
      try {
        const data = await getEmptyLedger({
          productId: selectedId,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        });
        setRows(data);
        setLoaded(true);
      } finally {
        setLoading(false);
      }
    });
  };

  const selectedProduct = useMemo(
    () => returnableProducts.find((p) => p.id === selectedId)?.product_name ?? "",
    [returnableProducts, selectedId]
  );

  const openInvoicesModal = (date: string, sourceType: string) => {
    // Use source_type ("invoice" | "returns") ÃƒÆ’Ã†'Ãƒ"š¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒ"š¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒ"š½ reliable, not the display direction string
    const isInvoice = sourceType === "invoice";
    setModalState({
      open: true,
      type: isInvoice ? "invoice" : "returns",
      title: isInvoice
        ? `Invoices containing ${selectedProduct} on ${date}`
        : `Invoice Returns for ${selectedProduct} on ${date}`,
      date,
      productName: selectedProduct,
      items: [],
      loading: true,
    });
    startTransition(async () => {
      try {
        const data = isInvoice
          ? await getInvoicesForLedger(selectedProduct, date)
          : await getReturnsForLedger(selectedProduct, date);
        setModalState((prev) => ({ ...prev, items: data, loading: false }));
      } catch {
        setModalState((prev) => ({ ...prev, loading: false }));
      }
    });
  };


    const deletableRows = rows.filter((r) => !!r.event_id);
  const isAllSelected = deletableRows.length > 0 && deletableRows.every((r) => selectedIds.includes(r.event_id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) setSelectedIds([]);
    else setSelectedIds(deletableRows.map((r) => r.event_id));
  };

  const handleBulkDelete = () => {
    if (!selectedIds.length) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected ledger entries?`)) return;
    startTransition(async () => {
      try {
        for (const eventId of selectedIds) {
          const item = rows.find((r) => r.event_id === eventId);
          if (item) {
            await deleteEmptyLedgerEntry(eventId, item.source_type);
          }
        }
        setSelectedIds([]);
        load();
      } catch (err: any) {
        alert("Failed to delete entries: " + (err?.message ?? err));
      }
    });
  };

  const handleDeleteEntry = (eventId: string, sourceType: string) => {
    if (!confirm("Are you sure you want to delete this empty ledger entry?")) return;
    startTransition(async () => {
      try {
        await deleteEmptyLedgerEntry(eventId, sourceType);
        load();
      } catch (err: any) {
        alert("Failed to delete entry: " + (err?.message ?? err));
      }
    });
  };

  const exportData = rows.map((r) => ({
    Date: r.date,
    Product: r.product_name,
    Direction: r.direction,
    Reference: r.reference,
    Quantity: (r.direction === "CCBPL → Distribution" || r.direction === "Shop → Distribution") ? `+${r.qty}` : `-${r.qty}`,
    "Running Balance": r.running_balance,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">Product</label>
          <SearchableSelect
            options={returnableProducts.map((p) => ({
              value: p.id,
              label: p.product_name,
              sub: (p as any).product_code || undefined,
            }))}
            value={selectedId}
            onChange={(v) => setSelectedId(v)}
            placeholder="— Select product —"
            searchPlaceholder="Search by code or name..."
            className="w-64"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">From</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">To</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
        </div>
        <Button onClick={load} disabled={loading || !selectedId}>
          {loading ? "Loading..." : "Load Ledger"}
        </Button>
        {loaded && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={isAllSelected ? "ghost" : "outline"}
              size="sm"
              onClick={handleToggleSelectAll}
              className="whitespace-nowrap"
            >
              {isAllSelected ? "Deselect All" : "Select All"}
            </Button>
            {selectedIds.length > 0 && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleBulkDelete}
                disabled={loading}
                className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5 whitespace-nowrap"
              >
                <Trash2 className="h-4 w-4" />
                Delete ({selectedIds.length})
              </Button>
            )}
            <ExportButtons data={exportData} filename={`empty_ledger_${selectedProduct}`} />
          </div>
        )}
      </div>

      {!loaded ? (
        <div className="text-center text-zinc-400 py-12 bg-white rounded-lg border border-zinc-200 text-sm">
          Select an empties/returnable product and click <strong>Load Ledger</strong>.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right font-semibold">Quantity</TableHead>
                <TableHead className="text-right font-semibold" style={{ color: "var(--primary)" }}>
                  Running Balance
                </TableHead>
                <TableHead className="text-right font-semibold">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-zinc-400 py-8">
                    No empty movements for selected product/period
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((item, i) => {
                  const isSelected = item.event_id ? selectedIds.includes(item.event_id) : false;
                  const isPositive = item.direction === "CCBPL → Distribution" || item.direction === "Shop → Distribution";
                  return (
                    <TableRow key={i} className={isSelected ? "bg-red-50/50" : ""}>
                      <TableCell className="w-10 text-center">{item.event_id ? <input type="checkbox" checked={isSelected} onChange={() => setSelectedIds(prev => prev.includes(item.event_id) ? prev.filter(id => id !== item.event_id) : [...prev, item.event_id])} className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4" /> : null}</TableCell>
                      <TableCell className="font-mono text-xs text-zinc-600">{item.date}</TableCell>
                      <TableCell className="font-medium text-xs text-zinc-900">{item.product_name}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                            isPositive ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {item.direction}
                        </span>
                      </TableCell>
                      <TableCell>
                        {item.reference === "Invoices — View" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openInvoicesModal(item.date, item.source_type)}
                            className="h-7 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
                          >
                            Invoices — View
                          </Button>
                        ) : (
                          <span className="font-mono text-xs font-semibold text-zinc-800">
                            {item.reference}
                          </span>
                        )}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono font-semibold text-xs ${
                          isPositive ? "text-emerald-600" : "text-amber-600"
                        }`}
                      >
                        {isPositive ? `+${fmt(item.qty)}` : `—${fmt(item.qty)}`}
                      </TableCell>
                      <TableCell
                        className="text-right font-mono font-bold text-xs"
                        style={{ color: "var(--primary)" }}
                      >
                        {fmt(item.running_balance)}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.event_id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteEntry(item.event_id, item.source_type)}
                            className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          >
                            Delete
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {modalState.open && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
              <h3 className="text-sm font-bold text-zinc-900">{modalState.title}</h3>
              <button
                onClick={() => setModalState((prev) => ({ ...prev, open: false }))}
                className="w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 text-lg"
              >
                ×
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {modalState.loading ? (
                <div className="py-12 text-center text-zinc-400 text-sm">Loading returns...</div>
              ) : modalState.items.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 text-sm">No return records found.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-zinc-100">
                      <TableHead>Invoice No</TableHead>
                      <TableHead>Shop</TableHead>
                      <TableHead>Product</TableHead>
                      {modalState.type === "invoice" ? (
                        <>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </>
                      ) : (
                        <TableHead className="text-right">Returned Qty</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modalState.items.map((item: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{item.invoice_no}</TableCell>
                        <TableCell>{item.shop_name}</TableCell>
                        <TableCell className="text-xs">{item.product_name ?? selectedProduct}</TableCell>
                        {modalState.type === "invoice" ? (
                          <>
                            <TableCell className="text-right font-medium">{fmt(item.quantity)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmtA(item.amount)}</TableCell>
                            <TableCell className="capitalize text-xs text-zinc-600">{item.payment_status}</TableCell>
                          </>
                        ) : (
                          <TableCell className="text-right font-medium text-emerald-600">
                            {fmt(item.returned_qty)}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            <div className="px-6 py-3 border-t border-zinc-200 flex justify-end bg-zinc-50">
              <Button onClick={() => setModalState((prev) => ({ ...prev, open: false }))}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StockBalanceByLevel() {
  const [, startTransition] = useTransition();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<DataRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    startTransition(async () => {
      try {
        const data = await getStockBalanceByLevel({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
        setRows(data);
        setLoaded(true);
      } finally { setLoading(false); }
    });
  };

  const displayRows = useMemo(() => {
    if (!loaded) return [];
    return rows || [];
  }, [rows, loaded]);

  const exportData = displayRows.map((r) => ({
    Product: r.product_name, "Packing Qty": r.packing_qty,
    "Total IN": r.total_qty_in, "Total OUT": r.total_qty_out, "Net Balance": r.net_balance,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">From</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">To</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
        </div>
        <Button onClick={load} disabled={loading}>{loading ? "Loading..." : "Load Balance"}</Button>
        {loaded && <ExportButtons data={exportData} filename="stock_balance_by_level" />}
      </div>
      {!loaded ? (
        <div className="text-center text-zinc-400 py-12 bg-white rounded-lg border border-zinc-200 text-sm">
          Set a date range (optional) and click <strong>Load Balance</strong>.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Packing Qty</TableHead>
                <TableHead className="text-right text-green-700">Total IN</TableHead>
                <TableHead className="text-right text-red-600">Total OUT</TableHead>
                <TableHead className="text-right font-semibold" style={{ color: "var(--primary)" }}>Net Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayRows.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-zinc-400 py-8">No stock movements for selected period</TableCell></TableRow>
              ) : displayRows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{String(r.product_name)}</TableCell>
                  <TableCell className="text-right text-zinc-500">{fmt(r.packing_qty)}</TableCell>
                  <TableCell className="text-right text-green-700 font-medium">{fmt(r.total_qty_in)}</TableCell>
                  <TableCell className="text-right text-red-600 font-medium">{fmt(r.total_qty_out)}</TableCell>
                  <TableCell className="text-right font-bold" style={{ color: "var(--primary)" }}>{fmt(r.net_balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function SalePurchaseSummary() {
  const [, startTransition] = useTransition();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<DataRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    startTransition(async () => {
      try {
        const data = await getSalePurchaseSummary({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
        setRows(data);
        setLoaded(true);
      } finally { setLoading(false); }
    });
  };

  const displayRows = useMemo(() => {
    if (!loaded) return [];
    return rows || [];
  }, [rows, loaded]);

  const exportData = displayRows.map((r) => ({
    Product: r.product_name, "Purchase Qty": r.purchase_qty, "Purchase Amt": r.purchase_amt,
    "Ret Qty": r.pur_return_qty, "Ret Amt": r.pur_return_amt, "Net Pur Qty": r.net_pur_qty, "Net Pur Amt": r.net_pur_amt,
    "Sale Qty": r.sale_qty, "Sale Amt": r.sale_amt, "S.Ret Qty": r.sale_return_qty, "S.Ret Amt": r.sale_return_amt,
    "Net Sale Qty": r.net_sale_qty, "Net Sale Amt": r.net_sale_amt,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">From</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">To</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
        </div>
        <Button onClick={load} disabled={loading}>{loading ? "Loading..." : "Load Summary"}</Button>
        {loaded && <ExportButtons data={exportData} filename="sale_purchase_summary" />}
      </div>
      {!loaded ? (
        <div className="text-center text-zinc-400 py-12 bg-white rounded-lg border border-zinc-200 text-sm">
          Set a date range (optional) and click <strong>Load Summary</strong>.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-x-auto">
          <Table className="min-w-[1100px]">
            <TableHeader>
              <TableRow className="bg-zinc-100 text-xs">
                <TableHead rowSpan={2} className="align-bottom">Product</TableHead>
                <TableHead colSpan={2} className="text-center border-b border-zinc-200 bg-blue-50 text-blue-900 font-semibold">Purchase</TableHead>
                <TableHead colSpan={2} className="text-center border-b border-zinc-200 bg-rose-50 text-rose-900 font-semibold">Purchase Return</TableHead>
                <TableHead colSpan={2} className="text-center border-b border-zinc-200 bg-sky-50 text-sky-900 font-semibold">Net Purchase</TableHead>
                <TableHead colSpan={2} className="text-center border-b border-zinc-200 bg-emerald-50 text-emerald-900 font-semibold">Sale</TableHead>
                <TableHead colSpan={2} className="text-center border-b border-zinc-200 bg-amber-50 text-amber-900 font-semibold">Sale Return</TableHead>
                <TableHead colSpan={2} className="text-center border-b border-zinc-200 bg-teal-50 text-teal-900 font-semibold">Net Sale</TableHead>
              </TableRow>
              <TableRow className="bg-zinc-50 text-[11px]">
                <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Amt</TableHead>
                <TableHead className="text-right">Ret Qty</TableHead><TableHead className="text-right">Ret Amt</TableHead>
                <TableHead className="text-right">Net Qty</TableHead><TableHead className="text-right">Net Amt</TableHead>
                <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Amt</TableHead>
                <TableHead className="text-right">S.Ret Qty</TableHead><TableHead className="text-right">S.Ret Amt</TableHead>
                <TableHead className="text-right">Net Qty</TableHead><TableHead className="text-right">Net Amt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-xs">
              {displayRows.length === 0 ? (
                <TableRow><TableCell colSpan={13} className="text-center text-zinc-400 py-8">No records found for selected period</TableCell></TableRow>
              ) : displayRows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium whitespace-nowrap">{r.product_name}</TableCell>
                  <TableCell className="text-right text-blue-700">{fmt(r.purchase_qty)}</TableCell>
                  <TableCell className="text-right text-blue-700">{fmtA(r.purchase_amt)}</TableCell>
                  <TableCell className="text-right text-rose-600">{fmt(r.pur_return_qty)}</TableCell>
                  <TableCell className="text-right text-rose-600">{fmtA(r.pur_return_amt)}</TableCell>
                  <TableCell className="text-right font-semibold text-sky-800">{fmt(r.net_pur_qty)}</TableCell>
                  <TableCell className="text-right font-semibold text-sky-800">{fmtA(r.net_pur_amt)}</TableCell>
                  <TableCell className="text-right text-emerald-700">{fmt(r.sale_qty)}</TableCell>
                  <TableCell className="text-right text-emerald-700">{fmtA(r.sale_amt)}</TableCell>
                  <TableCell className="text-right text-amber-600">{fmt(r.sale_return_qty)}</TableCell>
                  <TableCell className="text-right text-amber-600">{fmtA(r.sale_return_amt)}</TableCell>
                  <TableCell className="text-right font-bold" style={{ color: "var(--primary)" }}>{fmt(r.net_sale_qty)}</TableCell>
                  <TableCell className="text-right font-bold" style={{ color: "var(--primary)" }}>{fmtA(r.net_sale_amt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
