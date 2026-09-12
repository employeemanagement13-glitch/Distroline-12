"use client";

import { useState, useTransition } from "react";
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
import { recordShopPayment } from "@/lib/actions/shops";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface CreditClientProps {
  initialShops: any[];
  invoices: any[];
  bankAccounts?: any[];
  creditInvoicesLimit?: number;
}

export function CreditClient({
  initialShops,
  invoices,
  bankAccounts = [],
  creditInvoicesLimit = 1,
}: CreditClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [payingShopId, setPayingShopId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [paymentDescription, setPaymentDescription] = useState<string>("Online Rec");
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>("");

  const [drilldownShopId, setDrilldownShopId] = useState<string | null>(null);

  // Compute stats per shop
  const computedShops = initialShops.map((shop) => {
    // Filter invoices for this shop (match shop_id or outlet_code)
    const shopInvoices = invoices.filter(
      (i) =>
        (i.shop_id && i.shop_id === shop.id) ||
        (i.outlet_code && shop.outlet_code && i.outlet_code === shop.outlet_code)
    );

    // Unpaid credit invoices (balance > 0.01)
    const creditInvoices = shopInvoices.filter((i) => {
      const isCredit =
        i.invoice_type === "credit" ||
        (i.outlet_type && i.outlet_type.toLowerCase() === "credit") ||
        shop.shop_type === "credit" ||
        (shop.outlet_type && shop.outlet_type.toLowerCase() === "credit");

      const total = Number(i.amount ?? i.grand_total ?? i.invoice_total ?? 0);
      const rec = Number(i.amount_received ?? 0);
      return isCredit && total - rec > 0.01;
    });

    // Sort chronologically oldest first
    creditInvoices.sort((a, b) => {
      const dateA = a.record_date || a.delivery_date || a.scheduled_date || a.invoice_date || "";
      const dateB = b.record_date || b.delivery_date || b.scheduled_date || b.invoice_date || "";
      return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
    });

    // Used = sum of balances of all unpaid credit invoices
    const used = creditInvoices.reduce((acc, curr) => {
      const total = Number(curr.amount ?? curr.grand_total ?? curr.invoice_total ?? 0);
      const rec = Number(curr.amount_received ?? 0);
      return acc + Math.max(0, total - rec);
    }, 0);

    // Overdue logic:
    // If credit invoices count exceeds creditInvoicesLimit, outlet is OVERDUE
    // and the previous unpaid invoices are overdue
    const isOverdue = creditInvoices.length > creditInvoicesLimit;
    const overdueInvoices = isOverdue
      ? creditInvoices.slice(0, creditInvoices.length - 1)
      : [];
    const overdue = overdueInvoices.reduce((acc, curr) => {
      const total = Number(curr.amount ?? curr.grand_total ?? curr.invoice_total ?? 0);
      const rec = Number(curr.amount_received ?? 0);
      return acc + Math.max(0, total - rec);
    }, 0);

    // Status: SAFE / OVERDUE / BLOCKED
    let status: "SAFE" | "OVERDUE" | "BLOCKED" = "SAFE";
    if (shop.is_blocked) {
      status = "BLOCKED";
    } else if (isOverdue) {
      status = "OVERDUE";
    }

    // Last Payment: Date of latest invoice with amount_received > 0
    const paidInvoices = shopInvoices.filter((i) => Number(i.amount_received) > 0);
    const lastPaymentDate =
      paidInvoices.length > 0
        ? paidInvoices.reduce((latest, current) => {
            const cDate =
              current.record_date ||
              current.delivery_date ||
              current.scheduled_date ||
              current.invoice_date ||
              "";
            return cDate > latest ? cDate : latest;
          }, paidInvoices[0].record_date || paidInvoices[0].delivery_date || paidInvoices[0].scheduled_date || paidInvoices[0].invoice_date || "—")
        : "—";

    return {
      ...shop,
      used,
      overdue,
      isOverdue,
      status,
      lastPaymentDate,
      shopInvoices,
      unpaidInvoices: creditInvoices,
      overdueInvoices,
    };
  });

  // Filter to credit outlets only
  const filteredShops = computedShops.filter((shop) => {
    const isCreditShop =
      shop.shop_type === "credit" ||
      (shop.outlet_type && shop.outlet_type.toLowerCase() === "credit");
    if (!isCreditShop) return false;

    const s = search.toLowerCase();
    const matchSearch =
      !search ||
      (shop.shop_name && shop.shop_name.toLowerCase().includes(s)) ||
      (shop.outlet_code && shop.outlet_code.toLowerCase().includes(s));

    const matchStatus =
      !statusFilter ||
      (statusFilter === "overdue" && shop.status === "OVERDUE") ||
      (statusFilter === "safe" && shop.status === "SAFE") ||
      (statusFilter === "blocked" && shop.status === "BLOCKED");

    return matchSearch && matchStatus;
  });

  const handleRecordPayment = () => {
    if (!selectedInvoiceId || paymentAmount <= 0) {
      alert("Please select an invoice and enter a valid payment amount.");
      return;
    }
    startTransition(async () => {
      try {
        await recordShopPayment(
          selectedInvoiceId,
          paymentAmount,
          paymentDescription,
          selectedBankAccountId || undefined
        );
        setPayingShopId(null);
        setSelectedInvoiceId("");
        setPaymentAmount(0);
        router.refresh();
      } catch (err: any) {
        alert(err.message);
      }
    });
  };

  // Helper to calculate days past due
  const getDaysPastDue = (dueDateStr: string) => {
    if (!dueDateStr) return "—";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);

    if (due >= today) return "Not yet due";
    const diffTime = Math.abs(today.getTime() - due.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} days`;
  };

  // Export Data matching table
  const mainExportData = filteredShops.map((s) => ({
    "Outlet Name": s.shop_name,
    "Outlet Code": s.outlet_code,
    Used: s.used,
    Overdue: s.overdue,
    Status: s.status,
    "Last Payment": s.lastPaymentDate,
  }));

  const drilldownShop = computedShops.find((s) => s.id === drilldownShopId);
  const payingShop = computedShops.find((s) => s.id === payingShopId);

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Search by Outlet Name or Outlet Code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="overdue">Overdue</option>
          <option value="safe">Safe</option>
          <option value="blocked">Blocked</option>
        </select>
        <ExportButtons data={mainExportData} filename="credit_outlets" />
      </div>

      {/* Main Table: Outlet Name | Used | Overdue | Status | Last Payment | Actions */}
      <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Outlet Name</TableHead>
              <TableHead className="text-right">Used</TableHead>
              <TableHead className="text-right">Overdue</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Payment</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredShops.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-zinc-400 py-8">
                  No credit outlets found
                </TableCell>
              </TableRow>
            ) : (
              filteredShops.map((shop) => (
                <TableRow key={shop.id}>
                  <TableCell className="text-xs">
                    <Link
                      href={`/shop-details/${shop.id}`}
                      className="font-medium text-red-600 hover:text-red-900 block text-xs"
                    >
                      {shop.shop_name}
                    </Link>
                    <span className="text-[10px] text-zinc-400 block">{shop.outlet_code}</span>
                  </TableCell>
                  <TableCell className="text-right font-medium text-xs">
                    {shop.used > 0
                      ? `Rs.${shop.used.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-bold text-red-600 text-xs">
                    {shop.status === "OVERDUE" && shop.overdue > 0
                      ? `Rs.${shop.overdue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : shop.status === "OVERDUE"
                      ? `Overdue (${shop.unpaidInvoices.length} invs)`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {shop.status === "SAFE" ? (
                      <Badge variant="success" className="text-[10px] py-0 px-1 font-semibold">
                        SAFE
                      </Badge>
                    ) : shop.status === "OVERDUE" ? (
                      <Badge variant="warning" className="text-[10px] py-0 px-1 font-bold">
                        OVERDUE
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px] py-0 px-1 font-bold">
                        BLOCKED
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{shop.lastPaymentDate}</TableCell>
                  <TableCell className="text-right text-xs">
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDrilldownShopId(shop.id)}
                      >
                        View Unpaid
                      </Button>
                      {shop.unpaidInvoices.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setPayingShopId(shop.id);
                            setSelectedInvoiceId(shop.unpaidInvoices[0]?.id || "");
                            setPaymentAmount(0);
                          }}
                        >
                          Record Payment
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* RECORD PAYMENT MODAL */}
      {payingShopId && payingShop && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-zinc-900 mb-4">Record Retailer Payment</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Select Unpaid Invoice *
                </label>
                <select
                  className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white"
                  value={selectedInvoiceId}
                  onChange={(e) => setSelectedInvoiceId(e.target.value)}
                >
                  {payingShop.unpaidInvoices.map((inv: any) => {
                    const total = Number(inv.amount ?? inv.grand_total ?? inv.invoice_total ?? 0);
                    const bal = total - Number(inv.amount_received ?? 0);
                    return (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_no} (Bal: Rs.{bal.toLocaleString()})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Payment Amount (Rs.) *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Description / Remarks
                </label>
                <Input
                  placeholder="e.g. Online Rec, Cash Collection"
                  value={paymentDescription}
                  onChange={(e) => setPaymentDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Deposit to Bank Account
                </label>
                <select
                  className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white"
                  value={selectedBankAccountId}
                  onChange={(e) => setSelectedBankAccountId(e.target.value)}
                >
                  <option value="">— Cash in Hand / None —</option>
                  {bankAccounts.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name} ({b.account_title})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={handleRecordPayment}
                  disabled={isPending || paymentAmount <= 0}
                >
                  Save Payment
                </Button>
                <Button variant="outline" onClick={() => setPayingShopId(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* UNPAID INVOICES DRILLDOWN MODAL */}
      {drilldownShopId && drilldownShop && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-zinc-200 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-zinc-900">
                  Unpaid Credit Invoices — {drilldownShop.shop_name}
                </h3>
                <p className="text-sm text-zinc-500 mt-1">
                  Outlet Code: {drilldownShop.outlet_code} | Total Unpaid: {drilldownShop.unpaidInvoices.length} invoices (Limit: {creditInvoicesLimit})
                </p>
              </div>
              <Button variant="ghost" onClick={() => setDrilldownShopId(null)}>
                Close
              </Button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Grand Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Days Past Due</TableHead>
                    <TableHead>Overdue Reason</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drilldownShop.unpaidInvoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-zinc-400 py-6">
                        No unpaid credit invoices.
                      </TableCell>
                    </TableRow>
                  ) : (
                    drilldownShop.unpaidInvoices.map((inv: any, idx: number) => {
                      const total = Number(inv.amount ?? inv.grand_total ?? inv.invoice_total ?? 0);
                      const paid = Number(inv.amount_received ?? 0);
                      const balance = Math.max(0, total - paid);
                      const isPastDue = inv.due_date && new Date(inv.due_date) < new Date();
                      // If shop is overdue and this invoice is among the previous unpaid invoices
                      const isInvoiceOverdue =
                        drilldownShop.isOverdue && idx < drilldownShop.unpaidInvoices.length - 1;

                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium">{inv.invoice_no}</TableCell>
                          <TableCell>
                            {inv.record_date || inv.delivery_date || inv.scheduled_date || inv.invoice_date || "—"}
                          </TableCell>
                          <TableCell className="text-right">Rs.{total.toLocaleString()}</TableCell>
                          <TableCell className="text-right">Rs.{paid.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-semibold">
                            Rs.{balance.toLocaleString()}
                          </TableCell>
                          <TableCell>{inv.due_date || "—"}</TableCell>
                          <TableCell>{inv.due_date ? getDaysPastDue(inv.due_date) : "—"}</TableCell>
                          <TableCell className="text-xs">
                            {isInvoiceOverdue ? (
                              <span className="text-red-600 font-semibold">Previous unpaid invoice</span>
                            ) : (
                              <span className="text-zinc-400">Within limit</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {isInvoiceOverdue || isPastDue ? (
                              <Badge variant="destructive">OVERDUE</Badge>
                            ) : (
                              <Badge variant="warning">Outstanding</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
