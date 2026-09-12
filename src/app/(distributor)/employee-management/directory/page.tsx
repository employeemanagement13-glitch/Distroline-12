import { getEmployees } from "@/lib/actions/employees";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmployeeDirectoryClient } from "./EmployeeDirectoryClient";

export default async function EmployeeDirectoryPage() {
  const employees = await getEmployees();
  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Employee Directory"
        subtitle="Employee Management — all staff records, salaries, references and linked routes"
      />
      <EmployeeDirectoryClient initialEmployees={employees} />
    </div>
  );
}

