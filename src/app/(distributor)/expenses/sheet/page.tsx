import { getSalaryHeadView } from "@/lib/actions/payroll";
import { getFuelEntries } from "@/lib/actions/fuel";
import { getMaintenanceEntries } from "@/lib/actions/maintenance";
import { getBills, getEntertainment, getPetty, getPenalties } from "@/lib/actions/expenses";
import { getDiscountReportData } from "@/lib/actions/discounts";
import { ExpenseSheetClient } from "./ExpenseSheetClient";

export const metadata = { title: "Expense Sheet — MDOS" };

export default async function ExpenseSheetPage() {
  const [
    salaryRows, fuelEntries, maintenanceEntries, billsRows, entertainmentRows, pettyRows, penaltiesRows, discountRows,
  ] = await Promise.all([
    getSalaryHeadView(),
    getFuelEntries(),
    getMaintenanceEntries(),
    getBills(),
    getEntertainment(),
    getPetty(),
    getPenalties(),
    getDiscountReportData(),
  ]);

  return (
    <ExpenseSheetClient
      salaryRows={salaryRows}
      fuelEntries={fuelEntries}
      maintenanceEntries={maintenanceEntries}
      billsRows={billsRows}
      entertainmentRows={entertainmentRows}
      pettyRows={pettyRows}
      penaltiesRows={penaltiesRows}
      discountRows={discountRows}
    />
  );
}
