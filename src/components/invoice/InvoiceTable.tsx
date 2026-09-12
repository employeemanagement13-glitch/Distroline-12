"use client";

import { useState, useRef } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/Table";
import { Input } from "@/components/ui/Input";
import { ExportButtons } from "@/components/export/ExportButtons";
import { bulkImportInvoicesReport, bulkImportSalesTax, bulkImportSaleDetail, deleteInvoices } from "@/lib/actions/invoices";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

interface InvoiceTableProps {
  invoices: any[];
  shops: any[];
  onEdit: (invoice: any) => void;
  onDelete: (id: string) => void;
  onView: (invoice: any) => void;
}

function excelDateToISO(v: any): string {
  if (!v) return "";
  if (typeof v === "string" && v.includes("-")) return v.split("T")[0];
  const n = Number(v);
  if (isNaN(n) || n === 0) return "";
  const d = new Date(Math.round((n - 25569) * 86400 * 1000));
  return d.toISOString().split("T")[0];
}

function parseNum(v: any): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export function InvoiceTable({ invoices, shops, onEdit, onDelete, onView }: InvoiceTableProps) {
  const router = useRouter();
  const invoiceFileRef = useRef<HTMLInputElement>(null);
  const taxFileRef = useRef<HTMLInputElement>(null);
  const saleDetailFileRef = useRef<HTMLInputElement>(null);
  const [importingInvoices, setImportingInvoices] = useState(false);
  const [importingTax, setImportingTax] = useState(false);
  const [importingSaleDetail, setImportingSaleDetail] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const shopMap = new Map(shops.map((s: any) => [s.outlet_code?.toString(), s.id]));

  const filtered = invoices.filter((inv) => {
    const s = search.toLowerCase();
    const matchSearch = !search ||
      inv.invoice_no?.toLowerCase().includes(s) ||
      inv.outlet_name?.toLowerCase().includes(s) ||
      inv.outlet_code?.toLowerCase().includes(s) ||
      inv.seller_name?.toLowerCase().includes(s);
    const rd = inv.record_date || "";
    const matchFrom = !dateFrom || rd >= dateFrom;
    const matchTo = !dateTo || rd <= dateTo;
    return matchSearch && matchFrom && matchTo;
  });

  const isAllSelected = filtered.length > 0 && filtered.every((inv) => selectedIds.includes(inv.id));

  const handleToggleSelectAll = () => {
    setSelectedIds(isAllSelected ? [] : filtered.map((inv) => inv.id));
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!confirm(`Delete ${selectedIds.length} selected invoice(s)?`)) return;
    setIsDeleting(true);
    try {
      await deleteInvoices(selectedIds);
      setSelectedIds([]);
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  function parseRowFromExcel(r: any) {
    const invoiceNo = String(
      r["Invoice No."] ||
      r["Invoice No"] ||
      r["Document Nr"] ||
      r["document_nr"] ||
      r["invoice_no"] ||
      ""
    ).trim();

    if (!invoiceNo) return null;

    const outletCode = String(
      r["Buyer code"] ||
      r["Buyer Code"] ||
      r["buyer_code"] ||
      r["Outlet Code"] ||
      r["outlet_code"] ||
      ""
    ).trim();

    const outletName = String(
      r["Buyer Name"] ||
      r["Buyer name"] ||
      r["buyer_name"] ||
      r["Outlet Name"] ||
      r["outlet_name"] ||
      ""
    ).trim();

    const shopId = outletCode ? (shopMap.get(outletCode) ?? null) : null;

    const recordDate = excelDateToISO(
      r["Record Date"] ??
      r["Date"] ??
      r["record_date"] ??
      r["date"]
    ) || null;

    const deliveryDate = excelDateToISO(
      r["Delivery Date"] ??
      r["delivery_date"]
    ) || null;

    const sellerCode = String(r["Seller Code"] || r["seller_code"] || "").trim() || null;
    const sellerName = String(r["Seller Name"] || r["seller_name"] || "").trim() || null;
    const storeName = String(r["Store Name"] || r["store_name"] || "").trim() || null;
    const outletType = String(r["Type"] || r["type"] || "").trim() || null;
    const taxReturn = String(r["Tax Return"] || r["tax_return"] || "").trim() || null;

    const rawQty = r["Total Qty"] ?? r["total_qty"];
    const totalQty = rawQty != null && rawQty !== "" ? parseNum(rawQty) : null;

    const rawExcl = r["Excl Tex"] ?? r["Excl Tax"] ?? r["excl_tax"];
    const exclTax = rawExcl != null && rawExcl !== "" ? parseNum(rawExcl) : null;

    const rawSales = r["Sales Tax"] ?? r["sales_tax"];
    const salesTax = rawSales != null && rawSales !== "" ? parseNum(rawSales) : null;

    const rawAdv = r["Adv.Tax"] ?? r["Adv. Tax"] ?? r["adv_tax"];
    const advTax = rawAdv != null && rawAdv !== "" ? parseNum(rawAdv) : null;

    const rawDisc = r["Disc Tot."] ?? r["Disc Tot"] ?? r["disc_tot"];
    const discTot = rawDisc != null && rawDisc !== "" ? parseNum(rawDisc) : null;

    const rawAmt = r["Total Inv"] ?? r["Amount"] ?? r["amount"] ?? r["total_inv"];
    const amount = rawAmt != null && rawAmt !== "" ? parseNum(rawAmt) : null;

    return {
      invoice_no: invoiceNo,
      outlet_code: outletCode || null,
      outlet_name: outletName || null,
      shop_id: shopId,
      record_date: recordDate,
      delivery_date: deliveryDate,
      seller_code: sellerCode,
      seller_name: sellerName,
      store_name: storeName,
      outlet_type: outletType,
      total_qty: totalQty,
      amount: amount,
      tax_return: taxReturn,
      excl_tax: exclTax,
      sales_tax: salesTax,
      adv_tax: advTax,
      disc_tot: discTot,
    };
  }

  const handleImportInvoices = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingInvoices(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const rows = rawRows.map(parseRowFromExcel).filter((r): r is NonNullable<typeof r> => r !== null && Boolean(r.invoice_no));

      if (rows.length === 0) {
        throw new Error("No valid invoice rows found. Please check that 'Invoice No.' or 'Document Nr' column exists.");
      }

      const res = await bulkImportInvoicesReport(rows);
      router.refresh();
      alert(`Import Invoices completed: ${res.inserted ?? rows.length} inserted, ${res.updated ?? 0} updated.`);
    } catch (err: any) {
      alert(`Import failed:\n${err.message}`);
    } finally {
      setImportingInvoices(false);
      if (invoiceFileRef.current) invoiceFileRef.current.value = "";
    }
  };

  const handleImportSalesTax = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingTax(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const rows = rawRows.map(parseRowFromExcel).filter((r): r is NonNullable<typeof r> => r !== null && Boolean(r.invoice_no));

      if (rows.length === 0) {
        throw new Error("No valid invoice rows found. Please check that 'Document Nr' or 'Invoice No.' column exists.");
      }

      const res = await bulkImportSalesTax(rows);
      router.refresh();
      alert(`Sales Tax Summary imported: ${res.inserted ?? rows.length} inserted, ${res.updated ?? 0} updated.`);
    } catch (err: any) {
      alert(`Import failed:\n${err.message}`);
    } finally {
      setImportingTax(false);
      if (taxFileRef.current) taxFileRef.current.value = "";
    }
  };

  const handleImportSaleDetailPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingSaleDetail(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-sale-detail-pdf", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const rawPreview = json.rawText ? `\n\nRaw PDF text (first 2000 chars):\n${json.rawText.slice(0, 2000)}` : "";
        throw new Error((json.error || "PDF parse failed") + rawPreview);
      }
      const invoiceProducts: { invoice_no: string; products: { code: string; name: string; phCase: number }[] }[] = json.data;
      if (!invoiceProducts.length) {
        const rawPreview = json.rawText ? `\n\nRaw PDF text (first 2000 chars):\n${json.rawText.slice(0, 2000)}` : "";
        throw new Error("No invoice/product blocks found in PDF. Check the format matches expected layout." + rawPreview);
      }
      const entries = invoiceProducts.map((inv) => ({
        invoice_no: inv.invoice_no,
        products: inv.products
          .map((p) => `${p.code}     ${p.name}\u00D7${p.phCase}`)
          .join(", "),
      }));
      const result = await bulkImportSaleDetail(entries);
      router.refresh();
      alert(`Sale Detail import complete:\n${result.updated} invoice(s) updated, ${result.notFound} not matched.`);
    } catch (err: any) {
      alert(`Import failed:\n${err.message}`);
    } finally {
      setImportingSaleDetail(false);
      if (saleDetailFileRef.current) saleDetailFileRef.current.value = "";
    }
  };

  const exportData = filtered.map((inv) => ({
    "Invoice No": inv.invoice_no,
    "Outlet Code": inv.outlet_code || "",
    "Outlet Name": inv.outlet_name || "",
    "Record Date": inv.record_date || "",
    "Delivery Date": inv.delivery_date || "",
    "Seller Code": inv.seller_code || "",
    "Seller Name": inv.seller_name || "",
    "Store Name": inv.store_name || "",
    "Type": inv.outlet_type || "",
    "Total Qty": inv.total_qty ?? "",
    "Amount": inv.amount ?? "",
    "Tax Return": inv.tax_return || "",
    "Excl Tax": inv.excl_tax ?? "",
    "Sales Tax": inv.sales_tax ?? "",
    "Adv. Tax": inv.adv_tax ?? "",
    "Disc. Tot": inv.disc_tot ?? "",
    "Products": inv.products || "",
  }));

  const n = (v: any) => (v != null && v !== "" ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end bg-zinc-50 p-3 rounded-lg border border-zinc-200">
        <div className="flex-1 min-w-[200px]">
          <Input placeholder="Search Invoice No, Outlet, Seller..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="flex gap-2 items-center">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
          <span className="text-zinc-400 text-sm">to</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
        </div>

        <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); }}>Reset</Button>

        <div className="flex items-center gap-2">
          <Button type="button" variant={isAllSelected ? "ghost" : "outline"} size="sm" onClick={handleToggleSelectAll} className="whitespace-nowrap">
            {isAllSelected ? "Deselect All" : "Select All"}
          </Button>
          {selectedIds.length > 0 && (
            <Button type="button" size="sm" onClick={handleBulkDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5 whitespace-nowrap">
              <Trash2 className="h-4 w-4" />Delete ({selectedIds.length})
            </Button>
          )}
        </div>

        <ExportButtons data={exportData} filename="invoices" />

        <div className="flex gap-2">
          <input ref={invoiceFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportInvoices} />
          <Button variant="outline" size="sm" onClick={() => invoiceFileRef.current?.click()} disabled={importingInvoices} className="flex items-center gap-1.5">
            {importingInvoices ? (
              <>
                <svg className="animate-spin h-4 w-4 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span className="text-red-600 font-semibold">Importing...</span>
              </>
            ) : "Import Invoices"}
          </Button>

          <input ref={taxFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportSalesTax} />
          <Button variant="outline" size="sm" onClick={() => taxFileRef.current?.click()} disabled={importingTax} className="flex items-center gap-1.5">
            {importingTax ? (
              <>
                <svg className="animate-spin h-4 w-4 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span className="text-red-600 font-semibold">Importing...</span>
              </>
            ) : "Import Sales Tax Summary"}
          </Button>

          <input ref={saleDetailFileRef} type="file" accept=".pdf" className="hidden" onChange={handleImportSaleDetailPdf} />
          <Button variant="outline" size="sm" onClick={() => saleDetailFileRef.current?.click()} disabled={importingSaleDetail} className="flex items-center gap-1.5">
            {importingSaleDetail ? (
              <>
                <svg className="animate-spin h-4 w-4 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span className="text-red-600 font-semibold">Importing...</span>
              </>
            ) : "Import Sale Detail | PDF"}
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-center">
                <input type="checkbox" checked={isAllSelected} onChange={handleToggleSelectAll} className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4" />
              </TableHead>
              <TableHead>Invoice No</TableHead>
              <TableHead>Outlet Code</TableHead>
              <TableHead>Outlet Name</TableHead>
              <TableHead>Record Date</TableHead>
              <TableHead>Delivery Date</TableHead>
              <TableHead>Seller Code</TableHead>
              <TableHead>Seller Name</TableHead>
              <TableHead>Store Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Total Qty</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Tax Return</TableHead>
              <TableHead className="text-right">Excl Tax</TableHead>
              <TableHead className="text-right">Sales Tax</TableHead>
              <TableHead className="text-right">Adv. Tax</TableHead>
              <TableHead className="text-right">Disc. Tot</TableHead>
              <TableHead>Products</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={19} className="text-center text-zinc-400 py-8">No invoices found</TableCell>
              </TableRow>
            ) : filtered.map((inv) => (
              <TableRow key={inv.id} className={selectedIds.includes(inv.id) ? "bg-red-50/50" : ""}>
                <TableCell className="w-10 text-center">
                  <input type="checkbox" checked={selectedIds.includes(inv.id)} onChange={() => setSelectedIds((prev) => prev.includes(inv.id) ? prev.filter((id) => id !== inv.id) : [...prev, inv.id])} className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4" />
                </TableCell>
                <TableCell className="font-medium whitespace-nowrap text-xs">{inv.invoice_no}</TableCell>
                <TableCell className="text-xs font-mono whitespace-nowrap">{inv.outlet_code || "—"}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{inv.outlet_name || "—"}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{inv.record_date || "—"}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{inv.delivery_date || "—"}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{inv.seller_code || "—"}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{inv.seller_name || "—"}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{inv.store_name || "—"}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{inv.outlet_type || "—"}</TableCell>
                <TableCell className="text-xs text-right whitespace-nowrap">{inv.total_qty ?? "—"}</TableCell>
                <TableCell className="text-xs text-right font-medium whitespace-nowrap">{inv.amount != null ? `Rs.${n(inv.amount)}` : "—"}</TableCell>
                <TableCell className="text-xs text-center">{inv.tax_return || "—"}</TableCell>
                <TableCell className="text-xs text-right whitespace-nowrap">{inv.excl_tax != null ? n(inv.excl_tax) : "—"}</TableCell>
                <TableCell className="text-xs text-right whitespace-nowrap">{inv.sales_tax != null ? n(inv.sales_tax) : "—"}</TableCell>
                <TableCell className="text-xs text-right whitespace-nowrap">{inv.adv_tax != null ? n(inv.adv_tax) : "—"}</TableCell>
                <TableCell className="text-xs text-right whitespace-nowrap">{inv.disc_tot != null ? n(inv.disc_tot) : "—"}</TableCell>
                <TableCell className="text-xs whitespace-nowrap max-w-xs truncate" title={inv.products || ""}>{inv.products || "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <Button size="sm" variant="ghost" className="whitespace-nowrap" onClick={() => onView(inv)}>View</Button>
                    <Button size="sm" variant="ghost" className="whitespace-nowrap" onClick={() => onEdit(inv)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="whitespace-nowrap text-red-500 hover:text-red-700" onClick={() => onDelete(inv.id)}>Del</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="text-xs text-zinc-400">{filtered.length} invoice{filtered.length !== 1 ? "s" : ""}</div>
    </div>
  );
}
