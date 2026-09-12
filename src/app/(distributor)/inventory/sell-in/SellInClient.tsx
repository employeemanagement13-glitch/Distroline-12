"use client";

import { useState, useTransition, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  createSellInOrderWithLines,
  updateSellInOrderWithLines,
  updateSellInOrderStatus,
  deleteSellInOrder, deleteSellInOrders,
  getSellInLines,
  markSellInArrived,
} from "@/lib/actions/sell-in";

const STATUS_CONFIG = {
  in_progress:   { label: "Pending",        color: "bg-zinc-100 text-zinc-700",   dot: "bg-zinc-400" },
  stock_arrived: { label: "Stock Arrived", color: "bg-blue-100 text-blue-700",   dot: "bg-blue-500" },
  on_credit:     { label: "On-Credit",     color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  billed:        { label: "Billed",        color: "bg-green-100 text-green-700", dot: "bg-green-500" },
} as const;

type Status = keyof typeof STATUS_CONFIG;

const fmtAmt = (n: any) =>
  n != null
    ? Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";

function StatusBadge({ status }: { status: string }) {
  const isArrived = status !== "in_progress";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${
        isArrived ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-700"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isArrived ? "bg-blue-500" : "bg-zinc-400"}`} />
      {isArrived ? "Stock Arrived" : "Pending"}
    </span>
  );
}

function PaymentBadge({ status, paidAmount, totAmount }: { status: string; paidAmount?: number; totAmount?: number }) {
  if (status === "billed") {
    return <Badge variant="success">Billed</Badge>;
  }
  const paid = Number(paidAmount || 0);
  if (paid > 0) {
    return <Badge variant="warning">On-Credit (Partial)</Badge>;
  }
  return <Badge variant="warning">On-Credit</Badge>;
}

interface FormLineItem {
  category_id: string;
  product_id: string;
  qty: number;
  rate: number;
  billed_amount: number;
  packing_qty: number;
}

interface ViewLineItem {
  lineId: string;
  name: string;
  orderedQty: number;
  arrivedQty: string;
  amount: number;
  returnedQty: string;
  returnedAmt: string;
  isReturnable: boolean;
  isRgb: boolean;
}

interface Props {
  initialOrders: any[];
  bankAccounts: any[];
  products: any[];
  vendorAccounts?: any[];
}

function SellInContent({ initialOrders, bankAccounts, products, vendorAccounts = [] }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // ---- SEARCH & SEPARATE FILTERS ----
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");   // all / in_progress / stock_arrived
  const [paymentFilter, setPaymentFilter] = useState<string>("all"); // all / on_credit / billed

  // Order Add/Edit modal state
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any | null>(null);
  const [orderForm, setOrderForm] = useState({
    po_no: "",
    company_inv_no: "",
    vehicle_no: "",
    transaction_date: new Date().toISOString().split("T")[0],
    stock_status: "in_progress" as "in_progress" | "stock_arrived",
    payment_status: "on_credit" as "on_credit" | "billed",
    credit_due_date: "",
    paid_from_bank_account_id: bankAccounts[0]?.id || "",
    billed_date: new Date().toISOString().split("T")[0],
    vendor_account_id: vendorAccounts[0]?.id || "",
    payment_voucher: "",
    paid_amount: "0",
  });
  const [orderLines, setOrderLines] = useState<FormLineItem[]>([]);

  // View PO Lines modal state
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewOrder, setViewOrder] = useState<any | null>(null);
  const [viewLines, setViewLines] = useState<ViewLineItem[]>([]);
  const [loadingViewLines, setLoadingViewLines] = useState(false);

  const categories = Array.from(
    new Map(
      products
        .filter((p: any) => p.product_categories)
        .map((p: any) => [p.product_categories.id, p.product_categories])
    ).values()
  );

  // Auto-open modal with cart lines if navigated from Product Catalogue quick-add cart
  useEffect(() => {
    const cartParam = searchParams.get("cart");
    const createParam = searchParams.get("create");

    if (cartParam && createParam === "true") {
      try {
        const parsed: { productId: string; qty: number }[] = JSON.parse(cartParam);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const prefilledLines: FormLineItem[] = parsed.map((item) => {
            const prod = products.find((p: any) => p.id === item.productId);
            const rate = prod?.purchase_rate || 0;
            return {
              category_id: prod?.category_id || "",
              product_id: item.productId,
              qty: item.qty,
              rate: rate,
              billed_amount: rate * item.qty,
              packing_qty: prod?.packing_qty || 1,
            };
          });

          const autoPoNo = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(
            100 + Math.random() * 900
          )}`;

          setEditingOrder(null);
          setOrderForm({
            po_no: autoPoNo,
            company_inv_no: "",
            vehicle_no: "",
            transaction_date: new Date().toISOString().split("T")[0],
            stock_status: "in_progress",
            payment_status: "on_credit",
            credit_due_date: "",
            paid_from_bank_account_id: bankAccounts[0]?.id || "",
            billed_date: new Date().toISOString().split("T")[0],
            vendor_account_id: "",
            payment_voucher: "",
            paid_amount: "0",
          });
          setOrderLines(prefilledLines);
          setShowOrderModal(true);
        }
      } catch (err) {
        console.error("Failed to parse cart params:", err);
      }
    }
  }, [searchParams, products, bankAccounts]);

  // Filter orders by Search Query, Status AND Payment
  const filtered = initialOrders.filter((o) => {
    // Search Query (PO No or Payment Voucher No)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const poMatch = o.po_no ? String(o.po_no).toLowerCase().includes(q) : false;
      const voucherMatch = o.payment_voucher ? String(o.payment_voucher).toLowerCase().includes(q) : false;
      if (!poMatch && !voucherMatch) return false;
    }

    // Status Filter
    let matchStatus = true;
    if (statusFilter === "in_progress") {
      matchStatus = o.status === "in_progress";
    } else if (statusFilter === "stock_arrived") {
      matchStatus = o.status === "stock_arrived" || o.status === "on_credit" || o.status === "billed";
    }

    // Payment Filter
    let matchPayment = true;
    if (paymentFilter === "on_credit") {
      matchPayment = o.status !== "billed";
    } else if (paymentFilter === "billed") {
      matchPayment = o.status === "billed";
    }

    return matchStatus && matchPayment;
  });

  const openAddOrder = () => {
    const autoPoNo = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(
      100 + Math.random() * 900
    )}`;
    setEditingOrder(null);
    setOrderForm({
      po_no: autoPoNo,
      company_inv_no: "",
      vehicle_no: "",
      transaction_date: new Date().toISOString().split("T")[0],
      stock_status: "in_progress",
      payment_status: "on_credit",
      credit_due_date: "",
      paid_from_bank_account_id: bankAccounts[0]?.id || "",
      billed_date: new Date().toISOString().split("T")[0],
      vendor_account_id: vendorAccounts[0]?.id || "",
      payment_voucher: "",
      paid_amount: "0",
    });
    setOrderLines([
      { category_id: "", product_id: "", qty: 1, rate: 0, billed_amount: 0, packing_qty: 1 },
    ]);
    setShowOrderModal(true);
  };

  const openEditOrder = async (o: any) => {
    setEditingOrder(o);
    const stockStatus = o.status === "in_progress" ? "in_progress" : "stock_arrived";
    const paymentStatus = o.status === "billed" ? "billed" : "on_credit";

    setOrderForm({
      po_no: o.po_no || "",
      company_inv_no: o.company_inv_no || "",
      vehicle_no: o.vehicle_no || "",
      transaction_date: o.transaction_date,
      stock_status: stockStatus,
      payment_status: paymentStatus,
      credit_due_date: o.credit_due_date || "",
      paid_from_bank_account_id: o.paid_from_bank_account_id || bankAccounts[0]?.id || "",
      billed_date: o.billed_date || new Date().toISOString().split("T")[0],
      vendor_account_id: o.vendor_account_id || vendorAccounts[0]?.id || "",
      payment_voucher: o.payment_voucher || "",
      paid_amount: String(o.paid_amount ?? 0),
    });

    if (o.sell_in_lines && o.sell_in_lines.length > 0) {
      setOrderLines(
        o.sell_in_lines.map((l: any) => ({
          category_id: l.product?.category_id || "",
          product_id: l.product_id,
          qty: l.qty,
          rate: l.rate,
          billed_amount: l.bill_amount || l.rate * l.qty,
          packing_qty: l.packing_qty || 1,
        }))
      );
    } else {
      // Fetch lines if not pre-attached
      try {
        const fetchedLines = await getSellInLines(o.id);
        setOrderLines(
          fetchedLines.map((l: any) => ({
            category_id: l.product?.category_id || "",
            product_id: l.product_id,
            qty: l.qty,
            rate: l.rate,
            billed_amount: l.bill_amount || l.rate * l.qty,
            packing_qty: l.packing_qty || 1,
          }))
        );
      } catch (e) {
        setOrderLines([]);
      }
    }
    setShowOrderModal(true);
  };

  const addLineToForm = () => {
    setOrderLines((prev) => [
      ...prev,
      { category_id: "", product_id: "", qty: 1, rate: 0, billed_amount: 0, packing_qty: 1 },
    ]);
  };

  const removeLineFromForm = (index: number) => {
    setOrderLines((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLineForm = (index: number, key: keyof FormLineItem, val: any) => {
    setOrderLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const updated = { ...line, [key]: val };
        if (key === "product_id") {
          const prod = products.find((p: any) => p.id === val);
          if (prod) {
            updated.rate = prod.purchase_rate || 0;
            updated.packing_qty = prod.packing_qty || 1;
            updated.billed_amount = updated.rate * updated.qty;
          }
        } else if (key === "qty" || key === "rate") {
          updated.billed_amount = Number(updated.rate) * Number(updated.qty);
        }
        return updated;
      })
    );
  };

  const submitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const validLines = orderLines.filter((l) => l.product_id && l.qty > 0);

        let targetStatus: "in_progress" | "stock_arrived" | "on_credit" | "billed";
        if (orderForm.payment_status === "on_credit") {
          targetStatus = "on_credit";
        } else if (orderForm.payment_status === "billed") {
          targetStatus = "billed";
        } else {
          targetStatus = orderForm.stock_status;
        }

        const payload: any = {
          po_no: orderForm.po_no,
          company_inv_no: orderForm.company_inv_no,
          vehicle_no: orderForm.vehicle_no,
          transaction_date: orderForm.transaction_date,
          status: targetStatus,
        };

        if (orderForm.payment_status === "on_credit") {
          payload.credit_due_date = orderForm.credit_due_date;
          payload.vendor_account_id = orderForm.vendor_account_id || undefined;
          payload.payment_voucher = orderForm.payment_voucher || undefined;
          payload.paid_amount = parseFloat(orderForm.paid_amount) || 0;
          payload.billed_date = orderForm.billed_date || new Date().toISOString().split("T")[0];
        } else if (orderForm.payment_status === "billed") {
          payload.paid_from_bank_account_id = orderForm.paid_from_bank_account_id || undefined;
          payload.billed_date = orderForm.billed_date || new Date().toISOString().split("T")[0];
          if (orderForm.vendor_account_id || editingOrder?.vendor_account_id) {
            payload.vendor_account_id = orderForm.vendor_account_id || editingOrder?.vendor_account_id;
          }
          if (orderForm.payment_voucher || editingOrder?.payment_voucher) {
            payload.payment_voucher = orderForm.payment_voucher || editingOrder?.payment_voucher;
          }
          const totalOrderBill = validLines.reduce((sum, l) => sum + (Number(l.rate) * Number(l.qty)), 0);
          payload.paid_amount = parseFloat(orderForm.paid_amount) || totalOrderBill;
        }

        if (editingOrder) {
          await updateSellInOrderWithLines(editingOrder.id, payload, validLines);
        } else {
          await createSellInOrderWithLines(payload, validLines);
        }
        setShowOrderModal(false);
        router.refresh();
      } catch (err: any) {
        alert(err.message);
      }
    });
  };

    const isAllSelected = filtered.length > 0 && filtered.every((o) => selectedIds.includes(o.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) setSelectedIds([]);
    else setSelectedIds(filtered.map((o) => o.id));
  };

  const handleBulkDelete = () => {
    if (!selectedIds.length) return;
    if (!confirm(`Delete ${selectedIds.length} selected purchase order(s)?`)) return;
    startTransition(async () => {
      try {
        await deleteSellInOrders(selectedIds);
        setSelectedIds([]);
        router.refresh();
      } catch (err: any) {
        alert(err.message);
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this purchase order and all its line items?")) return;
    startTransition(async () => {
      try {
        await deleteSellInOrder(id);
        router.refresh();
      } catch (err: any) {
        alert(err.message);
      }
    });
  };

  // ---- VIEW PO LINES MODAL (Ordered Qty, Arrived Qty, Amount, Returned Qty) ----
  const openViewModal = async (order: any) => {
    setViewOrder(order);
    setLoadingViewLines(true);
    setShowViewModal(true);
    try {
      const fetched = await getSellInLines(order.id);
      const mapped: ViewLineItem[] = fetched.map((l: any) => {
        const isReturnable = Boolean(
          l.product?.product_categories?.is_returnable || l.product?.is_returnable
        );
        const isRgb = Boolean(
          l.product?.product_categories?.is_rgb || l.product?.is_rgb
        );
        const sal = Array.isArray(l.sell_in_arrived_lines)
          ? l.sell_in_arrived_lines[0]
          : l.sell_in_arrived_lines;

        const arrivedVal = sal?.arrived_qty ?? l.qty;
        const returnedVal = sal?.returned_qty ?? 0;
        const returnedAmtVal = sal?.returned_amt ?? 0;

        return {
          lineId: l.id,
          name: l.product?.product_name || "Product",
          orderedQty: l.qty,
          arrivedQty: String(arrivedVal),
          amount: Number(l.bill_amount || l.rate * l.qty || 0),
          returnedQty: String(returnedVal),
          returnedAmt: String(returnedAmtVal),
          isReturnable,
          isRgb,
        };
      });
      setViewLines(mapped);
    } finally {
      setLoadingViewLines(false);
    }
  };

  const updateViewLine = (
    idx: number,
    field: "arrivedQty" | "returnedQty" | "returnedAmt",
    val: string
  ) => {
    setViewLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, [field]: val } : l))
    );
  };

  const submitViewLines = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        await markSellInArrived(
          viewOrder.id,
          viewLines.map((l) => ({
            lineId: l.lineId,
            arrivedQty: parseFloat(l.arrivedQty) || 0,
            returnedQty: parseFloat(l.returnedQty) || 0,
            returnedAmt: parseFloat(l.returnedAmt) || 0,
          }))
        );
        setShowViewModal(false);
        router.refresh();
      } catch (err: any) {
        alert(err.message);
      }
    });
  };

  const selectCls =
    "w-full h-[32px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-2.5 text-xs text-[var(--text-primary)] shadow-[var(--shadow-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-ring)]";

  return (
    <div className="space-y-5">
      {/* ---- SEPARATE FILTERS BAR ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-50 p-3 rounded-xl border border-zinc-200">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search Bar */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Search:</span>
            <Input
              type="text"
              placeholder="PO No or Payment Voucher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-52 text-xs bg-white"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Status:</span>
            <select
              className="h-9 rounded-lg border border-zinc-300 px-3 text-xs bg-white font-medium"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses (Pending & Arrived)</option>
              <option value="in_progress">Pending (In Progress)</option>
              <option value="stock_arrived">Stock Arrived</option>
            </select>
          </div>

          {/* Payment Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Payment:</span>
            <select
              className="h-9 rounded-lg border border-zinc-300 px-3 text-xs bg-white font-medium"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
            >
              <option value="all">All Payments</option>
              <option value="on_credit">On-Credit</option>
              <option value="billed">Billed</option>
            </select>
          </div>

          {(statusFilter !== "all" || paymentFilter !== "all" || searchQuery.trim() !== "") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter("all");
                setPaymentFilter("all");
                setSearchQuery("");
              }}
              className="text-xs text-zinc-500 hover:text-zinc-800"
            >
              Reset Filters
            </Button>
          )}
        </div>

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
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5 whitespace-nowrap"
            >
              <Trash2 className="h-4 w-4" />
              Delete ({selectedIds.length})
            </Button>
          )}
          <Button onClick={openAddOrder}>+ New Purchase Order</Button>
        </div>
      </div>

      {/* ---- PURCHASE ORDERS TABLE (§3.4) ---- */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-center"><input type="checkbox" checked={isAllSelected} onChange={handleToggleSelectAll} className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4" /></TableHead>
              <TableHead>PO No</TableHead>
              <TableHead>Payment Voucher</TableHead>
              <TableHead>Invoice No</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Order Date</TableHead>
              <TableHead>Products</TableHead>
              <TableHead className="text-right">Tot Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-zinc-400 py-8">
                  No purchase orders found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((order) => {
                const productsSummary =
                  order.sell_in_lines && order.sell_in_lines.length > 0
                    ? order.sell_in_lines
                        .map((l: any) => `${l.product?.product_name || "Product"}×${l.qty}`)
                        .join(", ")
                    : "—";

                const totAmount =
                  order.sell_in_lines && order.sell_in_lines.length > 0
                    ? order.sell_in_lines.reduce(
                        (sum: number, l: any) =>
                          sum + (Number(l.bill_amount || l.net_bill_amount || l.qty * l.rate) || 0),
                        0
                      )
                    : 0;

                return (
                  <TableRow key={order.id} className="hover:bg-zinc-50/60">
                    <TableCell className="font-mono font-bold text-xs text-[var(--primary)]">
                      {order.po_no}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-zinc-700">
                      {order.payment_voucher || "—"}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-zinc-600">
                      {order.company_inv_no || "—"}
                    </TableCell>
                    <TableCell className="text-xs">{order.vehicle_no || "—"}</TableCell>
                    <TableCell className="text-xs">{order.transaction_date}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs font-medium text-zinc-700" title={productsSummary}>
                      {productsSummary}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-xs">
                      Rs. {totAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell>
                      <PaymentBadge
                        status={order.status}
                        paidAmount={order.paid_amount}
                        totAmount={totAmount}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end items-center">
                        <Button size="sm" variant="ghost" onClick={() => openViewModal(order)}>
                          View
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEditOrder(order)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => handleDelete(order.id)}
                          disabled={isPending}
                        >
                          Del
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ---- ADD / EDIT PURCHASE ORDER MODAL (§3.3) ---- */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
              <h3 className="text-base font-bold text-zinc-900">
                {editingOrder ? "Edit Purchase Order" : "Add Purchase Order"}
              </h3>
              <button
                onClick={() => setShowOrderModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 text-lg"
              >
                ×
              </button>
            </div>

            <form onSubmit={submitOrder} className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                    PO No *
                  </label>
                  <Input
                    value={orderForm.po_no}
                    onChange={(e) => setOrderForm((f) => ({ ...f, po_no: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                    Invoice No (CCBPL)
                  </label>
                  <Input
                    value={orderForm.company_inv_no}
                    onChange={(e) => setOrderForm((f) => ({ ...f, company_inv_no: e.target.value }))}
                    placeholder="e.g. gi982312"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                    Vehicle No
                  </label>
                  <Input
                    value={orderForm.vehicle_no}
                    onChange={(e) => setOrderForm((f) => ({ ...f, vehicle_no: e.target.value }))}
                    placeholder="e.g. TLA-4521"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                    Order Date
                  </label>
                  <Input
                    type="date"
                    value={orderForm.transaction_date}
                    onChange={(e) => setOrderForm((f) => ({ ...f, transaction_date: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                    Payment Status
                  </label>
                  <select
                    className={selectCls}
                    value={orderForm.payment_status}
                    onChange={(e) =>
                      setOrderForm((f) => ({
                        ...f,
                        payment_status: e.target.value as "on_credit" | "billed",
                      }))
                    }
                  >
                    <option value="on_credit">On-Credit</option>
                    <option value="billed">Billed</option>
                  </select>
                </div>
              </div>

              {/* Conditional Payment details */}
              {orderForm.payment_status === "on_credit" && (() => {
                const totalBilled = orderLines.reduce((sum, l) => sum + (Number(l.billed_amount) || 0), 0);
                const paidVal = parseFloat(orderForm.paid_amount) || 0;
                const outstandingVal = Math.max(0, totalBilled - paidVal);

                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-amber-900 mb-1">
                          Vendor Account *
                        </label>
                        <select
                          className={selectCls}
                          value={orderForm.vendor_account_id}
                          onChange={(e) => setOrderForm((f) => ({ ...f, vendor_account_id: e.target.value }))}
                          required
                        >
                          <option value="">— Select vendor account —</option>
                          {vendorAccounts.map((a: any) => (
                            <option key={a.id} value={a.id}>
                              {a.vendor_name} ({a.account_title})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-amber-900 mb-1">
                          Payment Voucher No
                        </label>
                        <Input
                          value={orderForm.payment_voucher}
                          onChange={(e) => setOrderForm((f) => ({ ...f, payment_voucher: e.target.value }))}
                          placeholder="e.g. 02323244221"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-amber-900 mb-1">
                          Paid Amount (Rs. )
                        </label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={orderForm.paid_amount}
                          onChange={(e) => setOrderForm((f) => ({ ...f, paid_amount: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-amber-900 mb-1">
                          Payment Date
                        </label>
                        <Input
                          type="date"
                          value={orderForm.billed_date}
                          onChange={(e) => setOrderForm((f) => ({ ...f, billed_date: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-amber-900 mb-1">
                          Outstanding Amount (Rs. )
                        </label>
                        <div className="h-[32px] px-2.5 flex items-center font-mono font-bold text-xs bg-amber-100/60 border border-amber-300 rounded-[var(--radius-sm)] text-amber-900">
                          Rs. {outstandingVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-amber-900 mb-1">
                          Credit Due Date *
                        </label>
                        <Input
                          type="date"
                          value={orderForm.credit_due_date}
                          onChange={(e) => setOrderForm((f) => ({ ...f, credit_due_date: e.target.value }))}
                          required
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {orderForm.payment_status === "billed" && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-green-800 mb-1">
                      Pay From Bank Account *
                    </label>
                    <select
                      className={selectCls}
                      value={orderForm.paid_from_bank_account_id}
                      onChange={(e) =>
                        setOrderForm((f) => ({ ...f, paid_from_bank_account_id: e.target.value }))
                      }
                      required
                    >
                      <option value="">— Select account —</option>
                      {bankAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.bank_name} ({a.account_title}) — Rs.{" "}
                          {Number(a.current_balance).toLocaleString()}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-green-800 mb-1">
                      Billed Date
                    </label>
                    <Input
                      type="date"
                      value={orderForm.billed_date}
                      onChange={(e) => setOrderForm((f) => ({ ...f, billed_date: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              {/* Product Lines inside PO creation form */}
              <div className="border border-zinc-200 rounded-xl p-4 bg-zinc-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-zinc-700 uppercase tracking-wide">
                    Product Order Lines
                  </h4>
                  <Button type="button" size="sm" variant="outline" onClick={addLineToForm}>
                    + Add Product
                  </Button>
                </div>

                {orderLines.length === 0 ? (
                  <p className="text-xs text-zinc-400 py-4 text-center">
                    No products added yet. Click "+ Add Product" to add lines.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {orderLines.map((line, idx) => {
                      const categoryProducts = line.category_id
                        ? products.filter((p: any) => p.category_id === line.category_id)
                        : products;

                      return (
                        <div
                          key={idx}
                          className="grid grid-cols-12 gap-2 items-center bg-white p-3 rounded-lg border border-zinc-200 shadow-sm"
                        >
                          <div className="col-span-3">
                            <label className="block text-[10px] text-zinc-400 mb-0.5">Category</label>
                            <select
                              className={selectCls}
                              value={line.category_id}
                              onChange={(e) => updateLineForm(idx, "category_id", e.target.value)}
                            >
                              <option value="">— All Heads —</option>
                              {categories.map((c: any) => (
                                <option key={c.id} value={c.id}>
                                  {c.title}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-4">
                            <label className="block text-[10px] text-zinc-400 mb-0.5">Product *</label>
                            <select
                              className={selectCls}
                              value={line.product_id}
                              onChange={(e) => updateLineForm(idx, "product_id", e.target.value)}
                              required
                            >
                              <option value="">— Select Product —</option>
                              {categoryProducts.map((p: any) => (
                                <option key={p.id} value={p.id}>
                                  {p.product_name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-[10px] text-zinc-400 mb-0.5">Qty *</label>
                            <Input
                              type="number"
                              min="1"
                              value={line.qty}
                              onChange={(e) =>
                                updateLineForm(idx, "qty", parseFloat(e.target.value) || 0)
                              }
                              required
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-[10px] text-zinc-400 mb-0.5">Billed Amt (Rs. )</label>
                            <Input
                              type="number"
                              step="0.01"
                              value={line.billed_amount}
                              onChange={(e) =>
                                updateLineForm(idx, "billed_amount", parseFloat(e.target.value) || 0)
                              }
                            />
                          </div>
                          <div className="col-span-1 text-right pt-4">
                            <button
                              type="button"
                              onClick={() => removeLineFromForm(idx)}
                              className="text-red-500 hover:text-red-700 font-bold text-sm"
                              title="Remove item"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex justify-between items-center pt-2 border-t border-zinc-200 text-xs">
                  <span className="font-semibold text-zinc-600">Total Billed Amount:</span>
                  <span className="font-mono font-bold text-sm text-[var(--primary)]">
                    Rs. 
                    {orderLines
                      .reduce((sum, l) => sum + (Number(l.billed_amount) || 0), 0)
                      .toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="submit" className="flex-1" disabled={isPending}>
                  {isPending ? "Saving..." : "Save Purchase Order"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowOrderModal(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---- VIEW PO LINES MODAL (§3.5) ---- */}
      {showViewModal && viewOrder && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-6">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
              <div>
                <h3 className="text-base font-bold text-zinc-900">
                  Purchase Order — {viewOrder.po_no}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Invoice No: <span className="font-mono">{viewOrder.company_inv_no || "—"}</span> · Status:{" "}
                  <StatusBadge status={viewOrder.status} />
                </p>
              </div>
              <button
                onClick={() => setShowViewModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 text-lg"
              >
                ×
              </button>
            </div>

            {loadingViewLines ? (
              <div className="py-16 text-center text-zinc-400 text-sm">Loading PO lines"</div>
            ) : viewLines.length === 0 ? (
              <div className="py-16 text-center text-zinc-400 text-sm">No line items on this order.</div>
            ) : (
              <form onSubmit={submitViewLines}>
                <div className="p-6 space-y-4">
                  <div className="bg-zinc-50 rounded-xl border border-zinc-200 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-zinc-100">
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Ordered Qty</TableHead>
                          <TableHead className="text-right">Arrived Qty</TableHead>
                          <TableHead className="text-right">Amount (Rs. )</TableHead>
                          <TableHead className="text-right">Returned Qty</TableHead>
                          <TableHead className="text-right">Return Amt (Rs. )</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {viewLines.map((line, idx) => (
                          <TableRow key={line.lineId}>
                            <TableCell className="font-medium text-xs text-zinc-900">
                              {line.name}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-zinc-500">
                              {line.orderedQty}
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.arrivedQty}
                                onChange={(e) => updateViewLine(idx, "arrivedQty", e.target.value)}
                                className="w-24 text-right font-mono text-xs ml-auto"
                                required
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold text-xs text-zinc-800">
                              Rs. {fmtAmt(line.amount)}
                            </TableCell>
                            <TableCell className="text-right">
                              {line.isReturnable ? (
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={line.returnedQty}
                                  onChange={(e) => updateViewLine(idx, "returnedQty", e.target.value)}
                                  className="w-24 text-right font-mono text-xs ml-auto border-blue-300 focus:border-blue-500 bg-blue-50/50"
                                  placeholder="0"
                                />
                              ) : (
                                <span className="text-zinc-300 text-xs text-center block">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {line.isRgb ? (
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={line.returnedAmt}
                                  onChange={(e) => updateViewLine(idx, "returnedAmt", e.target.value)}
                                  className="w-24 text-right font-mono text-xs ml-auto border-emerald-300 focus:border-emerald-500 bg-emerald-50/50"
                                  placeholder="0.00"
                                />
                              ) : (
                                <span className="text-zinc-300 text-xs text-center block">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-[11px] text-zinc-400 italic">
                    * Returned Qty is only enabled for Returnable Heads. Arrived Qty updates stock levels on the Warehouse page. Amount remains fixed.
                  </p>
                </div>

                <div className="flex gap-3 px-6 pb-6 border-t border-zinc-100 pt-4">
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={isPending}
                    style={{ background: "var(--primary)", color: "#fff" }}
                  >
                    {isPending ? "Saving..." : "Save & Update Stock"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowViewModal(false)}>
                    Close
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SellInClient(props: Props) {
  return (
    <Suspense fallback={<div className="p-8 text-center text-zinc-400">Loading Sell-In...</div>}>
      <SellInContent {...props} />
    </Suspense>
  );
}
