import { getPayrollRuns } from "@/lib/actions/payroll";
import { getEmployees, getLatestEmployeeBalances } from "@/lib/actions/employees";
import { getBankAccounts } from "@/lib/actions/bank-accounts";
import { PageHeader } from "@/components/layout/PageHeader";
import { PayrollRunsClient } from "./PayrollRunsClient";

export default async function PayrollRunsPage() {
  const [runs, employees, bankAccounts, employeeBalances] = await Promise.all([
    getPayrollRuns(),
    getEmployees(),
    getBankAccounts(),
    getLatestEmployeeBalances(),
  ]);
  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Payroll Runs"
        subtitle="Employee Management — generate monthly payslips and record salary expenses"
      />
      <PayrollRunsClient
        initialRuns={runs}
        employees={employees}
        bankAccounts={bankAccounts}
        employeeBalances={employeeBalances}
      />
    </div>
  );
}

