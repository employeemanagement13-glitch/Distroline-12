"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ExportButtons } from "@/components/export/ExportButtons";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/Table";
import { addDeposit, updateDeposit, deleteDeposit, deleteDeposits } from "@/lib/actions/cash";

interface Props {
  initialDeposits: any[];
  bankAccounts: any[];
}

function sourceLabel(item: any): string {
  if (item.source) return item.source;
  if (!item.for_date) return "Manual";
  const d = new Date(item.for_date + "T00:00:00");
  const day = d.getDate();
  const month = d.toLocaleString("default", { month: "long" });
  return `${day} ${month} Sales`;
}

export function DepositsClient({ initialDeposits, bankAccounts }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const today = new Date().toISOString().split("T")[0];
  const firstDayOfMonth = `${today.substring(0, 8)}01`;
  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(today);

  const blankForm = () => ({
    deposit_date: new Date().toISOString().split("T")[0],
    amount: "",
    description: "",
    bank_account_id: bankAccounts[0]?.id || "",
    bank_ref_no: "",
    for_date: new Date().toISOString().split("T")[0],
    status: "deposited",
    amount_change_reason: "",
  });

  const [form, setForm] = useState(blankForm());
  const [originalAmount, setOriginalAmount] = useState<number | null>(null);

  const allDeposits = [...initialDeposits].sort(
    (a, b) => a.deposit_date < b.deposit_date ? -1 : a.deposit_date > b.deposit_date ? 1 : 0
  );

  const resetForm = () => { setForm(blankForm()); setOriginalAmount(null); };
  // Filter deposits by date range
  const filteredDeposits = allDeposits.filter((d) => {
    if (!d.deposit_date) return false;
    return d.deposit_date >= fromDate && d.deposit_date <= toDate;
  });


  const selectedAccount = bankAccounts.find((a) => a.id === form.bank_account_id);
  const bankLabel = selectedAccount
    ? `${selectedAccount.bank_name} (${selectedAccount.account_title})`
    : "— ";

  const handleEditClick = (item: any) => {
    setEditingItem(item);
    setOriginalAmount(Number(item.amount));
    setForm({
      deposit_date: item.deposit_date,
      amount: String(item.amount),
      description: item.description || "",
      bank_account_id: item.bank_account_id || bankAccounts[0]?.id || "",
      bank_ref_no: item.bank_ref_no || "",
      for_date: item.for_date,
      status: item.status,
      amount_change_reason: item.amount_change_reason || "",
    });
    setShowModal(true);
  };

    const isAllSelected = filteredDeposits.length > 0 && filteredDeposits.every((d) => selectedIds.includes(d.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) setSelectedIds([]);
    else setSelectedIds(filteredDeposits.map((d) => d.id));
  };

  const handleBulkDelete = () => {
    if (!selectedIds.length) return;
    if (!confirm(`Delete ${selectedIds.length} selected deposit record(s)?`)) return;
    startTransition(async () => {
      try {
        await deleteDeposits(selectedIds);
        setSelectedIds([]);
        router.refresh();
      } catch (err: any) {
        alert(err.message);
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this deposit record?")) return;
    startTransition(async () => {
      try { await deleteDeposit(id); router.refresh(); }
      catch (err: any) { alert(err.message); }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || !form.deposit_date || !form.for_date) return;
    if (!form.description.trim()) {
      alert("Description is required.");
      return;
    }
    const currentAmount = parseFloat(form.amount);
    const amountChanged = originalAmount !== null && originalAmount !== currentAmount;

    startTransition(async () => {
      try {
        const payload: any = {
          deposit_date: form.deposit_date,
          amount: currentAmount,
          description: form.description.trim(),
          bank_account_id: form.bank_account_id || undefined,
          bank_ref_no: form.bank_ref_no.trim() || undefined,
          for_date: form.deposit_date,
          status: form.status,
        };
        if (amountChanged) payload.amount_change_reason = form.amount_change_reason.trim();        if (editingItem) await updateDeposit(editingItem.id, payload);
        else await addDeposit(payload);
        setShowModal(false);
        setEditingItem(null);
        resetForm();
        router.refresh();
      } catch (err: any) { alert(err.message); }
    });
  };

  // Totals based on filtered data
  const totalDeposited = filteredDeposits
    .filter((d) => d.status === "deposited")
    .reduce((s, d) => s + Number(d.amount || 0), 0);
  const totalPending = filteredDeposits
    .filter((d) => d.status === "pending")
    .reduce((s, d) => s + Number(d.amount || 0), 0);

  const exportData = filteredDeposits.map((d) => ({
    "Deposit Date": d.deposit_date,
    Source: sourceLabel(d),
    Description: d.description || "",
    Amount: d.amount,
    "Bank Account": d.bank_account_id ? bankAccounts.find((a) => a.id === d.bank_account_id)?.account_title : (d.bank_name || ""),
    "Bank Ref No": d.bank_ref_no || "",
    Status: d.status,
    "Change Reason": d.amount_change_reason || "",
  }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center p-2 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-zinc-600">From</label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-zinc-600">To</label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 text-sm" />
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
          </div>
          <ExportButtons data={exportData} filename="cash_deposits" />
        </div>
        <Button onClick={() => { setEditingItem(null); resetForm(); setShowModal(true); }}>
          + Add Deposit Record
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-center"><input type="checkbox" checked={isAllSelected} onChange={handleToggleSelectAll} className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4" /></TableHead>
              <TableHead>Deposit Date</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount (Rs.)</TableHead>
              <TableHead>Bank Account</TableHead>
              <TableHead>Bank Ref No</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDeposits.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-zinc-400 py-8">No deposits recorded for selected dates</TableCell>
              </TableRow>
            ) : filteredDeposits.map((item) => {
              const acct = bankAccounts.find((a) => a.id === item.bank_account_id);
              return (
                <TableRow key={item.id} className={selectedIds.includes(item.id) ? "bg-red-50/50" : ""}>
                  <TableCell className="w-10 text-center"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => setSelectedIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])} className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4" /></TableCell>
                  <TableCell>{item.deposit_date}</TableCell>
                  <TableCell>
                    <span className="text-zinc-600 font-medium text-xs">{sourceLabel(item)}</span>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-800 max-w-xs truncate" title={item.description || ""}>
                    {item.description || <span className="text-zinc-400">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    Rs. {Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    {item.amount_change_reason && (
                      <div className="text-xs text-red-500 italic mt-0.5">Reason: {item.amount_change_reason}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {acct ? (
                      <div>
                        <div className="font-medium">{acct.bank_name}</div>
                        <div className="text-zinc-400">{acct.account_title}</div>
                      </div>
                    ) : item.bank_name || <span className="text-zinc-400">— </span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{item.bank_ref_no || <span className="text-zinc-400">— </span>}</TableCell>
                  <TableCell>
                    <Badge variant={item.status === "deposited" ? "success" : "warning"}>{item.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => handleEditClick(item)}>Edit</Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                        onClick={() => handleDelete(item.id)} disabled={isPending}>Delete</Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-zinc-900 mb-4">
              {editingItem ? "Edit Deposit" : "Add Deposit Record"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Deposit Date *</label>
                <Input type="date" value={form.deposit_date}
                  onChange={(e) => setForm({ ...form, deposit_date: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Description *</label>
                <Input
                  placeholder="e.g. Daily sales collection deposit"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Amount (Rs.) *</label>
                <Input type="number" min="0.01" step="0.01" value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              </div>            {editingItem && originalAmount !== parseFloat(form.amount) && (
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Reason for Amount Change</label>
                  <Input placeholder="Describe reason for adjustment..." value={form.amount_change_reason}
                    onChange={(e) => setForm({ ...form, amount_change_reason: e.target.value })} />
                </div>
              )}
              {/* Bank Account dropdown */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Bank Account</label>
                {bankAccounts.length > 0 ? (
                  <select
                    className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white"
                    value={form.bank_account_id}
                    onChange={(e) => setForm({ ...form, bank_account_id: e.target.value })}
                  >
                    <option value="">— Select account —</option>
                    {bankAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.bank_name} ({a.account_title})</option>
                    ))}
                  </select>
                ) : (
                  <Input placeholder="No bank accounts configured" readOnly className="bg-zinc-50 text-zinc-400" />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Bank Ref No</label>
                <Input placeholder="e.g. HBL-TXN-8845" value={form.bank_ref_no}
                  onChange={(e) => setForm({ ...form, bank_ref_no: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Status</label>
                <select
                  className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="pending">Pending</option>
                  <option value="deposited">Deposited</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" className="flex-1" disabled={isPending}>
                  {isPending ? "Saving..." : "Save Record"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

