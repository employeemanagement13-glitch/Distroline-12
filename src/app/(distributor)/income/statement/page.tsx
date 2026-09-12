import { getProducts } from "@/lib/actions/products";
import { getInvoices } from "@/lib/actions/invoices";
import { getSchemeIncome } from "@/lib/actions/scheme-income";
import { getSalaryHeadView, getPayrollRuns } from "@/lib/actions/payroll";
import { getBills, getEntertainment, getPetty, getPenalties } from "@/lib/actions/expenses";
import { getFuelEntries } from "@/lib/actions/fuel";
import { getMaintenanceEntries } from "@/lib/actions/maintenance";
import { getDiscountReportData } from "@/lib/actions/discounts";
import { IncomeStatementClient } from "./IncomeStatementClient";

export const metadata = { title: "Income Statement — MDOS" };

export default async function IncomeStatementPage() {
  const [
    products, invoices, schemeRows, salaryHeadRows, payrollRuns, billsRows,
    fuelEntries, maintenanceEntries, entertainmentRows, pettyRows, penaltiesRows,
    discountRows
  ] = await Promise.all([
    getProducts(),
    getInvoices(),
    getSchemeIncome(),
    getSalaryHeadView(),
    getPayrollRuns(),
    getBills(),
    getFuelEntries(),
    getMaintenanceEntries(),
    getEntertainment(),
    getPetty(),
    getPenalties(),
    getDiscountReportData(),
  ]);

  let salaryRows = salaryHeadRows || [];
  if (!salaryRows.length) {
    const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    salaryRows = (payrollRuns || []).map((r: any) => {
      const [y, m] = String(r.salary_month || "").slice(0, 10).split("-");
      const mIdx = parseInt(m, 10) - 1;
      return {
        month: MONTHS[mIdx] || "",
        year: y || "",
        net_payable: Number(r.net_payable || 0),
        date: r.salary_month || (y && m ? `${y}-${m}-01` : ""),
        salary_month: r.salary_month,
      };
    });
  }

  return (
    <IncomeStatementClient 
      products={products}
      invoices={invoices}
      schemeRows={schemeRows}
      salaryRows={salaryRows}
      billsRows={billsRows}
      fuelEntries={fuelEntries}
      maintenanceEntries={maintenanceEntries}
      entertainmentRows={entertainmentRows}
      pettyRows={pettyRows}
      penaltiesRows={penaltiesRows}
      discountRows={discountRows}
    />
  );
}
