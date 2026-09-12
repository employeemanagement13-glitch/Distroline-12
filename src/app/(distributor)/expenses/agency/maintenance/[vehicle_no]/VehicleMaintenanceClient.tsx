"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { ExportButtons } from "@/components/export/ExportButtons";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/Table";
import {
  createMaintenanceEntry,
  updateMaintenanceEntry,
  deleteMaintenanceEntry,
  deleteMaintenanceEntries,
  getDriverForVehicle,
  MaintenanceEntry,
} from "@/lib/actions/maintenance";

interface Props {
  vehicleNo: string;
  initialFrom: string;
  initialTo: string;
  initialEntries: MaintenanceEntry[];
  bankAccounts: any[];
  defaultDriver?: string;
}

const blankForm = (vehicleNo: string, defaultDriver: string = "") => ({
  vehicle_no: vehicleNo,
  driver_name: defaultDriver,
  entry_date: new Date().toISOString().split("T")[0],
  description: "",
  amount: "",
  bank_account_id: "",
});

export function VehicleMaintenanceClient({
  vehicleNo,
  initialFrom,
  initialTo,
  initialEntries,
  bankAccounts,
  defaultDriver = "",
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dateFrom, setDateFrom] = useState(initialFrom);
  const [dateTo, setDateTo] = useState(initialTo);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm(vehicleNo, defaultDriver));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const sf = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const filtered = initialEntries.filter((e) => {
    if (dateFrom && e.entry_date < dateFrom) return false;
    if (dateTo && e.entry_date > dateTo) return false;
    return true;
  });

  const totalAmount = filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const exportData = filtered.map((e) => ({
    Date: e.entry_date,
    Driver: e.driver_name || defaultDriver || "",
    Description: e.description,
    "Amount (Rs.)": e.amount,
  }));

  const applyFilter = () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (defaultDriver) params.set("name", defaultDriver);
    router.push(`/expenses/agency/maintenance/${encodeURIComponent(vehicleNo)}${params.toString() ? "?" + params.toString() : ""}`);
  };

  const openAdd = async () => {
    let driver = defaultDriver;
    if (!driver) {
      driver = await getDriverForVehicle(vehicleNo);
    }
    const init = blankForm(vehicleNo, driver);
    if (!init.driver_name && filtered.length > 0) {
      const latest = filtered[0];
      if (latest.driver_name) init.driver_name = latest.driver_name;
    }
    setEditingId(null);
    setForm(init);
    setShowModal(true);
  };

  const openEdit = (e: MaintenanceEntry) => {
    setEditingId(e.id);
    setForm({
      vehicle_no: e.vehicle_no || vehicleNo,
      driver_name: e.driver_name || defaultDriver || "",
      entry_date: e.entry_date,
      description: e.description || "",
      amount: String(e.amount),
      bank_account_id: e.bank_account_id || "",
    });
    setShowModal(true);
  };

  const isAllSelected = filtered.length > 0 && filtered.every((e) => selectedIds.includes(e.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) setSelectedIds([]);
    else setSelectedIds(filtered.map((e) => e.id));
  };

  const handleBulkDelete = () => {
    if (!selectedIds.length) return;
    if (!confirm(`Delete ${selectedIds.length} selected maintenance record(s)?`)) return;
    startTransition(async () => {
      try {
        await deleteMaintenanceEntries(selectedIds);
        setSelectedIds([]);
        router.refresh();
      } catch (err: any) {
        alert(err.message);
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this maintenance record?")) return;
    startTransition(async () => {
      try {
        await deleteMaintenanceEntry(id);
        router.refresh();
      } catch (err: any) {
        alert(err.message);
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const payload = {
          vehicle_no: form.vehicle_no,
          driver_name: form.driver_name || undefined,
          entry_date: form.entry_date,
          description: form.description,
          amount: parseFloat(form.amount),
          bank_account_id: form.bank_account_id || undefined,
        };
        if (editingId) await updateMaintenanceEntry(editingId, payload);
        else await createMaintenanceEntry(payload);
        setShowModal(false);
        router.refresh();
      } catch (err: any) {
        alert(err.message);
      }
    });
  };

  const fmt = (n: number) =>
    "Rs. " + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-zinc-400 hover:text-zinc-700 transition-colors text-sm">
          ← Back
        </button>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">
            Maintenance Records — {vehicleNo}
          </h1>
          <p className="text-zinc-500 mt-0.5 text-sm">
            Per-entry maintenance expense log for {defaultDriver ? `${defaultDriver} (${vehicleNo})` : vehicleNo}.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 items-center flex-wrap">
          <label className="text-xs font-medium text-zinc-500">From</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
          <label className="text-xs font-medium text-zinc-500">To</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
          <Button variant="outline" size="sm" onClick={applyFilter}>Apply</Button>
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
          <ExportButtons data={exportData} filename={`maintenance_${vehicleNo}`} />
        </div>
        <Button onClick={openAdd} disabled={isPending}>+ Add Maintenance Record</Button>
      </div>

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-sm">
          <div className="bg-white rounded-lg border border-zinc-200 p-3 text-center">
            <p className="text-xs text-zinc-400 mb-0.5">Total Amount</p>
            <p className="font-bold text-sm" style={{ color: "var(--primary)" }}>{fmt(totalAmount)}</p>
          </div>
          <div className="bg-white rounded-lg border border-zinc-200 p-3 text-center">
            <p className="text-xs text-zinc-400 mb-0.5">Total Entries</p>
            <p className="font-bold text-sm text-zinc-800">{filtered.length}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleToggleSelectAll}
                  className="rounded border-zinc-300 text-red-600 focus:ring-red-500 cursor-pointer"
                />
              </TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount (Rs.)</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-zinc-400">
                  No maintenance records found for this period
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((e) => {
                const isSelected = selectedIds.includes(e.id);
                return (
                  <TableRow key={e.id} className={isSelected ? "bg-red-50/40" : ""}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          if (isSelected) setSelectedIds(selectedIds.filter((id) => id !== e.id));
                          else setSelectedIds([...selectedIds, e.id]);
                        }}
                        className="rounded border-zinc-300 text-red-600 focus:ring-red-500 cursor-pointer"
                      />
                    </TableCell>
                    <TableCell className="font-medium text-xs text-zinc-700">{e.entry_date}</TableCell>
                    <TableCell className="text-xs text-zinc-600">{e.driver_name || defaultDriver || "—"}</TableCell>
                    <TableCell className="text-sm font-medium text-zinc-800">{e.description}</TableCell>
                    <TableCell className="text-right font-mono font-semibold" style={{ color: "var(--primary)" }}>
                      {fmt(Number(e.amount))}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => openEdit(e)} disabled={isPending}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => handleDelete(e.id)}
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

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl p-6">
            <h3 className="text-lg font-bold text-zinc-900 mb-4">
              {editingId ? "Edit Maintenance Entry" : "Add Maintenance Record"} — {vehicleNo}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Vehicle No</label>
                  <Input value={form.vehicle_no} readOnly className="bg-zinc-50 font-mono" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Driver</label>
                  <Input value={form.driver_name} onChange={(e) => sf("driver_name", e.target.value)} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Date *</label>
                <Input type="date" value={form.entry_date} onChange={(e) => sf("entry_date", e.target.value)} required />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Description *</label>
                <Input
                  type="text"
                  placeholder="e.g. Engine Oil Change, Brake Pad, Tyre Replacement"
                  value={form.description}
                  onChange={(e) => sf("description", e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Amount (Rs.) *</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => sf("amount", e.target.value)}
                  required
                />
              </div>

              {!editingId && (
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Bank Account (for ledger)</label>
                  <select
                    className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white"
                    value={form.bank_account_id}
                    onChange={(e) => sf("bank_account_id", e.target.value)}
                  >
                    <option value="">— No bank account —</option>
                    {bankAccounts.map((b: any) => (
                      <option key={b.id} value={b.id}>{b.bank_name} — {b.account_title}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)} disabled={isPending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : editingId ? "Save Changes" : "Add Record"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
