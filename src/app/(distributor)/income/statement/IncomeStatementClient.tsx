"use client";

import { useState } from "react";
import { ExportButtons } from "@/components/export/ExportButtons";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/Table";

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

interface Props {
  products: any[];
  invoices?: any[];
  schemeRows: any[];
  salaryRows: any[];
  billsRows: any[];
  fuelEntries: any[];
  maintenanceEntries?: any[];
  entertainmentRows: any[];
  pettyRows: any[];
  penaltiesRows: any[];
  discountRows?: any[];
}

export function IncomeStatementClient({
  products, invoices = [], schemeRows, salaryRows, billsRows,
  fuelEntries, maintenanceEntries = [], entertainmentRows, pettyRows, penaltiesRows, discountRows = [],
}: Props) {
  const [fromDate, setFromDate] = useState(FIRST_DAY_OF_MONTH);
  const [toDate, setToDate]     = useState(TODAY);

  let totalSales = 0;
  const productSales = new Map<string, number>();
  
  (invoices || [])
    .filter((inv: any) => {
      const d = (inv.invoice_date || inv.created_at || "").slice(0, 10);
      if (!d) return false;
      return d >= fromDate && d <= toDate;
    })
    .forEach((inv: any) => {
      totalSales += Number(inv.net_amount ?? inv.gross_amount) || 0;
      if (Array.isArray(inv.invoice_lines)) {
        inv.invoice_lines.forEach((l: any) => {
          const qty = Number(l.qty_delivered ?? l.qty_ordered ?? l.qty) || 0;
          const prodName = l.product?.product_name || l.product_name;
          if (prodName) {
            const key = prodName.toLowerCase().trim();
            productSales.set(key, (productSales.get(key) || 0) + qty);
          } else if (l.product_id) {
            const matched = products.find((p: any) => p.id === l.product_id);
            if (matched?.product_name) {
              const key = matched.product_name.toLowerCase().trim();
              productSales.set(key, (productSales.get(key) || 0) + qty);
            }
          }
        });
      }
    });

  let totalMargin = 0;
  products.forEach((product) => {
    const key = product.product_name.toLowerCase().trim();
    const units = productSales.get(key) || 0;
    const si = Number(product.purchase_rate) || 0;
    const so = Number(product.sale_rate) || 0;
    const profit = so > 0 && si > 0 ? (so - si) : 0;
    totalMargin += profit * units;
  });

  const periodScheme = schemeRows.filter((r) => {
    const d = (r.income_date || r.income_month || "").slice(0, 10);
    if (!d) return false;
    return d >= fromDate && d <= toDate;
  });
  let totalScheme = 0;
  periodScheme.forEach(s => totalScheme += Number(s.amount) || 0);

  const periodSalary = salaryRows.filter((r) => {
    const d = getExpenseRowDate(r);
    return d >= fromDate && d <= toDate;
  });
  const totalSalary = periodSalary.reduce((s, r) => s + (Number(r.net_payable) || 0), 0);

  const periodBills = billsRows.filter((r) => {
    const d = getExpenseRowDate(r);
    return d >= fromDate && d <= toDate;
  });
  let totalBills = 0;
  periodBills.forEach(b => totalBills += Number(b.amount) || 0);

  const periodFuel = fuelEntries.filter((e) => {
    const d = getExpenseRowDate(e);
    return d >= fromDate && d <= toDate;
  });
  let totalFuel = 0;
  const fuelByTruck = new Map<string, { truck_no: string; driver_name: string; total: number }>();
  periodFuel.forEach((e) => {
    totalFuel += Number(e.amount) || 0;
    const key = e.truck_no;
    if (!fuelByTruck.has(key)) {
      fuelByTruck.set(key, { truck_no: e.truck_no, driver_name: e.driver_name || "", total: 0 });
    }
    fuelByTruck.get(key)!.total += Number(e.amount) || 0;
  });

  const periodMaintenance = maintenanceEntries.filter((e) => {
    const d = getExpenseRowDate(e);
    return d >= fromDate && d <= toDate;
  });
  let totalMaintenance = 0;
  const maintenanceByVehicle = new Map<string, { vehicle_no: string; driver_name: string; total: number }>();
  periodMaintenance.forEach((e) => {
    totalMaintenance += Number(e.amount) || 0;
    const key = e.vehicle_no;
    if (!maintenanceByVehicle.has(key)) {
      maintenanceByVehicle.set(key, { vehicle_no: e.vehicle_no, driver_name: e.driver_name || "", total: 0 });
    }
    maintenanceByVehicle.get(key)!.total += Number(e.amount) || 0;
  });

  const periodDiscounts = (discountRows || []).filter((r) => {
    const d = getExpenseRowDate(r);
    return d >= fromDate && d <= toDate;
  });
  const totalAdditionalDiscount = periodDiscounts.reduce((s, r) => s + (Number(r.totalDiscount) || 0), 0);

  const periodEnt = entertainmentRows.filter((r) => {
    const d = getExpenseRowDate(r);
    return d >= fromDate && d <= toDate;
  });
  const totalEnt = periodEnt.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const periodPetty = pettyRows.filter((r) => {
    const d = getExpenseRowDate(r);
    return d >= fromDate && d <= toDate;
  });
  const totalPetty = periodPetty.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const periodPenalties = penaltiesRows.filter((r) => {
    const d = getExpenseRowDate(r);
    return d >= fromDate && d <= toDate;
  });
  let totalPenalties = 0;
  periodPenalties.forEach(p => totalPenalties += Number(p.amount) || 0);

  const totalExpenses = totalSalary + totalBills + totalFuel + totalMaintenance + totalAdditionalDiscount + totalEnt + totalPetty + totalPenalties;
  const totalProfit   = totalMargin + totalScheme - totalExpenses;

  const rows: { description: string; amount: number; type: "info" | "income" | "expense" | "total" }[] = [];

  rows.push({ description: "Sales", amount: totalSales, type: "info" });
  rows.push({ description: "Sales Margin", amount: totalMargin, type: "income" });

  periodScheme.forEach(s => {
    rows.push({ description: s.description || "Unnamed Scheme", amount: Number(s.amount) || 0, type: "income" });
  });

  rows.push({ description: "Salary Expense", amount: totalSalary, type: "expense" });

  periodBills.forEach(b => {
    rows.push({ description: `${b.bill_name} Bill Expense`, amount: Number(b.amount) || 0, type: "expense" });
  });

  fuelByTruck.forEach(f => {
    const driverPart = f.driver_name ? ` | ${f.driver_name}` : "";
    rows.push({ description: `${f.truck_no}${driverPart} | Fuel Expense`, amount: f.total, type: "expense" });
  });

  maintenanceByVehicle.forEach(m => {
    const driverPart = m.driver_name ? ` | ${m.driver_name}` : "";
    rows.push({ description: `${m.vehicle_no}${driverPart} | Maintenance Expense`, amount: m.total, type: "expense" });
  });

  rows.push({ description: "Additional Discount Expense", amount: totalAdditionalDiscount, type: "expense" });

  rows.push({ description: "Entertainment Expense", amount: totalEnt, type: "expense" });
  rows.push({ description: "Petty Expense", amount: totalPetty, type: "expense" });

  periodPenalties.forEach(p => {
    rows.push({ description: `${p.description} Penalty Expense`, amount: Number(p.amount) || 0, type: "expense" });
  });

  rows.push({ description: "Total Profit", amount: totalProfit, type: "total" });

  const exportData = rows.map((r) => ({
    Description: r.description, 
    "From Date": fromDate, 
    "To Date": toDate, 
    "Amount (Rs.)": r.amount,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Income Statement</h1>
        <p className="text-zinc-500 mt-1 text-sm">
          Periodic read-only rollup combining Sales, Margin, all Expense Heads, and Scheme Incomes.
        </p>
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
          <ExportButtons data={exportData} filename="income_statement" />
        </div>
      </div>

      <div className="text-xs text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2">
        <span className="font-semibold">Formula:</span> Total Profit = Sales Margin + Σ(Scheme Incomes) − Σ(all Expense Heads)
        &nbsp;=&nbsp; {fmt(totalMargin)} + {fmt(totalScheme)} − {fmt(totalExpenses)} = <span className={`font-bold ${totalProfit >= 0 ? "text-green-700" : "text-red-600"}`}>{fmt(totalProfit)}</span>
      </div>

      <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead className="text-right">Amount (Rs.)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => {
              if (r.type === "total") {
                return (
                  <TableRow key={i} className="bg-zinc-900 hover:bg-zinc-900">
                    <TableCell className="font-bold text-white">Total Profit</TableCell>
                    <TableCell className="text-zinc-400">{fromDate}</TableCell>
                    <TableCell className="text-zinc-400">{toDate}</TableCell>
                    <TableCell className={`text-right text-lg font-bold ${r.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {fmt(r.amount)}
                    </TableCell>
                  </TableRow>
                );
              }
              return (
                <TableRow key={i} className={
                  r.type === "expense" ? "bg-red-50/30" :
                  r.type === "income" ? "bg-green-50/40" : ""
                }>
                  <TableCell className="font-medium">
                    {r.type === "expense" && (
                      <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-2 align-middle" />
                    )}
                    {r.type === "income" && (
                      <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-2 align-middle" />
                    )}
                    {r.type === "info" && (
                      <span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-2 align-middle" />
                    )}
                    {r.description}
                  </TableCell>
                  <TableCell className="text-zinc-500">{fromDate}</TableCell>
                  <TableCell className="text-zinc-500">{toDate}</TableCell>
                  <TableCell className={`text-right font-mono font-semibold ${
                    r.type === "expense" ? "text-red-600" : 
                    r.type === "income" ? "text-green-700" : "text-blue-700"
                  }`}>
                    {r.amount > 0 ? fmt(r.amount) : <span className="text-zinc-300">—</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
