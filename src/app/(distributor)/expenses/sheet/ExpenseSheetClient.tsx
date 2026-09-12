"use client";

import { useState } from "react";
import { ExportButtons } from "@/components/export/ExportButtons";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/Table";

interface Props {
  salaryRows:         any[];
  fuelEntries:        any[];
  maintenanceEntries?: any[];
  billsRows:          any[];
  entertainmentRows:  any[];
  pettyRows:          any[];
  penaltiesRows:      any[];
  discountRows?:      any[];
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const TODAY = new Date().toISOString().split("T")[0];
const FIRST_DAY_OF_MONTH = `${TODAY.substring(0, 8)}01`;

const fmt = (n: number) =>
  "Rs. " + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getExpenseRowDate(r: any): string {
  if (r.expense_date) return String(r.expense_date).slice(0, 10);
  if (r.date) return String(r.date).slice(0, 10);
  if (r.entry_date) return String(r.entry_date).slice(0, 10);
  if (r.salary_month) return String(r.salary_month).slice(0, 10);
  if (r.month && r.year) {
    const mIdx = MONTHS.findIndex((m) => m.toLowerCase() === String(r.month).trim().toLowerCase());
    const mStr = mIdx >= 0 ? String(mIdx + 1).padStart(2, "0") : "01";
    return `${r.year}-${mStr}-01`;
  }
  return "";
}

function getMonthsInRange(fromDate: string, toDate: string) {
  if (!fromDate || !toDate || fromDate > toDate) return [];
  const start = new Date(fromDate + "T00:00:00");
  const end = new Date(toDate + "T00:00:00");
  const result: Array<{ year: string; month: string }> = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    result.push({
      year: String(cur.getFullYear()),
      month: MONTHS[cur.getMonth()],
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return result;
}

function getRowMonth(r: any, dateStr: string): string {
  if (r.month && MONTHS.some((m) => m.toLowerCase() === String(r.month).trim().toLowerCase())) {
    return MONTHS.find((m) => m.toLowerCase() === String(r.month).trim().toLowerCase())!;
  }
  if (dateStr && dateStr.length >= 7) {
    const mIdx = parseInt(dateStr.slice(5, 7), 10) - 1;
    if (mIdx >= 0 && mIdx < 12) return MONTHS[mIdx];
  }
  return "";
}

function getRowYear(r: any, dateStr: string): string {
  if (r.year) return String(r.year);
  if (dateStr && dateStr.length >= 4) return dateStr.slice(0, 4);
  return "";
}

export function ExpenseSheetClient({
  salaryRows, fuelEntries, maintenanceEntries = [], billsRows, entertainmentRows, pettyRows, penaltiesRows, discountRows = [],
}: Props) {
  const [fromDate, setFromDate] = useState(FIRST_DAY_OF_MONTH);
  const [toDate, setToDate] = useState(TODAY);

  const monthYearPairs = getMonthsInRange(fromDate, toDate);

  const allRows: Array<{ month: string; year: string; description: string; amount: number }> = [];

  monthYearPairs.forEach(({ month, year }) => {
    const matchSalary = salaryRows.filter((r) => {
      const d = getExpenseRowDate(r);
      return d >= fromDate && d <= toDate && getRowMonth(r, d) === month && getRowYear(r, d) === year;
    });
    const salaryTotal = matchSalary.reduce((s, r) => s + (Number(r.net_payable) || 0), 0);
    if (salaryTotal > 0) {
      allRows.push({ month, year, description: `${month} Salary Expense`, amount: salaryTotal });
    }

    const matchBills = billsRows.filter((r) => {
      const d = getExpenseRowDate(r);
      return d >= fromDate && d <= toDate && getRowMonth(r, d) === month && getRowYear(r, d) === year;
    });
    matchBills.forEach((b) => {
      allRows.push({ month, year, description: `${month} ${b.bill_name} Bill Expense`, amount: Number(b.amount) || 0 });
    });

    const fuelByTruck = new Map<string, { truck_no: string; driver_name: string; total: number }>();
    fuelEntries
      .filter((e) => {
        const d = getExpenseRowDate(e);
        return d >= fromDate && d <= toDate && getRowMonth(e, d) === month && getRowYear(e, d) === year;
      })
      .forEach((e) => {
        const key = e.truck_no;
        if (!fuelByTruck.has(key)) {
          fuelByTruck.set(key, { truck_no: e.truck_no, driver_name: e.driver_name || "", total: 0 });
        }
        fuelByTruck.get(key)!.total += Number(e.amount) || 0;
      });
    fuelByTruck.forEach((t) => {
      if (t.total > 0) {
        const driverPart = t.driver_name ? ` | ${t.driver_name}` : "";
        allRows.push({
          month, year,
          description: `${month} ${t.truck_no}${driverPart} | Fuel Expense`,
          amount: t.total,
        });
      }
    });

    const maintenanceByVehicle = new Map<string, { vehicle_no: string; driver_name: string; total: number }>();
    maintenanceEntries
      .filter((e) => {
        const d = getExpenseRowDate(e);
        return d >= fromDate && d <= toDate && getRowMonth(e, d) === month && getRowYear(e, d) === year;
      })
      .forEach((e) => {
        const key = e.vehicle_no;
        if (!maintenanceByVehicle.has(key)) {
          maintenanceByVehicle.set(key, { vehicle_no: e.vehicle_no, driver_name: e.driver_name || "", total: 0 });
        }
        maintenanceByVehicle.get(key)!.total += Number(e.amount) || 0;
      });
    maintenanceByVehicle.forEach((v) => {
      if (v.total > 0) {
        const driverPart = v.driver_name ? ` | ${v.driver_name}` : "";
        allRows.push({
          month, year,
          description: `${month} ${v.vehicle_no}${driverPart} | Maintenance Expense`,
          amount: v.total,
        });
      }
    });

    const matchDiscounts = (discountRows || []).filter((r) => {
      const d = getExpenseRowDate(r);
      return d >= fromDate && d <= toDate && getRowMonth(r, d) === month && getRowYear(r, d) === year;
    });
    const discountTotal = matchDiscounts.reduce((acc, r) => acc + (Number(r.totalDiscount) || 0), 0);
    if (discountTotal > 0) {
      allRows.push({ month, year, description: `${month} Additional Discount Expense`, amount: discountTotal });
    }

    const matchEnt = entertainmentRows.filter((r) => {
      const d = getExpenseRowDate(r);
      return d >= fromDate && d <= toDate && getRowMonth(r, d) === month && getRowYear(r, d) === year;
    });
    const entTotal = matchEnt.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    if (entTotal > 0) {
      allRows.push({ month, year, description: `${month} Entertainment Expense`, amount: entTotal });
    }

    const matchPetty = pettyRows.filter((r) => {
      const d = getExpenseRowDate(r);
      return d >= fromDate && d <= toDate && getRowMonth(r, d) === month && getRowYear(r, d) === year;
    });
    const pettyTotal = matchPetty.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    if (pettyTotal > 0) {
      allRows.push({ month, year, description: `${month} Petty Expense`, amount: pettyTotal });
    }

    const matchPenalties = penaltiesRows.filter((r) => {
      const d = getExpenseRowDate(r);
      return d >= fromDate && d <= toDate && getRowMonth(r, d) === month && getRowYear(r, d) === year;
    });
    matchPenalties.forEach((p) => {
      allRows.push({ month, year, description: `${month} ${p.description} Penalty Expense`, amount: Number(p.amount) || 0 });
    });
  });

  let runningTotal = 0;
  let lastMonth = "";
  const rows = allRows.map((r) => {
    if (r.month !== lastMonth) { runningTotal = 0; lastMonth = r.month; }
    runningTotal += r.amount;
    return { ...r, monthlyExpense: runningTotal };
  });

  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);

  const exportData = rows.map((r) => ({
    Month: r.month, Year: r.year,
    Description: r.description,
    "Amount (Rs.)": r.amount,
    "Monthly Expense (Rs.)": r.monthlyExpense,
    "From Date": fromDate,
    "To Date": toDate,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Expense Sheet</h1>
        <p className="text-zinc-500 mt-1 text-sm">Monthly rollup across all expense heads. Read-only derived view.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-zinc-500">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 px-2.5 py-1 text-sm border border-zinc-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-zinc-500">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 px-2.5 py-1 text-sm border border-zinc-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </div>
          <ExportButtons data={exportData} filename="expense_sheet" />
        </div>

        {rows.length > 0 && (
          <div className="text-sm font-semibold text-zinc-700 bg-red-50 border border-red-200 rounded-lg px-4 py-1.5">
            Total: {fmt(grandTotal)}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount (Rs.)</TableHead>
              <TableHead className="text-right">Monthly Expense</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-zinc-400 py-10">
                  No expense data for the selected period ({fromDate} to {toDate})
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r, i) => (
                <TableRow key={i} className={r.description.includes("Salary") ? "bg-red-50/40" : ""}>
                  <TableCell className="font-medium text-zinc-700">{r.month}</TableCell>
                  <TableCell>{r.year}</TableCell>
                  <TableCell>{r.description}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(r.amount)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold text-red-700">
                    {fmt(r.monthlyExpense)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
