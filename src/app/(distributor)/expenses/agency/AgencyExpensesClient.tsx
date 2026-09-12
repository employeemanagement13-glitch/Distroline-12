"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { ExportButtons } from "@/components/export/ExportButtons";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/Table";
import {
  createFuelEntry, updateFuelEntry, deleteFuelEntry, getLastFuelReading,
} from "@/lib/actions/fuel";
import {
  createBill, deleteBill, deleteBills,
  createEntertainment, deleteEntertainment, deleteEntertainments,
  createPetty, deletePetty, deletePetties,
  createPenalty, deletePenalty, deleteAgencyPenalties,
} from "@/lib/actions/expenses";

interface Employee { id: string; full_name: string; role: string; }
interface DmRoute  { id: string; truck_no: string; route_name: string; dm_name?: string; personnel?: string; dm?: { full_name: string }; }

interface Props {
  employees:          Employee[];
  dmRoutes:           DmRoute[];
  loaders?:           any[];
  salaryRows:         any[];
  fuelEntries:        any[];
  maintenanceEntries?: any[];
  billsRows:          any[];
  entertainmentRows:  any[];
  pettyRows:          any[];
  penaltiesRows:      any[];
  bankAccounts:       any[];
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const CURRENT_YEAR  = new Date().getFullYear();
const YEARS         = Array.from({ length: 5 }, (_, i) => String(CURRENT_YEAR - i));
const CURRENT_MONTH = MONTHS[new Date().getMonth()];

const TODAY = new Date().toISOString().split("T")[0];
const FIRST_DAY_OF_MONTH = `${TODAY.substring(0, 8)}01`;

function getExpenseRowDate(r: any): string {
  if (r.expense_date) return String(r.expense_date).slice(0, 10);
  if (r.date) return String(r.date).slice(0, 10);
  if (r.salary_month) return String(r.salary_month).slice(0, 10);
  if (r.month && r.year) {
    const mIdx = MONTHS.findIndex((m) => m.toLowerCase() === r.month?.trim().toLowerCase());
    const mStr = mIdx >= 0 ? String(mIdx + 1).padStart(2, "0") : "01";
    return `${r.year}-${mStr}-01`;
  }
  return "";
}

function DateRangeFilter({
  fromDate,
  toDate,
  onFromDate,
  onToDate,
}: {
  fromDate: string;
  toDate: string;
  onFromDate: (d: string) => void;
  onToDate: (d: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-semibold text-zinc-600">From</label>
        <Input
          type="date"
          value={fromDate}
          onChange={(e) => onFromDate(e.target.value)}
          className="h-8 text-sm w-36"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-semibold text-zinc-600">To</label>
        <Input
          type="date"
          value={toDate}
          onChange={(e) => onToDate(e.target.value)}
          className="h-8 text-sm w-36"
        />
      </div>
    </div>
  );
}

type HeadKey = "Salary" | "Fuel" | "Maintenance" | "Bills" | "Entertainment" | "Petty" | "Penalties";

export function AgencyExpensesClient({
  employees, dmRoutes, loaders = [], salaryRows, fuelEntries, maintenanceEntries = [],
  billsRows, entertainmentRows, pettyRows, penaltiesRows, bankAccounts,
}: Props) {
  const searchParams = useSearchParams();
  const paramHead = searchParams.get("head") as HeadKey | null;
  const heads: HeadKey[] = ["Salary","Fuel","Maintenance","Bills","Entertainment","Petty","Penalties"];
  const [activeHead, setActiveHead] = useState<HeadKey>(
    paramHead && heads.includes(paramHead) ? paramHead : "Salary"
  );

  useEffect(() => {
    if (paramHead && heads.includes(paramHead)) {
      setActiveHead(paramHead);
    }
  }, [paramHead]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Agency Expenses</h1>
        <p className="text-zinc-500 mt-1 text-sm">Track all agency running costs across expense categories.</p>
      </div>

      <div className="flex gap-1 bg-zinc-100 rounded-lg p-1 flex-wrap">
        {heads.map((h) => (
          <button key={h} onClick={() => setActiveHead(h)}
            className={[
              "px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-150",
              activeHead === h
                ? "bg-white shadow-sm font-semibold"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-white/60",
            ].join(" ")}
            style={activeHead === h ? { color: "var(--primary)" } : {}}
          >
            {h}
          </button>
        ))}
      </div>

      {activeHead === "Salary"        && <SalaryHead rows={salaryRows} />}
      {activeHead === "Fuel"          && <FuelHead initialEntries={fuelEntries} dmRoutes={dmRoutes} loaders={loaders} />}
      {activeHead === "Maintenance"   && <MaintenanceHead initialEntries={maintenanceEntries} dmRoutes={dmRoutes} loaders={loaders} bankAccounts={bankAccounts} />}
      {activeHead === "Bills"         && <BillsHead rows={billsRows} bankAccounts={bankAccounts} />}
      {activeHead === "Entertainment" && <EntertainmentHead rows={entertainmentRows} bankAccounts={bankAccounts} />}
      {activeHead === "Petty"         && <PettyHead rows={pettyRows} bankAccounts={bankAccounts} />}
      {activeHead === "Penalties"     && <PenaltiesHead rows={penaltiesRows} bankAccounts={bankAccounts} />}
    </div>
  );
}

function SalaryHead({ rows }: { rows: any[] }) {
  const [fromDate, setFromDate] = useState(FIRST_DAY_OF_MONTH);
  const [toDate, setToDate]     = useState(TODAY);

  const filtered = rows.filter((r) => {
    const d = getExpenseRowDate(r);
    if (!d) return true;
    return d >= fromDate && d <= toDate;
  });

  const exportData = filtered.map((r) => ({
    "Emp Code": r.employee_code || "",
    Name: r.name || r.employee_name || r.full_name || "",
    Role: r.role || "",
    Month: r.month,
    Year: r.year,
    "Net Payable (Rs.)": r.net_payable,
    Source: "Payroll Run — auto",
  }));

  const total = filtered.reduce((s, r) => s + (Number(r.net_payable) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 items-center flex-wrap">
          <DateRangeFilter fromDate={fromDate} toDate={toDate} onFromDate={setFromDate} onToDate={setToDate} />
          <ExportButtons data={exportData} filename="salary_expenses" />
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2">
          <span>🔒</span>
          <span>Auto-populated from Payroll Runs — not manually editable</span>
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="bg-white rounded-lg border border-zinc-200 p-4 flex justify-between items-center">
          <p className="text-sm text-zinc-500">Total Net Payable ({fromDate} to {toDate})</p>
          <p className="text-xl font-bold" style={{ color: "var(--primary)" }}>
            Rs. {total.toLocaleString()}
          </p>
        </div>
      )}

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Month</TableHead>
              <TableHead>Year</TableHead>
              <TableHead className="text-right">Net Payable (Rs.)</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <EmptyRow colSpan={7} label="No payroll runs for this period — run Payroll in Employee Management" />
            ) : (
              filtered.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{r.employee_code || "—"}</TableCell>
                  <TableCell className="font-medium">{r.name || r.employee_name || r.full_name || "—"}</TableCell>
                  <TableCell><RoleBadge role={r.role || ""} /></TableCell>
                  <TableCell>{r.month}</TableCell>
                  <TableCell>{r.year}</TableCell>
                  <TableCell className="text-right font-mono font-semibold" style={{ color: "var(--primary)" }}>
                    {fmt(r.net_payable)}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-400">Payroll Run — auto</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}

const BLANK_FUEL = {
  truck_no: "", driver_name: "",
  entry_date: new Date().toISOString().split("T")[0],
  initial_reading: "", final_reading: "",
  fuel_liters: "", amount: "",
};

function FuelHead({ initialEntries, dmRoutes, loaders = [] }: { initialEntries: any[]; dmRoutes: any[]; loaders?: any[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [vehicleTab, setVehicleTab] = useState<"delivery" | "loader">("delivery");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");

  const filtered = initialEntries.filter((e) => {
    if (dateFrom && e.entry_date < dateFrom) return false;
    if (dateTo   && e.entry_date > dateTo)   return false;
    return true;
  });

  const fromLabel  = dateFrom || "All";
  const toLabel    = dateTo   || "All";

  // 1. Delivery Vehicles aggregation
  const trucksMap = new Map<string, {
    truck_no: string;
    driver_name: string;
    totalDistance: number;
    totalFuel: number;
    totalAmount: number;
    minInitial: number | null;
    maxFinal: number | null;
  }>();

  dmRoutes.forEach((r) => {
    if (r.truck_no && !trucksMap.has(r.truck_no)) {
      const driver = r.dm?.full_name || r.dm_name || r.personnel || "";
      trucksMap.set(r.truck_no, {
        truck_no: r.truck_no,
        driver_name: driver,
        totalDistance: 0, totalFuel: 0, totalAmount: 0,
        minInitial: null, maxFinal: null,
      });
    }
  });

  // Loader number set for partition
  const loaderNumberSet = new Set(loaders.map((l) => l.number).filter(Boolean));

  filtered.forEach((e) => {
    if (e.vehicle_type === "loader" || loaderNumberSet.has(e.truck_no)) return;
    if (!trucksMap.has(e.truck_no)) {
      trucksMap.set(e.truck_no, {
        truck_no: e.truck_no,
        driver_name: e.driver_name || "",
        totalDistance: 0, totalFuel: 0, totalAmount: 0,
        minInitial: null, maxFinal: null,
      });
    }
    const t = trucksMap.get(e.truck_no)!;
    const init = Number(e.initial_reading) || 0;
    const fin  = Number(e.final_reading)   || 0;
    t.totalDistance += Math.max(0, fin - init);
    t.totalFuel     += Number(e.fuel_liters) || 0;
    t.totalAmount   += Number(e.amount)      || 0;
    if (t.minInitial === null || init < t.minInitial) t.minInitial = init;
    if (t.maxFinal   === null || fin  > t.maxFinal)   t.maxFinal   = fin;
    if (!t.driver_name && e.driver_name) t.driver_name = e.driver_name;
  });

  const trucks = Array.from(trucksMap.values());
  const deliveryGrandTotal = trucks.reduce((s, t) => s + t.totalAmount, 0);

  const deliveryExportData = trucks.map((t) => ({
    "Truck No":       t.truck_no,
    Driver:           t.driver_name || "",
    "From":           fromLabel,
    "To":             toLabel,
    "Initial (km)":   t.minInitial ?? "",
    "Final (km)":     t.maxFinal   ?? "",
    "Distance (km)":  t.totalDistance.toFixed(1),
    "Fuel (L)":       t.totalFuel.toFixed(2),
    "Amount (Rs.)":   t.totalAmount.toFixed(2),
    "km/L":           t.totalFuel > 0 ? (t.totalDistance / t.totalFuel).toFixed(2) : "",
  }));

  const handleViewTruck = (truckNo: string, driverName?: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo)   params.set("to",   dateTo);
    if (driverName) params.set("name", driverName);
    router.push(`/expenses/agency/fuel/${encodeURIComponent(truckNo)}${params.toString() ? "?" + params.toString() : ""}`);
  };

  // 2. Load Vehicles aggregation
  const loadersMap = new Map<string, {
    loader_no: string;
    loader_name: string;
    totalFuel: number;
    totalAmount: number;
  }>();

  loaders.forEach((l) => {
    if (l.number && !loadersMap.has(l.number)) {
      loadersMap.set(l.number, {
        loader_no: l.number,
        loader_name: l.loader?.full_name || "",
        totalFuel: 0,
        totalAmount: 0,
      });
    }
  });

  filtered.forEach((e) => {
    if (e.vehicle_type === "loader" || loaderNumberSet.has(e.truck_no)) {
      if (!loadersMap.has(e.truck_no)) {
        loadersMap.set(e.truck_no, {
          loader_no: e.truck_no,
          loader_name: e.driver_name || "",
          totalFuel: 0,
          totalAmount: 0,
        });
      }
      const l = loadersMap.get(e.truck_no)!;
      l.totalFuel   += Number(e.fuel_liters) || 0;
      l.totalAmount += Number(e.amount)      || 0;
      if (!l.loader_name && e.driver_name) l.loader_name = e.driver_name;
    }
  });

  const loadVehicles = Array.from(loadersMap.values());
  const loaderGrandTotal = loadVehicles.reduce((s, l) => s + l.totalAmount, 0);

  const loaderExportData = loadVehicles.map((l) => ({
    "Loader No":    l.loader_no,
    "Loader":       l.loader_name || "",
    "From":         fromLabel,
    "To":           toLabel,
    "Fuel (L)":     l.totalFuel.toFixed(2),
    "Amount (Rs.)": l.totalAmount.toFixed(2),
  }));

  const handleViewLoader = (loaderNo: string, loaderName: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo)   params.set("to",   dateTo);
    params.set("type", "loader");
    if (loaderName) params.set("name", loaderName);
    router.push(`/expenses/agency/fuel/${encodeURIComponent(loaderNo)}${params.toString() ? "?" + params.toString() : ""}`);
  };

  return (
    <div className="space-y-4">
      {/* 2 Switch Tabs */}
      <div
        className="inline-flex rounded-full p-[3px] gap-[2px]"
        style={{ background: "var(--surface-hover, #f4f4f5)" }}
      >
        <button
          type="button"
          onClick={() => setVehicleTab("delivery")}
          className="px-4 py-1.5 text-xs font-semibold rounded-full transition-all duration-200"
          style={
            vehicleTab === "delivery"
              ? { background: "var(--primary)", color: "#fff", boxShadow: "0 1px 4px rgba(229,30,42,0.25)" }
              : { color: "var(--text-secondary, #6b7280)", background: "transparent" }
          }
        >
          1: Delivery Vehicles
        </button>
        <button
          type="button"
          onClick={() => setVehicleTab("loader")}
          className="px-4 py-1.5 text-xs font-semibold rounded-full transition-all duration-200"
          style={
            vehicleTab === "loader"
              ? { background: "var(--primary)", color: "#fff", boxShadow: "0 1px 4px rgba(229,30,42,0.25)" }
              : { color: "var(--text-secondary, #6b7280)", background: "transparent" }
          }
        >
          2: Load Vehicles
        </button>
      </div>

      {vehicleTab === "delivery" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2 items-center flex-wrap">
              <label className="text-xs font-medium text-zinc-500">From</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
              <label className="text-xs font-medium text-zinc-500">To</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
              <ExportButtons data={deliveryExportData} filename="fuel_delivery_vehicles" />
            </div>
          </div>

          {trucks.length > 0 && deliveryGrandTotal > 0 && (
            <div className="bg-white rounded-lg border border-zinc-200 p-3 flex justify-between text-sm">
              <span className="text-zinc-500">Total Fuel Cost (filtered period)</span>
              <span className="font-bold" style={{ color: "var(--primary)" }}>
                Rs. {deliveryGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Truck No</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>From - To</TableHead>
                  <TableHead className="text-right">Initial (km)</TableHead>
                  <TableHead className="text-right">Final (km)</TableHead>
                  <TableHead className="text-right">Distance</TableHead>
                  <TableHead className="text-right">Fuel (L)</TableHead>
                  <TableHead className="text-right">Amount (Rs.)</TableHead>
                  <TableHead className="text-right">km/L</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trucks.length === 0 ? (
                  <EmptyRow colSpan={10} label="No delivery trucks or fuel entries for this period" />
                ) : (
                  trucks.map((t) => {
                    const kmPerL = t.totalFuel > 0 ? t.totalDistance / t.totalFuel : null;
                    const hasEntries = t.totalFuel > 0 || t.totalAmount > 0;
                    return (
                      <TableRow key={t.truck_no}>
                        <TableCell className="font-mono font-medium">{t.truck_no}</TableCell>
                        <TableCell>{t.driver_name || "—"}</TableCell>
                        <TableCell className="text-xs text-zinc-400">{fromLabel} - {toLabel}</TableCell>
                        <TableCell className="text-right">{hasEntries && t.minInitial != null ? Number(t.minInitial).toLocaleString() : "—"}</TableCell>
                        <TableCell className="text-right">{hasEntries && t.maxFinal != null ? Number(t.maxFinal).toLocaleString() : "—"}</TableCell>
                        <TableCell className="text-right font-medium">{hasEntries ? `${t.totalDistance.toFixed(1)} km` : "—"}</TableCell>
                        <TableCell className="text-right">{hasEntries ? t.totalFuel.toFixed(2) : "—"}</TableCell>
                        <TableCell className="text-right font-mono">{hasEntries ? fmt(t.totalAmount) : "—"}</TableCell>
                        <TableCell className="text-right text-zinc-500">{kmPerL != null ? kmPerL.toFixed(2) : "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => handleViewTruck(t.truck_no, t.driver_name)}>View</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableCard>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2 items-center flex-wrap">
              <label className="text-xs font-medium text-zinc-500">From</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
              <label className="text-xs font-medium text-zinc-500">To</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
              <ExportButtons data={loaderExportData} filename="fuel_load_vehicles" />
            </div>
          </div>

          {loadVehicles.length > 0 && loaderGrandTotal > 0 && (
            <div className="bg-white rounded-lg border border-zinc-200 p-3 flex justify-between text-sm">
              <span className="text-zinc-500">Total Fuel Cost (filtered period)</span>
              <span className="font-bold" style={{ color: "var(--primary)" }}>
                Rs. {loaderGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loader No</TableHead>
                  <TableHead>Loader</TableHead>
                  <TableHead>From - To</TableHead>
                  <TableHead className="text-right">Fuel (L)</TableHead>
                  <TableHead className="text-right">Amount (Rs.)</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadVehicles.length === 0 ? (
                  <EmptyRow colSpan={6} label="No loaders or fuel entries for this period" />
                ) : (
                  loadVehicles.map((l) => {
                    const hasEntries = l.totalFuel > 0 || l.totalAmount > 0;
                    return (
                      <TableRow key={l.loader_no}>
                        <TableCell className="font-mono font-medium">{l.loader_no}</TableCell>
                        <TableCell>{l.loader_name || "—"}</TableCell>
                        <TableCell className="text-xs text-zinc-400">{fromLabel} - {toLabel}</TableCell>
                        <TableCell className="text-right">{hasEntries ? l.totalFuel.toFixed(2) : "—"}</TableCell>
                        <TableCell className="text-right font-mono">{hasEntries ? fmt(l.totalAmount) : "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => handleViewLoader(l.loader_no, l.loader_name)}>
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableCard>
        </div>
      )}
    </div>
  );
}

function MaintenanceHead({
  initialEntries,
  dmRoutes,
  loaders = [],
  bankAccounts,
}: {
  initialEntries: any[];
  dmRoutes: any[];
  loaders?: any[];
  bankAccounts: any[];
}) {
  const router = useRouter();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = initialEntries.filter((e) => {
    if (dateFrom && e.entry_date < dateFrom) return false;
    if (dateTo && e.entry_date > dateTo) return false;
    return true;
  });

  const fromLabel = dateFrom || "All";
  const toLabel = dateTo || "All";

  const vehiclesMap = new Map<string, {
    vehicle_no: string;
    driver_name: string;
    totalAmount: number;
    entriesCount: number;
  }>();

  dmRoutes.forEach((r) => {
    if (r.truck_no && !vehiclesMap.has(r.truck_no)) {
      const driver = r.dm?.full_name || r.dm_name || r.personnel || "";
      vehiclesMap.set(r.truck_no, {
        vehicle_no: r.truck_no,
        driver_name: driver,
        totalAmount: 0,
        entriesCount: 0,
      });
    }
  });

  loaders.forEach((l) => {
    if (l.number && !vehiclesMap.has(l.number)) {
      const driver = l.loader?.full_name || "";
      vehiclesMap.set(l.number, {
        vehicle_no: l.number,
        driver_name: driver,
        totalAmount: 0,
        entriesCount: 0,
      });
    }
  });

  filtered.forEach((e) => {
    if (!vehiclesMap.has(e.vehicle_no)) {
      vehiclesMap.set(e.vehicle_no, {
        vehicle_no: e.vehicle_no,
        driver_name: e.driver_name || "",
        totalAmount: 0,
        entriesCount: 0,
      });
    }
    const v = vehiclesMap.get(e.vehicle_no)!;
    v.totalAmount += Number(e.amount) || 0;
    v.entriesCount += 1;
    if (!v.driver_name && e.driver_name) v.driver_name = e.driver_name;
  });

  const vehicles = Array.from(vehiclesMap.values());
  const grandTotal = vehicles.reduce((s, v) => s + v.totalAmount, 0);

  const exportData = vehicles.map((v) => ({
    "Vehicle No": v.vehicle_no,
    Driver: v.driver_name || "",
    From: fromLabel,
    To: toLabel,
    "Amount (Rs.)": v.totalAmount.toFixed(2),
  }));

  const handleViewVehicle = (vehicleNo: string, driverName?: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (driverName) params.set("name", driverName);
    router.push(`/expenses/agency/maintenance/${encodeURIComponent(vehicleNo)}${params.toString() ? "?" + params.toString() : ""}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 items-center flex-wrap">
          <label className="text-xs font-medium text-zinc-500">From</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
          <label className="text-xs font-medium text-zinc-500">To</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
          <ExportButtons data={exportData} filename="maintenance_vehicles" />
        </div>
      </div>

      {vehicles.length > 0 && grandTotal > 0 && (
        <div className="bg-white rounded-lg border border-zinc-200 p-3 flex justify-between text-sm">
          <span className="text-zinc-500">Total Maintenance Cost (filtered period)</span>
          <span className="font-bold" style={{ color: "var(--primary)" }}>
            Rs. {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
      )}

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle No</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>From - To</TableHead>
              <TableHead className="text-right">Amount (Rs.)</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicles.length === 0 ? (
              <EmptyRow colSpan={5} label="No vehicles or maintenance entries for this period" />
            ) : (
              vehicles.map((v) => {
                const hasEntries = v.totalAmount > 0 || v.entriesCount > 0;
                return (
                  <TableRow key={v.vehicle_no}>
                    <TableCell className="font-mono font-medium">{v.vehicle_no}</TableCell>
                    <TableCell>{v.driver_name || "—"}</TableCell>
                    <TableCell className="text-xs text-zinc-400">{fromLabel} - {toLabel}</TableCell>
                    <TableCell className="text-right font-mono font-semibold" style={{ color: "var(--primary)" }}>
                      {hasEntries ? fmt(v.totalAmount) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => handleViewVehicle(v.vehicle_no, v.driver_name)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}

function BankSelect({ value, onChange, bankAccounts }: { value: string; onChange: (v: string) => void; bankAccounts: any[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full h-9 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm focus-visible:outline-none">
      <option value="">— No bank account —</option>
      {bankAccounts.map((b: any) => (
        <option key={b.id} value={b.id}>{b.bank_name} — {b.account_title}</option>
      ))}
    </select>
  );
}

function BillsHead({ rows, bankAccounts }: { rows: any[]; bankAccounts: any[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fromDate, setFromDate]       = useState(FIRST_DAY_OF_MONTH);
  const [toDate, setToDate]           = useState(TODAY);
  const [showModal, setShowModal]     = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [form, setForm] = useState({ bill_name: "", expense_date: TODAY, month: CURRENT_MONTH, year: String(CURRENT_YEAR), amount: "", bank_account_id: "" });

  const filtered = rows.filter((r) => {
    const d = getExpenseRowDate(r);
    if (!d) return true;
    return d >= fromDate && d <= toDate;
  });
  const isAllSelected = filtered.length > 0 && filtered.every((r) => selectedIds.includes(r.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) setSelectedIds([]);
    else setSelectedIds(filtered.map((r) => r.id));
  };

  const handleBulkDelete = () => {
    if (!selectedIds.length) return;
    if (!confirm(`Delete ${selectedIds.length} selected bill(s)?`)) return;
    startTransition(async () => {
      try {
        await deleteBills(selectedIds);
        setSelectedIds([]);
        router.refresh();
      } catch (err: any) { alert(err.message); }
    });
  };
  const total    = filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const exportData = filtered.map((r) => ({ Bill: r.bill_name, Date: r.expense_date || "", Month: r.month, Year: r.year, "Amount (Rs.)": r.amount }));

  const handleSave = () => {
    if (!form.bill_name || !form.amount) return;
    startTransition(async () => {
      try {
        await createBill({ bill_name: form.bill_name, expense_date: form.expense_date, month: form.month, year: form.year, amount: parseFloat(form.amount), bank_account_id: form.bank_account_id || undefined });
        setShowModal(false);
        setForm({ bill_name: "", expense_date: TODAY, month: CURRENT_MONTH, year: String(CURRENT_YEAR), amount: "", bank_account_id: "" });
        router.refresh();
      } catch (err: any) { alert(err.message); }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this bill record?")) return;
    startTransition(async () => {
      try { await deleteBill(id); router.refresh(); }
      catch (err: any) { alert(err.message); }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 items-center flex-wrap">
          <DateRangeFilter fromDate={fromDate} toDate={toDate} onFromDate={setFromDate} onToDate={setToDate} />
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
          <ExportButtons data={exportData} filename="bills_expenses" />
        </div>
        <Button onClick={() => setShowModal(true)}>+ Add Bill</Button>
      </div>

      {filtered.length > 0 && (
        <div className="bg-white rounded-lg border border-zinc-200 p-3 flex justify-between text-sm">
          <span className="text-zinc-500">Total Bills ({fromDate} to {toDate})</span>
          <span className="font-bold" style={{ color: "var(--primary)" }}>{fmt(total)}</span>
        </div>
      )}

      <TableCard>
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-10 text-center"><input type="checkbox" checked={isAllSelected} onChange={handleToggleSelectAll} className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4" /></TableHead><TableHead>Bill Name</TableHead><TableHead>Date</TableHead><TableHead>Month</TableHead><TableHead>Year</TableHead>
            <TableHead className="text-right">Amount (Rs.)</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0
              ? <EmptyRow colSpan={7} label="No bill records for this period" />
              : filtered.map((r) => (
                <TableRow key={r.id} className={selectedIds.includes(r.id) ? "bg-red-50/50" : ""}>
                  <TableCell className="w-10 text-center"><input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => setSelectedIds(prev => prev.includes(r.id) ? prev.filter(id => id !== r.id) : [...prev, r.id])} className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4" /></TableCell>
                  <TableCell className="font-medium">{r.bill_name}</TableCell>
                  <TableCell className="text-xs font-mono">{r.expense_date || "—"}</TableCell>
                  <TableCell>{r.month}</TableCell><TableCell>{r.year}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(r.amount)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                      onClick={() => handleDelete(r.id)} disabled={isPending}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableCard>

      {showModal && (
        <Modal title="Add Bill" onClose={() => setShowModal(false)}>
          <div className="space-y-3">
            <Field label="Bill Name *">
              <Input placeholder="e.g. Electricity, Water, Rent" value={form.bill_name}
                onChange={(e) => setForm({ ...form, bill_name: e.target.value })} />
            </Field>
            <Field label="Date *">
              <Input type="date" value={form.expense_date}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
            </Field>
            <div className="flex gap-3">
              <div className="flex-1"><label className="label">Month</label><MonthSelect value={form.month} onChange={(v) => setForm({ ...form, month: v })} /></div>
              <div className="flex-1"><label className="label">Year</label><YearSelect value={form.year} onChange={(v) => setForm({ ...form, year: v })} /></div>
            </div>
            <Field label="Amount (Rs.) *">
              <Input type="number" min="0" placeholder="0" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Bank Account">
              <BankSelect value={form.bank_account_id} onChange={(v) => setForm({ ...form, bank_account_id: v })} bankAccounts={bankAccounts} />
            </Field>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSave} disabled={isPending}>{isPending ? "Saving..." : "Save Bill"}</Button>
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EntertainmentHead({ rows, bankAccounts }: { rows: any[]; bankAccounts: any[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fromDate, setFromDate]       = useState(FIRST_DAY_OF_MONTH);
  const [toDate, setToDate]           = useState(TODAY);
  const [showModal, setShowModal]     = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [form, setForm] = useState({ expense_date: TODAY, month: CURRENT_MONTH, year: String(CURRENT_YEAR), description: "", amount: "", bank_account_id: "" });

  const filtered = rows.filter((r) => {
    const d = getExpenseRowDate(r);
    if (!d) return true;
    return d >= fromDate && d <= toDate;
  });
  const isAllSelected = filtered.length > 0 && filtered.every((r) => selectedIds.includes(r.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) setSelectedIds([]);
    else setSelectedIds(filtered.map((r) => r.id));
  };

  const handleBulkDelete = () => {
    if (!selectedIds.length) return;
    if (!confirm(`Delete ${selectedIds.length} selected record(s)?`)) return;
    startTransition(async () => {
      try {
        await deleteEntertainments(selectedIds);
        setSelectedIds([]);
        router.refresh();
      } catch (err: any) { alert(err.message); }
    });
  };
  const total    = filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const exportData = filtered.map((r) => ({ Date: r.expense_date || "", Month: r.month, Year: r.year, Description: r.description, "Amount (Rs.)": r.amount }));

  const handleSave = () => {
    if (!form.description || !form.amount) return;
    startTransition(async () => {
      try {
        await createEntertainment({ expense_date: form.expense_date, month: form.month, year: form.year, description: form.description, amount: parseFloat(form.amount), bank_account_id: form.bank_account_id || undefined });
        setShowModal(false);
        setForm({ expense_date: TODAY, month: CURRENT_MONTH, year: String(CURRENT_YEAR), description: "", amount: "", bank_account_id: "" });
        router.refresh();
      } catch (err: any) { alert(err.message); }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this record?")) return;
    startTransition(async () => {
      try { await deleteEntertainment(id); router.refresh(); }
      catch (err: any) { alert(err.message); }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 items-center flex-wrap">
          <DateRangeFilter fromDate={fromDate} toDate={toDate} onFromDate={setFromDate} onToDate={setToDate} />
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
          <ExportButtons data={exportData} filename="entertainment_expenses" />
        </div>
        <Button onClick={() => setShowModal(true)}>+ Add Entertainment</Button>
      </div>

      {filtered.length > 0 && (
        <div className="bg-white rounded-lg border border-zinc-200 p-3 flex justify-between text-sm">
          <span className="text-zinc-500">Total Entertainment ({fromDate} to {toDate})</span>
          <span className="font-bold" style={{ color: "var(--primary)" }}>{fmt(total)}</span>
        </div>
      )}

      <TableCard>
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-10 text-center"><input type="checkbox" checked={isAllSelected} onChange={handleToggleSelectAll} className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4" /></TableHead><TableHead>Date</TableHead><TableHead>Month</TableHead><TableHead>Description</TableHead>
            <TableHead className="text-right">Amount (Rs.)</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0
              ? <EmptyRow colSpan={6} label="No entertainment records for this period" />
              : filtered.map((r) => (
                <TableRow key={r.id} className={selectedIds.includes(r.id) ? "bg-red-50/50" : ""}>
                  <TableCell className="w-10 text-center"><input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => setSelectedIds(prev => prev.includes(r.id) ? prev.filter(id => id !== r.id) : [...prev, r.id])} className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4" /></TableCell>
                  <TableCell className="text-xs font-mono">{r.expense_date || "—"}</TableCell>
                  <TableCell>{r.month}</TableCell>
                  <TableCell>{r.description}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(r.amount)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                      onClick={() => handleDelete(r.id)} disabled={isPending}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableCard>

      {showModal && (
        <Modal title="Add Entertainment" onClose={() => setShowModal(false)}>
          <div className="space-y-3">
            <Field label="Date *">
              <Input type="date" value={form.expense_date}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
            </Field>
            <div className="flex gap-3">
              <div className="flex-1"><label className="label">Month</label><MonthSelect value={form.month} onChange={(v) => setForm({ ...form, month: v })} /></div>
              <div className="flex-1"><label className="label">Year</label><YearSelect value={form.year} onChange={(v) => setForm({ ...form, year: v })} /></div>
            </div>
            <Field label="Description *">
              <Input placeholder="e.g. Client dinner, Office supplies" value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Amount (Rs.) *">
              <Input type="number" min="0" placeholder="0" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Bank Account">
              <BankSelect value={form.bank_account_id} onChange={(v) => setForm({ ...form, bank_account_id: v })} bankAccounts={bankAccounts} />
            </Field>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSave} disabled={isPending}>{isPending ? "Saving..." : "Save"}</Button>
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PettyHead({ rows, bankAccounts }: { rows: any[]; bankAccounts: any[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fromDate, setFromDate]       = useState(FIRST_DAY_OF_MONTH);
  const [toDate, setToDate]           = useState(TODAY);
  const [showModal, setShowModal]     = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [form, setForm] = useState({ expense_date: TODAY, month: CURRENT_MONTH, year: String(CURRENT_YEAR), description: "", amount: "", bank_account_id: "" });

  const filtered = rows.filter((r) => {
    const d = getExpenseRowDate(r);
    if (!d) return true;
    return d >= fromDate && d <= toDate;
  });
  const isAllSelected = filtered.length > 0 && filtered.every((r) => selectedIds.includes(r.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) setSelectedIds([]);
    else setSelectedIds(filtered.map((r) => r.id));
  };

  const handleBulkDelete = () => {
    if (!selectedIds.length) return;
    if (!confirm(`Delete ${selectedIds.length} selected record(s)?`)) return;
    startTransition(async () => {
      try {
        await deletePetties(selectedIds);
        setSelectedIds([]);
        router.refresh();
      } catch (err: any) { alert(err.message); }
    });
  };
  const total    = filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const exportData = filtered.map((r) => ({ Date: r.expense_date || "", Month: r.month, Year: r.year, Description: r.description, "Amount (Rs.)": r.amount }));

  const handleSave = () => {
    if (!form.description || !form.amount) return;
    startTransition(async () => {
      try {
        await createPetty({ expense_date: form.expense_date, month: form.month, year: form.year, description: form.description, amount: parseFloat(form.amount), bank_account_id: form.bank_account_id || undefined });
        setShowModal(false);
        setForm({ expense_date: TODAY, month: CURRENT_MONTH, year: String(CURRENT_YEAR), description: "", amount: "", bank_account_id: "" });
        router.refresh();
      } catch (err: any) { alert(err.message); }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this record?")) return;
    startTransition(async () => {
      try { await deletePetty(id); router.refresh(); }
      catch (err: any) { alert(err.message); }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 items-center flex-wrap">
          <DateRangeFilter fromDate={fromDate} toDate={toDate} onFromDate={setFromDate} onToDate={setToDate} />
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
          <ExportButtons data={exportData} filename="petty_expenses" />
        </div>
        <Button onClick={() => setShowModal(true)}>+ Add Petty</Button>
      </div>

      {filtered.length > 0 && (
        <div className="bg-white rounded-lg border border-zinc-200 p-3 flex justify-between text-sm">
          <span className="text-zinc-500">Total Petty Cash ({fromDate} to {toDate})</span>
          <span className="font-bold" style={{ color: "var(--primary)" }}>{fmt(total)}</span>
        </div>
      )}

      <TableCard>
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-10 text-center"><input type="checkbox" checked={isAllSelected} onChange={handleToggleSelectAll} className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4" /></TableHead><TableHead>Date</TableHead><TableHead>Month</TableHead><TableHead>Description</TableHead>
            <TableHead className="text-right">Amount (Rs.)</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0
              ? <EmptyRow colSpan={6} label="No petty cash records for this period" />
              : filtered.map((r) => (
                <TableRow key={r.id} className={selectedIds.includes(r.id) ? "bg-red-50/50" : ""}>
                  <TableCell className="w-10 text-center"><input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => setSelectedIds(prev => prev.includes(r.id) ? prev.filter(id => id !== r.id) : [...prev, r.id])} className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4" /></TableCell>
                  <TableCell className="text-xs font-mono">{r.expense_date || "—"}</TableCell>
                  <TableCell>{r.month}</TableCell>
                  <TableCell>{r.description}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(r.amount)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                      onClick={() => handleDelete(r.id)} disabled={isPending}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableCard>

      {showModal && (
        <Modal title="Add Petty Cash" onClose={() => setShowModal(false)}>
          <div className="space-y-3">
            <Field label="Date *">
              <Input type="date" value={form.expense_date}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
            </Field>
            <div className="flex gap-3">
              <div className="flex-1"><label className="label">Month</label><MonthSelect value={form.month} onChange={(v) => setForm({ ...form, month: v })} /></div>
              <div className="flex-1"><label className="label">Year</label><YearSelect value={form.year} onChange={(v) => setForm({ ...form, year: v })} /></div>
            </div>
            <Field label="Description *">
              <Input placeholder="e.g. Tea, Stationary, Misc" value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Amount (Rs.) *">
              <Input type="number" min="0" placeholder="0" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Bank Account">
              <BankSelect value={form.bank_account_id} onChange={(v) => setForm({ ...form, bank_account_id: v })} bankAccounts={bankAccounts} />
            </Field>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSave} disabled={isPending}>{isPending ? "Saving..." : "Save"}</Button>
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PenaltiesHead({ rows, bankAccounts }: { rows: any[]; bankAccounts: any[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fromDate, setFromDate]       = useState(FIRST_DAY_OF_MONTH);
  const [toDate, setToDate]           = useState(TODAY);
  const [showModal, setShowModal]     = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [form, setForm] = useState({ expense_date: TODAY, month: CURRENT_MONTH, year: String(CURRENT_YEAR), description: "", reason: "", amount: "", bank_account_id: "" });

  const filtered = rows.filter((r) => {
    const d = getExpenseRowDate(r);
    if (!d) return true;
    return d >= fromDate && d <= toDate;
  });
  const isAllSelected = filtered.length > 0 && filtered.every((r) => selectedIds.includes(r.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) setSelectedIds([]);
    else setSelectedIds(filtered.map((r) => r.id));
  };

  const handleBulkDelete = () => {
    if (!selectedIds.length) return;
    if (!confirm(`Delete ${selectedIds.length} selected penalty record(s)?`)) return;
    startTransition(async () => {
      try {
        await deleteAgencyPenalties(selectedIds);
        setSelectedIds([]);
        router.refresh();
      } catch (err: any) { alert(err.message); }
    });
  };
  const total    = filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const exportData = filtered.map((r) => ({ Date: r.expense_date || "", Month: r.month, Year: r.year, Description: r.description, Reason: r.reason, "Amount (Rs.)": r.amount }));

  const handleSave = () => {
    if (!form.description || !form.amount) return;
    startTransition(async () => {
      try {
        await createPenalty({ expense_date: form.expense_date, month: form.month, year: form.year, description: form.description, reason: form.reason || undefined, amount: parseFloat(form.amount), bank_account_id: form.bank_account_id || undefined });
        setShowModal(false);
        setForm({ expense_date: TODAY, month: CURRENT_MONTH, year: String(CURRENT_YEAR), description: "", reason: "", amount: "", bank_account_id: "" });
        router.refresh();
      } catch (err: any) { alert(err.message); }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this penalty record?")) return;
    startTransition(async () => {
      try { await deletePenalty(id); router.refresh(); }
      catch (err: any) { alert(err.message); }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 items-center flex-wrap">
          <DateRangeFilter fromDate={fromDate} toDate={toDate} onFromDate={setFromDate} onToDate={setToDate} />
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
          <ExportButtons data={exportData} filename="penalties_expenses" />
        </div>
        <Button onClick={() => setShowModal(true)}>+ Add Penalty</Button>
      </div>

      {filtered.length > 0 && (
        <div className="bg-white rounded-lg border border-zinc-200 p-3 flex justify-between text-sm">
          <span className="text-zinc-500">Total Penalties ({fromDate} to {toDate})</span>
          <span className="font-bold" style={{ color: "var(--primary)" }}>{fmt(total)}</span>
        </div>
      )}

      <TableCard>
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-10 text-center"><input type="checkbox" checked={isAllSelected} onChange={handleToggleSelectAll} className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4" /></TableHead><TableHead>Date</TableHead><TableHead>Month</TableHead><TableHead>Description</TableHead>
            <TableHead>Reason</TableHead><TableHead className="text-right">Amount (Rs.)</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0
              ? <EmptyRow colSpan={7} label="No penalty records for this period" />
              : filtered.map((r) => (
                <TableRow key={r.id} className={selectedIds.includes(r.id) ? "bg-red-50/50" : ""}>
                  <TableCell className="w-10 text-center"><input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => setSelectedIds(prev => prev.includes(r.id) ? prev.filter(id => id !== r.id) : [...prev, r.id])} className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4" /></TableCell>
                  <TableCell className="text-xs font-mono">{r.expense_date || "—"}</TableCell>
                  <TableCell>{r.month}</TableCell>
                  <TableCell>{r.description}</TableCell>
                  <TableCell className="text-zinc-500">{r.reason || "—"}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(r.amount)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                      onClick={() => handleDelete(r.id)} disabled={isPending}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableCard>

      {showModal && (
        <Modal title="Add Penalty" onClose={() => setShowModal(false)}>
          <div className="space-y-3">
            <Field label="Date *">
              <Input type="date" value={form.expense_date}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
            </Field>
            <div className="flex gap-3">
              <div className="flex-1"><label className="label">Month</label><MonthSelect value={form.month} onChange={(v) => setForm({ ...form, month: v })} /></div>
              <div className="flex-1"><label className="label">Year</label><YearSelect value={form.year} onChange={(v) => setForm({ ...form, year: v })} /></div>
            </div>
            <Field label="Description *">
              <Input placeholder="e.g. CCBPL Display Penalty, Warehouse Audit" value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Reason">
              <Input placeholder="e.g. Non-compliance, Late delivery" value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </Field>
            <Field label="Amount (Rs.) *">
              <Input type="number" min="0" placeholder="0" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Bank Account">
              <BankSelect value={form.bank_account_id} onChange={(v) => setForm({ ...form, bank_account_id: v })} bankAccounts={bankAccounts} />
            </Field>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSave} disabled={isPending}>{isPending ? "Saving..." : "Save"}</Button>
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function MonthYearFilter({ month, year, onMonth, onYear }: {
  month: string; year: string; onMonth: (v: string) => void; onYear: (v: string) => void;
}) {
  return (
    <div className="flex gap-2">
      <MonthSelect value={month} onChange={onMonth} />
      <YearSelect value={year} onChange={onYear} />
    </div>
  );
}

function MonthSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm focus-visible:outline-none" style={{ boxShadow: "0 0 0 1px var(--primary-ring)" }}>
      {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
    </select>
  );
}

function YearSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm focus-visible:outline-none">
      {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
  );
}

function TableCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
      {children}
    </div>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center text-zinc-400 py-10">
        {label}
      </TableCell>
    </TableRow>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl p-6">
        <h3 className="text-lg font-bold text-zinc-900 mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const isDm = role.toLowerCase().includes("delivery") || role === "dm";
  return (
    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${isDm ? "bg-[var(--primary-light)] text-[var(--primary-dark)]" : "bg-green-100 text-green-700"}`}>
      {role}
    </span>
  );
}

function fmt(n: number) {
  return "Rs. " + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
