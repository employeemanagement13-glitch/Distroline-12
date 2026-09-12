import { getEmployeeById, getLoans, getEmployeeRunningBalance } from "@/lib/actions/employees";
import { notFound } from "next/navigation";
import { EmployeeLoansDetailClient } from "./EmployeeLoansDetailClient";

interface Props {
  params: Promise<{ employee_id: string }>;
}

export const metadata = { title: "Employee Loans — MDOS" };

export default async function EmployeeLoansDetailPage({ params }: Props) {
  const { employee_id } = await params;
  const [employee, loans, runningBalance] = await Promise.all([
    getEmployeeById(employee_id),
    getLoans(employee_id),
    getEmployeeRunningBalance(employee_id),
  ]);

  if (!employee) {
    notFound();
  }

  return (
    <div className="p-6 space-y-4">
      <EmployeeLoansDetailClient
        employee={employee}
        initialLoans={loans}
        runningBalance={runningBalance}
      />
    </div>
  );
}
