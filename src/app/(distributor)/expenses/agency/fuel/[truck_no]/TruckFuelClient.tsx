"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { ExportButtons } from "@/components/export/ExportButtons";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/Table";
import {
  createFuelEntry, updateFuelEntry, deleteFuelEntry, deleteFuelEntries, getLastFuelReading, getDriverForTruck,
} from "@/lib/actions/fuel";

interface Props {
  truckNo:        string;
  initialFrom:    string;
  initialTo:      string;
  initialEntries: any[];
  bankAccounts:   any[];
  defaultDriver?: string;
  isLoader?:      boolean;
}

const blankForm = (truckNo: string, defaultDriver: string = "") => ({
  truck_no:        truckNo,
  driver_name:     defaultDriver,
  entry_date:      new Date().toISOString().split("T")[0],
  initial_reading: "",
  final_reading:   "",
  fuel_liters:     "",
  amount:          "",
  bank_account_id: "",
});

export function TruckFuelClient({
  truckNo,
  initialFrom,
  initialTo,
  initialEntries,
  bankAccounts,
  defaultDriver = "",
  isLoader = false,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dateFrom, setDateFrom] = useState(initialFrom);
  const [dateTo,   setDateTo]   = useState(initialTo);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm(truckNo, defaultDriver));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const sf = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const bankAccountOptions = useMemo(() => [
    { value: "", label: "— No bank account —" },
    ...bankAccounts.map((b: any) => ({
      value: b.id,
      label: `${b.bank_name} — ${b.account_title}`,
      sub: b.account_number,
    })),
  ], [bankAccounts]);

  const dist = (parseFloat(form.final_reading) || 0) - (parseFloat(form.initial_reading) || 0);
  const eff  = dist > 0 && parseFloat(form.fuel_liters) > 0
    ? (dist / parseFloat(form.fuel_liters)).toFixed(2) : null;

  const filtered = initialEntries.filter((e) => {
    if (dateFrom && e.entry_date < dateFrom) return false;
    if (dateTo   && e.entry_date > dateTo)   return false;
    return true;
  });

  const totalAmount   = filtered.reduce((s, e) => s + (Number(e.amount)      || 0), 0);
  const totalFuel     = filtered.reduce((s, e) => s + (Number(e.fuel_liters) || 0), 0);
  const totalDistance = filtered.reduce((s, e) => s + Math.max(0, (Number(e.final_reading) || 0) - (Number(e.initial_reading) || 0)), 0);
  const overallKmL    = totalFuel > 0 ? (totalDistance / totalFuel) : null;

  const exportData = isLoader
    ? filtered.map((e) => ({
        Date: e.entry_date,
        Loader: e.driver_name || defaultDriver || "",
        "Fuel (L)": e.fuel_liters,
        "Amount (Rs.)": e.amount,
      }))
    : filtered.map((e) => ({
        Date:            e.entry_date,
        "Initial (km)":  e.initial_reading,
        "Final (km)":    e.final_reading,
        "Distance (km)": Math.max(0, (Number(e.final_reading) || 0) - (Number(e.initial_reading) || 0)).toFixed(1),
        "Fuel (L)":      e.fuel_liters,
        "Amount (Rs.)":  e.amount,
        "km/L":          Number(e.fuel_liters) > 0
          ? (Math.max(0, (Number(e.final_reading) || 0) - (Number(e.initial_reading) || 0)) / Number(e.fuel_liters)).toFixed(2)
          : "",
      }));

  const applyFilter = () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo)   params.set("to",   dateTo);
    if (isLoader) params.set("type", "loader");
    if (defaultDriver) params.set("name", defaultDriver);
    router.push(`/expenses/agency/fuel/${encodeURIComponent(truckNo)}${params.toString() ? "?" + params.toString() : ""}`);
  };

  const openAdd = async () => {
    let driver = defaultDriver;
    if (!driver) {
      driver = await getDriverForTruck(truckNo);
    }
    const init = blankForm(truckNo, driver);
    if (!isLoader) {
      const last = await getLastFuelReading(truckNo);
      if (last != null) init.initial_reading = String(last);
    }
    if (!init.driver_name && filtered.length > 0) {
      const latest = filtered[0];
      if (latest.driver_name) init.driver_name = latest.driver_name;
    }
    setEditingId(null);
    setForm(init);
    setShowModal(true);
  };

  const openEdit = (e: any) => {
    setEditingId(e.id);
    setForm({
      truck_no:        e.truck_no || truckNo,
      driver_name:     e.driver_name || defaultDriver || "",
      entry_date:      e.entry_date,
      initial_reading: e.initial_reading != null ? String(e.initial_reading) : "",
      final_reading:   e.final_reading != null ? String(e.final_reading) : "",
      fuel_liters:     String(e.fuel_liters),
      amount:          String(e.amount),
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
    if (!confirm(`Delete ${selectedIds.length} selected fuel record(s)?`)) return;
    startTransition(async () => {
      try {
        await deleteFuelEntries(selectedIds);
        setSelectedIds([]);
        router.refresh();
      } catch (err: any) { alert(err.message); }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this fuel entry?")) return;
    startTransition(async () => {
      try { await deleteFuelEntry(id); router.refresh(); }
      catch (err: any) { alert(err.message); }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const payload = {
          truck_no:        form.truck_no,
          driver_name:     form.driver_name || undefined,
          entry_date:      form.entry_date,
          initial_reading: isLoader ? 0 : parseFloat(form.initial_reading),
          final_reading:   isLoader ? 0 : parseFloat(form.final_reading),
          fuel_liters:     parseFloat(form.fuel_liters),
          amount:          parseFloat(form.amount),
          bank_account_id: form.bank_account_id || undefined,
          vehicle_type:    isLoader ? "loader" : "delivery",
        };
        if (editingId) await updateFuelEntry(editingId, payload);
        else           await createFuelEntry(payload);
        setShowModal(false);
        router.refresh();
      } catch (err: any) { alert(err.message); }
    });
  };

  const fmt = (n: number) =>
    "Rs. " + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/expenses/agency?head=Fuel")} className="text-zinc-400 hover:text-zinc-700 transition-colors text-sm">
          ← Back
        </button>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">
            Fuel Records — {truckNo}
          </h1>
          <p className="text-zinc-500 mt-0.5 text-sm">
            {isLoader ? `Per-entry fuel expense log for loader ${defaultDriver || truckNo}.` : "Per-entry odometer log for this truck."}
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
          <ExportButtons data={exportData} filename={`fuel_${truckNo}`} />
        </div>
        <Button onClick={openAdd} disabled={isPending}>+ Add Fuel Record</Button>
      </div>

      {filtered.length > 0 && (
        isLoader ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-lg border border-zinc-200 p-3 text-center">
              <p className="text-xs text-zinc-400 mb-0.5">Total Amount</p>
              <p className="font-bold text-sm" style={{ color: "var(--primary)" }}>{fmt(totalAmount)}</p>
            </div>
            <div className="bg-white rounded-lg border border-zinc-200 p-3 text-center">
              <p className="text-xs text-zinc-400 mb-0.5">Total Fuel (L)</p>
              <p className="font-bold text-sm" style={{ color: "var(--primary)" }}>{totalFuel.toFixed(2)}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Amount",   val: fmt(totalAmount) },
              { label: "Total Fuel (L)", val: totalFuel.toFixed(2) },
              { label: "Total Distance", val: `${totalDistance.toFixed(1)} km` },
              { label: "Avg km/L",       val: overallKmL != null ? overallKmL.toFixed(2) : "—" },
            ].map(({ label, val }) => (
              <div key={label} className="bg-white rounded-lg border border-zinc-200 p-3 text-center">
                <p className="text-xs text-zinc-400 mb-0.5">{label}</p>
                <p className="font-bold text-sm" style={{ color: "var(--primary)" }}>{val}</p>
              </div>
            ))}
          </div>
        )
      )}

      <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            {isLoader ? (
              <TableRow>
                <TableHead className="w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleToggleSelectAll}
                    className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4"
                  />
                </TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Loader</TableHead>
                <TableHead className="text-right">Fuel (L)</TableHead>
                <TableHead className="text-right">Amount (Rs.)</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            ) : (
              <TableRow>
                <TableHead className="w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleToggleSelectAll}
                    className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4"
                  />
                </TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead className="text-right">Initial (km)</TableHead>
                <TableHead className="text-right">Final (km)</TableHead>
                <TableHead className="text-right">Distance</TableHead>
                <TableHead className="text-right">Fuel (L)</TableHead>
                <TableHead className="text-right">Amount (Rs.)</TableHead>
                <TableHead className="text-right">km/L</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            )}
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isLoader ? 6 : 10} className="text-center text-zinc-400 py-10">
                  No fuel entries for this {isLoader ? "loader" : "truck"} in the selected period
                </TableCell>
              </TableRow>
            ) : filtered.map((e) => {
              const d    = Math.max(0, (Number(e.final_reading) || 0) - (Number(e.initial_reading) || 0));
              const fl   = Number(e.fuel_liters) || 0;
              const kml  = fl > 0 ? d / fl : null;
              return (
                <TableRow key={e.id} className={selectedIds.includes(e.id) ? "bg-red-50/50" : ""}>
                  <TableCell className="w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(e.id)}
                      onChange={() => setSelectedIds(prev => prev.includes(e.id) ? prev.filter(id => id !== e.id) : [...prev, e.id])}
                      className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4"
                    />
                  </TableCell>
                  <TableCell>{e.entry_date}</TableCell>
                  <TableCell>{e.driver_name || defaultDriver || "—"}</TableCell>
                  {!isLoader && (
                    <>
                      <TableCell className="text-right">{e.initial_reading != null ? Number(e.initial_reading).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-right">{e.final_reading != null ? Number(e.final_reading).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-right font-medium">{d > 0 ? `${d.toFixed(1)} km` : "—"}</TableCell>
                    </>
                  )}
                  <TableCell className="text-right">{fl.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(Number(e.amount))}</TableCell>
                  {!isLoader && (
                    <TableCell className="text-right text-zinc-500">{kml != null ? kml.toFixed(2) : "—"}</TableCell>
                  )}
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="outline" onClick={() => openEdit(e)}>Edit</Button>
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
            })}
          </TableBody>
        </Table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl p-6">
            <h3 className="text-lg font-bold text-zinc-900 mb-4">
              {editingId ? "Edit Fuel Entry" : "Add Fuel Entry"} — {truckNo}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {isLoader ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Loader No</label>
                      <Input value={form.truck_no} readOnly className="bg-zinc-50 font-mono" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Loader</label>
                      <Input value={form.driver_name} readOnly className="bg-zinc-50" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Entry Date *</label>
                    <Input type="date" value={form.entry_date} onChange={(e) => sf("entry_date", e.target.value)} required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Fuel (L) *</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.fuel_liters}
                        onChange={(e) => sf("fuel_liters", e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Amount (Rs.) *</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.amount}
                        onChange={(e) => sf("amount", e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  {!editingId && (
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Bank Account (for ledger)</label>
                      <SearchableSelect
                        options={bankAccountOptions}
                        value={form.bank_account_id}
                        onChange={(val) => sf("bank_account_id", val)}
                        placeholder="— No bank account —"
                        searchPlaceholder="Search bank account..."
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Truck No</label>
                      <Input value={form.truck_no} readOnly className="bg-zinc-50" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Driver</label>
                      <Input value={form.driver_name} onChange={(e) => sf("driver_name", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Entry Date *</label>
                    <Input type="date" value={form.entry_date} onChange={(e) => sf("entry_date", e.target.value)} required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Initial Reading (km) *</label>
                      <Input type="number" step="0.1" min="0" value={form.initial_reading}
                        onChange={(e) => sf("initial_reading", e.target.value)} required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Final Reading (km) *</label>
                      <Input type="number" step="0.1" min="0" value={form.final_reading}
                        onChange={(e) => sf("final_reading", e.target.value)} required />
                    </div>
                  </div>
                  {dist > 0 && (
                    <div className="grid grid-cols-2 gap-4 bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-xs">
                      <div><p className="text-zinc-400">Distance Covered</p><p className="font-semibold">{dist.toFixed(1)} km</p></div>
                      {eff && <div><p className="text-zinc-400">Efficiency</p><p className="font-semibold">{eff} km/L</p></div>}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Fuel (L) *</label>
                      <Input type="number" step="0.01" min="0" value={form.fuel_liters}
                        onChange={(e) => sf("fuel_liters", e.target.value)} required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Amount (Rs.) *</label>
                      <Input type="number" step="0.01" min="0" value={form.amount}
                        onChange={(e) => sf("amount", e.target.value)} required />
                    </div>
                  </div>
                  {!editingId && (
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Bank Account (for ledger)</label>
                      <SearchableSelect
                        options={bankAccountOptions}
                        value={form.bank_account_id}
                        onChange={(val) => sf("bank_account_id", val)}
                        placeholder="— No bank account —"
                        searchPlaceholder="Search bank account..."
                      />
                    </div>
                  )}
                </>
              )}
              <div className="flex gap-2 pt-1">
                <Button type="submit" className="flex-1" disabled={isPending}>
                  {isPending ? "Saving…" : "Save Entry"}
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

