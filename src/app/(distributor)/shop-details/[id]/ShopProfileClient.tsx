"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ExportButtons } from "@/components/export/ExportButtons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import Link from "next/link";

interface ShopProfileClientProps {
  shop: any;
  invoices: any[];
  initialLedger: any[];
}

export function ShopProfileClient({ shop, invoices, initialLedger }: ShopProfileClientProps) {
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"statement" | "invoices">("statement");

  const filteredLedger = initialLedger.filter((item) => {
    if (fromDate && item.date < fromDate) return false;
    if (toDate && item.date > toDate) return false;
    return true;
  });

  const totalDebit = filteredLedger.reduce((acc, curr) => acc + (curr.debit || 0), 0);
  const totalCredit = filteredLedger.reduce((acc, curr) => acc + (curr.credit || 0), 0);
  const endingBalance = filteredLedger.length > 0 ? filteredLedger[filteredLedger.length - 1].balance : 0;

  const exportData = filteredLedger.map((row) => ({
    Date: row.date,
    "Voucher No.": row.voucher_no,
    Description: row.description,
    "Debit (Rs.)": row.debit ? row.debit : "",
    "Credit (Rs.)": row.credit ? row.credit : "",
    "Balance (Rs.)": row.balance,
  }));

  return (
    <div className="space-y-6">
      <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-5 flex flex-col md:flex-row justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">
            Outlet Account Statement
          </div>
          <h2 className="text-xl font-bold text-red-900">{shop.shop_name}</h2>
          <div className="text-sm text-zinc-600 flex flex-wrap gap-x-4 gap-y-1 pt-1">
            <span>Code: <strong>{shop.outlet_code || "—"}</strong></span>
            <span>Related Person: <strong>{shop.owner_name || "—"}</strong></span>
            <span>Status: <strong>{shop.status || "Active"}</strong></span>
            <span>Tax Number: <strong>{shop.tax_number || "—"}</strong></span>
            <span>Sub Trade Channel: <strong>{shop.sub_trade_channel || "—"}</strong></span>
            <span>Trade Channel: <strong>{shop.trade_channel || "—"}</strong></span>
            <span>GPS: <strong>{shop.gps || "—"}</strong></span>
            <span>Open Date: <strong>{shop.open_date || "—"}</strong></span>
            <span>Address: <strong>{shop.address || "—"}</strong></span>
            <span>Main Channel: <strong>{shop.main_channel_desc || "—"}</strong></span>
            <span>Preseller: <strong>{shop.preseller_name || "—"}</strong></span>
            <span>Segment: <strong>{shop.segment_desc || "—"}</strong></span>
            <span>Phone: <strong>{shop.phone || "—"}</strong></span>
            <span>Type: <strong>{shop.outlet_type ? (shop.outlet_type.toLowerCase() === "credit" ? "Credit" : "Cash") : (shop.shop_type === "credit" ? "Credit" : "—")}</strong></span>
            <span>Filer: <strong className={shop.filer_status === "Yes" || shop.is_filer ? "text-green-600" : shop.filer_status === "Partial" ? "text-amber-600" : "text-zinc-600"}>
              {shop.filer_status || (shop.is_filer ? "Yes" : "No")}
            </strong></span>
          </div>
        </div>
        <div className="shrink-0 flex items-start gap-2">
          <Link href="/shop-details">
            <Button variant="outline">Back to Shops</Button>
          </Link>
          <Link href="/tab2/credit">
            <Button variant="ghost">Credit Balances</Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-end bg-zinc-50 p-4 rounded-lg border border-zinc-200 justify-between">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1">From Date</label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 text-sm bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1">To Date</label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 text-sm bg-white"
            />
          </div>

          {(fromDate || toDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFromDate("");
                setToDate("");
              }}
            >
              Clear Filter
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("statement")}
            className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${
              activeTab === "statement"
                ? "bg-red-600 text-white border-red-600 shadow-sm"
                : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
            }`}
          >
            Account Statement
          </button>
          <button
            onClick={() => setActiveTab("invoices")}
            className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${
              activeTab === "invoices"
                ? "bg-red-600 text-white border-red-600 shadow-sm"
                : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
            }`}
          >
            Invoices List ({invoices.length})
          </button>
        </div>
      </div>

      {activeTab === "statement" ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-zinc-950">
              ACCOUNT LEDGER ({filteredLedger.length} entries)
            </h3>
            <ExportButtons data={exportData} filename={`shop_${shop.outlet_code}_statement`} />
          </div>

          <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-zinc-100">
                  <TableHead className="font-bold text-zinc-900">Date</TableHead>
                  <TableHead className="font-bold text-zinc-900">Voucher No.</TableHead>
                  <TableHead className="font-bold text-zinc-900">Description</TableHead>
                  <TableHead className="font-bold text-zinc-900 text-right">Debit (Rs.)</TableHead>
                  <TableHead className="font-bold text-zinc-900 text-right">Credit (Rs.)</TableHead>
                  <TableHead className="font-bold text-zinc-900 text-right">Balance (Rs.)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLedger.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-zinc-400 py-12">
                      No ledger entries found for selected date range.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLedger.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm font-medium">{row.date}</TableCell>
                      <TableCell className="font-mono text-xs">{row.voucher_no}</TableCell>
                      <TableCell>
                        <div className="text-xs font-semibold text-zinc-800">{row.description}</div>
                      </TableCell>
                      <TableCell className="text-right text-red-600 font-medium">
                        {row.debit ? `Rs. ${Number(row.debit).toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-green-700 font-medium">
                        {row.credit ? `Rs. ${Number(row.credit).toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-bold text-zinc-900">
                        Rs. {Number(row.balance).toLocaleString()} <span className="text-xs text-red-600">DR</span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {filteredLedger.length > 0 && (
                  <TableRow className="bg-zinc-100 font-bold border-t-2 border-zinc-300">
                    <TableCell colSpan={3} className="text-right uppercase tracking-wider text-xs">
                      Summary :
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      Rs. {totalDebit.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-green-700">
                      Rs. {totalCredit.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-bold text-zinc-900">
                      Rs. {endingBalance.toLocaleString()} <span className="text-xs text-red-600">DR</span>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-zinc-50 border-b border-zinc-200">
                <TableHead className="text-xs font-bold text-zinc-800">Invoice No</TableHead>
                <TableHead className="text-xs font-bold text-zinc-800">Date</TableHead>
                <TableHead className="text-xs font-bold text-zinc-800">Type</TableHead>
                <TableHead className="text-xs font-bold text-zinc-800">Products</TableHead>
                <TableHead className="text-xs font-bold text-zinc-800 text-right">Discount</TableHead>
                <TableHead className="text-xs font-bold text-zinc-800">Given By</TableHead>
                <TableHead className="text-xs font-bold text-zinc-800 text-right">Grand Total</TableHead>
                <TableHead className="text-xs font-bold text-zinc-800 text-right">Paid</TableHead>
                <TableHead className="text-xs font-bold text-zinc-800">Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-xs text-zinc-400">
                    No invoices recorded for this shop.
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((inv) => {
                  const productsDisplay = inv.formatted_products || inv.products || "";
                  const discountValue = Number(inv.calculated_discount ?? 0);
                  const givenByDisplay =
                    inv.given_by ||
                    (inv.preseller?.full_name
                      ? `Preseller (${inv.preseller.full_name})`
                      : "—");

                  const invoiceAmount = Number(inv.grand_total ?? inv.amount ?? inv.invoice_total ?? 0);
                  const isCash = inv.invoice_type?.toLowerCase() === "cash";

                  // Paid: invoice amount for cash; actual amount paid for credit
                  const paidAmount = isCash ? invoiceAmount : Number(inv.amount_received || 0);

                  // Payment: always Paid for cash; Paid / Partial / Unpaid for credit
                  let paymentLabel = "Unpaid";
                  let paymentVariant: "success" | "warning" | "destructive" = "destructive";

                  if (isCash) {
                    paymentLabel = "Paid";
                    paymentVariant = "success";
                  } else if (paidAmount >= invoiceAmount - 0.01 && invoiceAmount > 0) {
                    paymentLabel = "Paid";
                    paymentVariant = "success";
                  } else if (paidAmount > 0.01) {
                    paymentLabel = "Partial";
                    paymentVariant = "warning";
                  } else {
                    paymentLabel = "Unpaid";
                    paymentVariant = "destructive";
                  }

                  return (
                    <TableRow key={inv.id} className="hover:bg-zinc-50/70">
                      <TableCell className="font-mono text-xs font-semibold text-zinc-800">{inv.invoice_no}</TableCell>
                      <TableCell className="font-mono text-xs text-zinc-600">{inv.scheduled_date}</TableCell>
                      <TableCell className="capitalize text-xs">
                        <Badge variant={inv.invoice_type === "cash" ? "default" : "secondary"}>
                          {inv.invoice_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-xs font-mono text-zinc-700">
                        <div className="flex flex-wrap gap-1">
                          {String(productsDisplay)
                            .split(",")
                            .map((p, pIdx) => (
                              <span
                                key={pIdx}
                                className="inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-[11px]"
                              >
                                {p.trim()}
                              </span>
                            ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-xs" style={{ color: "var(--primary)" }}>
                        {discountValue > 0 ? `Rs. ${discountValue.toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-800 border border-zinc-200">
                          {givenByDisplay}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium text-xs">
                        Rs.{invoiceAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-zinc-700 text-xs">
                        Rs.{paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={paymentVariant}>
                          {paymentLabel}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
