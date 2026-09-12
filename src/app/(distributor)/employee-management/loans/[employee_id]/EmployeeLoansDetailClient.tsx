"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ExportButtons } from "@/components/export/ExportButtons";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/Table";
import { ArrowLeft, Pencil, Trash2, Plus, Banknote, Loader2 } from "lucide-react";
import { createLoan, updateLoan, deleteLoan } from "@/lib/actions/employees";

interface Employee {
  id: string;
  employee_code?: string;
  full_name: string;
  role: string;
  phone?: string;
  basic_salary?: number;
  joining_date?: string;
  active?: boolean;
}

interface Loan {
  id: string;
  employee_id: string;
  principal_amount: number;
  monthly_installment: number;
  outstanding_balance?: number;
  status: string;
  reason?: string;
  issued_date: string;
  type?: string;
  created_at?: string;
}

interface Props {
  employee: Employee;
  initialLoans: Loan[];
  runningBalance: number;
}

const ROLES = [
  { value: "dm",                label: "Delivery Man",      color: "bg-red-100 text-red-700" },
  { value: "preseller",         label: "Preseller",         color: "bg-green-100 text-green-700" },
  { value: "operation_manager", label: "Operation Manager", color: "bg-blue-100 text-blue-700" },
  { value: "loader",            label: "Loader",            color: "bg-purple-100 text-purple-700" },
  { value: "dvo",               label: "DVO",               color: "bg-zinc-100 text-zinc-700" },
  { value: "driver",            label: "Driver",            color: "bg-cyan-100 text-cyan-700" },
  { value: "guard",             label: "Guard",             color: "bg-yellow-100 text-yellow-700" },
  { value: "office",            label: "Office",            color: "bg-indigo-100 text-indigo-700" },
  { value: "other",             label: "Other",             color: "bg-gray-100 text-gray-600" },
] as const;

function getRoleConfig(val: string) {
  return ROLES.find((r) => r.value === val) ?? { label: val, color: "bg-zinc-100 text-zinc-500" };
}

export function EmployeeLoansDetailClient({ employee, initialLoans, runningBalance }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [editForm, setEditForm] = useState({
    principal_amount: "",
    monthly_installment: "",
    issued_date: "",
    reason: "",
    status: "active",
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    principal_amount: "",
    monthly_installment: "",
    issued_date: new Date().toISOString().split("T")[0],
    reason: "",
  });

  const [errorMsg, setErrorMsg] = useState("");

  const handleOpenEdit = (loan: Loan) => {
    setErrorMsg("");
    setEditingLoan(loan);
    setEditForm({
      principal_amount: String(loan.principal_amount ?? ""),
      monthly_installment: String(loan.monthly_installment ?? ""),
      issued_date: loan.issued_date ? loan.issued_date.slice(0, 10) : new Date().toISOString().split("T")[0],
      reason: loan.reason || "",
      status: loan.status || "active",
    });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoan) return;
    setErrorMsg("");

    const principal = parseFloat(editForm.principal_amount);
    const installment = parseFloat(editForm.monthly_installment);

    if (isNaN(principal) || principal <= 0) {
      setErrorMsg("Please enter a valid principal amount.");
      return;
    }
    if (isNaN(installment) || installment <= 0) {
      setErrorMsg("Please enter a valid monthly installment.");
      return;
    }

    startTransition(async () => {
      try {
        await updateLoan(editingLoan.id, {
          principal_amount: principal,
          monthly_installment: installment,
          reason: editForm.reason.trim() || undefined,
          issued_date: editForm.issued_date,
          status: editForm.status,
        });
        setEditingLoan(null);
        router.refresh();
      } catch (err: any) {
        setErrorMsg(err?.message || "Failed to update loan.");
      }
    });
  };

  const handleDelete = (loanId: string) => {
    if (!confirm("Are you sure you want to delete this loan? It will be permanently removed from the ledger and payroll tracking.")) {
      return;
    }
    setErrorMsg("");
    startTransition(async () => {
      try {
        await deleteLoan(loanId);
        router.refresh();
      } catch (err: any) {
        alert(err?.message || "Failed to delete loan.");
      }
    });
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const principal = parseFloat(addForm.principal_amount);
    const installment = parseFloat(addForm.monthly_installment);

    if (isNaN(principal) || principal <= 0) {
      setErrorMsg("Please enter a valid principal amount.");
      return;
    }
    if (isNaN(installment) || installment <= 0) {
      setErrorMsg("Please enter a valid monthly installment.");
      return;
    }

    startTransition(async () => {
      try {
        await createLoan(employee.id, {
          principal_amount: principal,
          monthly_installment: installment,
          issued_date: addForm.issued_date,
          reason: addForm.reason.trim() || undefined,
        });
        setShowAddModal(false);
        setAddForm({
          principal_amount: "",
          monthly_installment: "",
          issued_date: new Date().toISOString().split("T")[0],
          reason: "",
        });
        router.refresh();
      } catch (err: any) {
        setErrorMsg(err?.message || "Failed to create loan.");
      }
    });
  };

  const roleConfig = getRoleConfig(employee.role);

  const exportData = initialLoans.map((l) => ({
    "Issue Date": l.issued_date || (l.created_at ? l.created_at.slice(0, 10) : "—"),
    Type: l.type || "Loan",
    Reason: l.reason || "—",
    "Principal Amount (Rs.)": l.principal_amount,
    "Monthly Installment (Rs.)": l.monthly_installment,
    "Outstanding Balance (Rs.)": l.outstanding_balance ?? l.principal_amount,
    Status: l.status,
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/employee-management/loans")}
          className="text-zinc-600 hover:text-zinc-900 -ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Loans
        </Button>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setErrorMsg("");
              setShowAddModal(true);
            }}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Give Loan
          </Button>
          <ExportButtons data={exportData} filename={`loans_${employee.employee_code || employee.full_name}`} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-zinc-900">{employee.full_name}</h1>
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
              {employee.employee_code || "No Code"}
            </span>
            <Badge className={roleConfig.color}>{roleConfig.label}</Badge>
          </div>
          <div className="flex items-center gap-4 text-xs text-zinc-500 pt-1 flex-wrap">
            {employee.phone && <span>Phone: <strong className="text-zinc-700 font-mono">{employee.phone}</strong></span>}
            {employee.joining_date && <span>Joining: <strong className="text-zinc-700">{employee.joining_date}</strong></span>}
            {employee.basic_salary !== undefined && (
              <span>Basic Salary: <strong className="text-zinc-700 font-mono">Rs. {Number(employee.basic_salary).toLocaleString()}</strong></span>
            )}
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-red-600">
            <Banknote className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Current Balance</p>
            <p className="text-lg font-bold text-red-700 font-mono">
              Rs. {runningBalance.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">Issue Date</TableHead>
              <TableHead className="w-28">Type</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Principal Amount</TableHead>
              <TableHead className="w-28 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialLoans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-zinc-400 py-12">
                  No loans recorded for this employee
                </TableCell>
              </TableRow>
            ) : (
              initialLoans.map((l) => (
                <TableRow key={l.id} className="hover:bg-zinc-50/70 transition-colors">
                  <TableCell className="font-mono text-xs text-zinc-700">
                    {l.issued_date ? l.issued_date.slice(0, 10) : l.created_at ? l.created_at.slice(0, 10) : "—"}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                      {l.type || "Loan"}
                    </span>
                  </TableCell>
                  <TableCell className="text-zinc-700 text-sm">
                    {l.reason || "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-sm text-zinc-900">
                    Rs. {Number(l.principal_amount).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEdit(l)}
                        className="h-8 w-8 p-0 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                        title="Edit Loan"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleDelete(l.id)}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        title="Delete Loan"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {editingLoan && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-zinc-900 mb-4">Edit Employee Loan</h3>

            {errorMsg && (
              <div className="mb-4 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded p-2.5">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleUpdate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1">Issue Date *</label>
                <Input
                  type="date"
                  value={editForm.issued_date}
                  onChange={(e) => setEditForm((f) => ({ ...f, issued_date: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1">Reason</label>
                <Input
                  value={editForm.reason}
                  onChange={(e) => setEditForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="e.g. Medical emergency, House repair"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1">Principal Amount (Rs.) *</label>
                <Input
                  type="number"
                  min="1"
                  step="any"
                  value={editForm.principal_amount}
                  onChange={(e) => setEditForm((f) => ({ ...f, principal_amount: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1">Monthly Installment (Rs.) *</label>
                <Input
                  type="number"
                  min="1"
                  step="any"
                  value={editForm.monthly_installment}
                  onChange={(e) => setEditForm((f) => ({ ...f, monthly_installment: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-red-400"
                >
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="flex gap-2 pt-3">
                <Button type="submit" className="flex-1 bg-red-600 hover:bg-red-700 text-white" disabled={isPending}>
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditingLoan(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-zinc-900 mb-4">Give Loan to {employee.full_name}</h3>

            {errorMsg && (
              <div className="mb-4 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded p-2.5">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1">Issue Date *</label>
                <Input
                  type="date"
                  value={addForm.issued_date}
                  onChange={(e) => setAddForm((f) => ({ ...f, issued_date: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1">Reason</label>
                <Input
                  value={addForm.reason}
                  onChange={(e) => setAddForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="e.g. Medical emergency, House repair"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1">Principal Amount (Rs.) *</label>
                <Input
                  type="number"
                  min="1"
                  step="any"
                  value={addForm.principal_amount}
                  onChange={(e) => setAddForm((f) => ({ ...f, principal_amount: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1">Monthly Installment (Rs.) *</label>
                <Input
                  type="number"
                  min="1"
                  step="any"
                  value={addForm.monthly_installment}
                  onChange={(e) => setAddForm((f) => ({ ...f, monthly_installment: e.target.value }))}
                  required
                />
              </div>

              <div className="flex gap-2 pt-3">
                <Button type="submit" className="flex-1 bg-red-600 hover:bg-red-700 text-white" disabled={isPending}>
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      Saving...
                    </>
                  ) : (
                    "Confirm Loan"
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
