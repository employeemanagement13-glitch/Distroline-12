"use client";

import { useState, useRef, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Trash2, FileSpreadsheet, Upload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ExportButtons } from "@/components/export/ExportButtons";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/Table";
import { createEmployee, updateEmployee, deleteEmployee, deleteEmployees, createLoan, getEmployeeLedger, bulkImportEmployees } from "@/lib/actions/employees";
import type { EmployeeFormData } from "@/lib/actions/employees";
import { parseEmployeeExcel } from "@/lib/parsers/employeeImport";

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

type RoleValue = typeof ROLES[number]["value"];

const BLANK_FORM = {
  employee_code: "", full_name: "", role: "dm" as RoleValue, phone: "",
  nic: "", address: "", joining_date: "",
  basic_salary: "", bank_name: "", bank_account: "",
  house_owner: false, emergency_contact: "", emergency_phone: "",
  reference_1_name: "", reference_1_phone: "",
  reference_2_name: "", reference_2_phone: "",
  active: true,
};

function getRoleConfig(val: string) {
  return ROLES.find((r) => r.value === val) ?? { label: val, color: "bg-zinc-100 text-zinc-500" };
}

interface Props { initialEmployees: any[] }

export function EmployeeDirectoryClient({ initialEmployees }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch]       = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showModal, setShowModal]  = useState(false);
  const [editingId, setEditingId]  = useState<string | null>(null);
  const [form, setForm]            = useState({ ...BLANK_FORM });
  const [loanEmployee, setLoanEmployee] = useState<any | null>(null);
  const [loanForm, setLoanForm] = useState({
    principal_amount: "",
    monthly_installment: "",
    issued_date: new Date().toISOString().split("T")[0],
    reason: "",
  });
  const [loanError, setLoanError] = useState("");
  const [ledgerEmployee, setLedgerEmployee] = useState<any | null>(null);
  const [ledgerRows, setLedgerRows] = useState<any[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [importPreview, setImportPreview] = useState<EmployeeFormData[] | null>(null);
  const [importFeedback, setImportFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const generateAutoEmpCode = () => {
    let maxNum = 0;
    initialEmployees.forEach((e) => {
      if (e.employee_code) {
        const match = String(e.employee_code).match(/EMP-?(\d+)/i);
        if (match) {
          const val = parseInt(match[1], 10);
          if (val > maxNum) maxNum = val;
        }
      }
    });
    const nextNum = maxNum + 1;
    return `EMP-${String(nextNum).padStart(3, "0")}`;
  };

  const filtered = initialEmployees.filter((e) => {
    const t = search.toLowerCase();
    const matchSearch = !t
      || e.full_name?.toLowerCase().includes(t)
      || e.employee_code?.toLowerCase().includes(t)
      || e.phone?.toLowerCase().includes(t)
      || e.nic?.toLowerCase().includes(t);
    const matchRole = roleFilter === "all" || e.role === roleFilter;
    return matchSearch && matchRole;
  });

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...BLANK_FORM, employee_code: "" });
    setShowModal(true);
  };

  const handleImportEmployees = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const parsedList = await parseEmployeeExcel(file);
      if (!parsedList || parsedList.length === 0) {
        alert("No valid employee records found in the uploaded file.");
        return;
      }
      setImportPreview(parsedList);
      setImportFeedback(null);
    } catch (err: any) {
      alert(`Failed to parse file: ${err.message}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleConfirmImport = () => {
    if (!importPreview || importPreview.length === 0) return;
    startTransition(async () => {
      try {
        const res = await bulkImportEmployees(importPreview);
        setImportPreview(null);
        setImportFeedback({
          type: "success",
          message: `Successfully imported ${res.total} employees (${res.created} created, ${res.updated} updated).`,
        });
        router.refresh();
      } catch (err: any) {
        setImportFeedback({
          type: "error",
          message: `Import failed: ${err.message}`,
        });
      }
    });
  };

  const importRoleSummary = useMemo(() => {
    if (!importPreview) return [];
    const counts = new Map<string, number>();
    importPreview.forEach((emp) => {
      const r = emp.role || "dm";
      counts.set(r, (counts.get(r) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([roleVal, count]) => ({
      role: roleVal,
      cfg: getRoleConfig(roleVal),
      count,
    }));
  }, [importPreview]);

  const exportData = filtered.map((e) => ({
    "Employee Code (Auto)": e.employee_code || "",
    "Full Name": e.full_name || "",
    "Role": getRoleConfig(e.role).label,
    "Phone": e.phone || "",
    "NIC": e.nic || "",
    "Address": e.address || "",
    "Joining Date": e.joining_date || "",
    "Basic Salary (Rs.)": Number(e.basic_salary || 0),
    "Bank Name": e.bank_name || "",
    "Account Number": e.bank_account || "",
    "Emergency Contact": e.emergency_contact || "",
    "Emergency Phone": e.emergency_phone || "",
    "1st Reference Name": e.reference_1_name || "",
    "1st Reference Phone": e.reference_1_phone || "",
    "2nd Reference Name": e.reference_2_name || "",
    "2nd Reference Phone": e.reference_2_phone || "",
    "House Owner": e.house_owner ? "Yes" : "No",
    "Status": e.active ? "Active" : "Inactive",
  }));

  const openEdit = (emp: any) => {
    setEditingId(emp.id);
    setForm({
      employee_code:   emp.employee_code || "",
      full_name:       emp.full_name || "",
      role:            emp.role || "dm",
      phone:           emp.phone || "",
      nic:             emp.nic || "",
      address:         emp.address || "",
      joining_date:    emp.joining_date || "",
      basic_salary:    emp.basic_salary != null ? String(emp.basic_salary) : "",
      bank_name:       emp.bank_name || "",
      bank_account:    emp.bank_account || "",
      house_owner:     emp.house_owner ?? false,
      emergency_contact: emp.emergency_contact || "",
      emergency_phone:   emp.emergency_phone || "",
      reference_1_name:  emp.reference_1_name || "",
      reference_1_phone: emp.reference_1_phone || "",
      reference_2_name:  emp.reference_2_name || "",
      reference_2_phone: emp.reference_2_phone || "",
      active:          emp.active ?? true,
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
    if (!confirm(`Delete ${selectedIds.length} selected employee(s)?`)) return;
    startTransition(async () => {
      try {
        await deleteEmployees(selectedIds);
        setSelectedIds([]);
        router.refresh();
      } catch (err: any) { alert(err.message); }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this employee? This cannot be undone.")) return;
    startTransition(async () => {
      try { await deleteEmployee(id); router.refresh(); }
      catch (err: any) { alert(err.message); }
    });
  };

  const openLoanModal = (emp: any) => {
    setLoanEmployee(emp);
    setLoanForm({
      principal_amount: "",
      monthly_installment: "",
      issued_date: new Date().toISOString().split("T")[0],
      reason: "",
    });
    setLoanError("");
  };

  const openLedgerModal = async (emp: any) => {
    setLedgerEmployee(emp);
    setLedgerRows([]);
    setLoadingLedger(true);
    try {
      const rows = await getEmployeeLedger(emp.id);
      setLedgerRows(rows);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingLedger(false);
    }
  };

  const printLedger = () => {
    if (!ledgerEmployee) return;
    const title = `Employee Ledger — ${ledgerEmployee.full_name || ledgerEmployee.id || ""}`;
    const styles = `
      <style>
        @page { size: auto; margin: 20mm; }
        html, body { margin: 0; padding: 0; }
        body{font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; padding:20px; color:#111}
        h2{margin-bottom:16px}
        table{border-collapse:collapse;width:100%; table-layout: fixed; word-break: break-word;}
        thead { display: table-header-group; }
        th,td{border:1px solid #ddd;padding:8px;text-align:left; vertical-align: top; word-wrap: break-word;}
        th{background:#f5f5f5}
      </style>
    `;
    const rowsHtml = ledgerRows.map((r) => `
      <tr>
        <td>${r.entry_date || ''}</td>
        <td>${r.type || ''}</td>
        <td>${r.direction === 'in' ? Number(r.amount || 0) : ''}</td>
        <td>${r.direction === 'out' ? Number(r.amount || 0) : ''}</td>
        <td>${Number(r.running_balance || 0)}</td>
        <td>${(r.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
      </tr>
    `).join('');

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`<!doctype html><html><head><title>${title}</title>${styles}</head><body><h2>${title}</h2><table><thead><tr><th>Date</th><th>Type</th><th>In (Rs.)</th><th>Out (Rs.)</th><th>Running Balance</th><th>Description</th></tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`);
      win.document.close();
      win.focus();
      win.print();
    }
  };

  const exportLedgerExcel = () => {
    if (!ledgerEmployee || !ledgerRows.length) {
      alert("No ledger entries to export.");
      return;
    }

    const headerCols = ['Date','Type','In (Rs.)','Out (Rs.)','Running Balance','Description'];
    const rowsHtml = ledgerRows.map((r) => `
      <tr>
        <td>${r.entry_date || ''}</td>
        <td>${r.type || ''}</td>
        <td>${r.direction === 'in' ? Number(r.amount || 0) : ''}</td>
        <td>${r.direction === 'out' ? Number(r.amount || 0) : ''}</td>
        <td>${Number(r.running_balance || 0)}</td>
        <td>${(r.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
      </tr>
    `).join('');

    const tableHtml = `<!doctype html><html><head><meta charset="utf-8"></head><body><table><thead><tr>${headerCols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`;

    const blob = new Blob(['\ufeff', tableHtml], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (ledgerEmployee.full_name || ledgerEmployee.id || 'ledger').toString().replace(/[^a-z0-9_\-]/gi, '_');
    a.href = url;
    a.download = `ledger_${safeName}_${new Date().toISOString().slice(0,10)}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleLoanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanEmployee) return;
    if (!loanForm.principal_amount || !loanForm.monthly_installment) {
      setLoanError("Principal amount and monthly installment are required.");
      return;
    }
    startTransition(async () => {
      try {
        await createLoan(loanEmployee.id, {
          principal_amount: Number(loanForm.principal_amount),
          monthly_installment: Number(loanForm.monthly_installment),
          issued_date: loanForm.issued_date,
          reason: loanForm.reason || undefined,
        });
        setLoanEmployee(null);
        setLoanForm({
          principal_amount: "",
          monthly_installment: "",
          issued_date: new Date().toISOString().split("T")[0],
          reason: "",
        });
        setLoanError("");
        router.refresh();
      } catch (err: any) {
        setLoanError(err.message);
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) { alert("Full Name is required."); return; }
    startTransition(async () => {
      try {
        const payload: any = {
          ...form,
          basic_salary: form.basic_salary ? parseFloat(form.basic_salary) : 0,
          joining_date: form.joining_date || undefined,
        };
        if (editingId) await updateEmployee(editingId, payload);
        else           await createEmployee(payload);
        setShowModal(false);
        router.refresh();
      } catch (err: any) { alert(err.message); }
    });
  };

  const field = (label: string, key: keyof typeof BLANK_FORM, type = "text", required = false, disabled = false) => (
    <div>
      <label className="block text-xs font-medium text-zinc-600 mb-1">{label}{required && " *"}</label>
      <Input
        type={type}
        value={String(form[key])}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        required={required}
        disabled={disabled}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Filters & Actions */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex gap-3 flex-1 max-w-xl">
          <Input
            placeholder="Search name, code, phone, NIC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white w-48"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">All Roles</option>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div className="flex gap-2 items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv, .xlsx, .xls"
            className="hidden"
            onChange={handleImportEmployees}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          >
            {isImporting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span className="text-red-600 font-semibold">Importing...</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                Import Excel
              </>
            )}
          </Button>
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
          <ExportButtons data={exportData} filename="employee_directory" />
          <Button size="sm" onClick={openAdd}>+ Add Employee</Button>
        </div>
      </div>

      {/* Role pills */}
      <div className="flex flex-wrap gap-2">
        {ROLES.map((r) => {
          const count = initialEmployees.filter((e) => e.role === r.value).length;
          if (count === 0) return null;
          return (
            <button
              key={r.value}
              onClick={() => setRoleFilter(roleFilter === r.value ? "all" : r.value)}
              className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all ${
                roleFilter === r.value ? `${r.color} border-transparent` : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-400"
              }`}
            >
              {r.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-center"><input type="checkbox" checked={isAllSelected} onChange={handleToggleSelectAll} className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4" /></TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Phone / NIC</TableHead>
              <TableHead className="text-right">Basic Salary</TableHead>
              <TableHead>Bank / Account</TableHead>
              <TableHead>References</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-zinc-400 py-8">No employees found</TableCell>
              </TableRow>
            ) : filtered.map((emp) => {
              const cfg = getRoleConfig(emp.role);
              return (
                <TableRow key={emp.id} className={selectedIds.includes(emp.id) ? "bg-red-50/50" : ""}>
                  <TableCell className="w-10 text-center"><input type="checkbox" checked={selectedIds.includes(emp.id)} onChange={() => setSelectedIds(prev => prev.includes(emp.id) ? prev.filter(id => id !== emp.id) : [...prev, emp.id])} className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4" /></TableCell>
                  <TableCell className="font-mono text-xs font-bold">{emp.employee_code || "—"}</TableCell>
                  <TableCell className="font-semibold text-zinc-900">{emp.full_name}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${cfg.color}`}>{cfg.label}</span>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div>{emp.phone || "—"}</div>
                    {emp.nic && <div className="text-zinc-400 font-mono">{emp.nic}</div>}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {emp.basic_salary != null ? `Rs. ${Number(emp.basic_salary).toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {emp.bank_name || emp.bank_account ? (
                      <div>
                        <div className="font-medium">{emp.bank_name || "Bank"}</div>
                        <div className="text-zinc-400 font-mono">{emp.bank_account || "—"}</div>
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {emp.reference_1_name ? (
                      <div>
                        <span className="font-medium">1st:</span> {emp.reference_1_name} {emp.reference_1_phone ? `(${emp.reference_1_phone})` : ""}
                      </div>
                    ) : null}
                    {emp.reference_2_name ? (
                      <div>
                        <span className="font-medium">2nd:</span> {emp.reference_2_name} {emp.reference_2_phone ? `(${emp.reference_2_phone})` : ""}
                      </div>
                    ) : null}
                    {!emp.reference_1_name && !emp.reference_2_name && "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={emp.active ? "success" : "secondary"}>
                      {emp.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end flex-wrap">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(emp)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => openLoanModal(emp)}>Give Loan</Button>
                      <Button size="sm" variant="ghost" onClick={() => openLedgerModal(emp)}>Ledger</Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                        onClick={() => handleDelete(emp.id)} disabled={isPending}>Delete</Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Loan Modal */}
      {loanEmployee && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
            <h3 className="text-lg font-bold text-zinc-900 mb-4">Give Loan — {loanEmployee.full_name}</h3>
            <form onSubmit={handleLoanSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Principal Amount *</label>
                  <Input type="number" min="0" step="0.01" value={loanForm.principal_amount} onChange={(e) => setLoanForm((f) => ({ ...f, principal_amount: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Monthly Installment *</label>
                  <Input type="number" min="0" step="0.01" value={loanForm.monthly_installment} onChange={(e) => setLoanForm((f) => ({ ...f, monthly_installment: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Issue Date</label>
                  <Input type="date" value={loanForm.issued_date} onChange={(e) => setLoanForm((f) => ({ ...f, issued_date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Purpose / Reason</label>
                  <Input value={loanForm.reason} onChange={(e) => setLoanForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Medical emergency, house repair..." />
                </div>
              </div>
              {loanError && <div className="text-xs text-red-600">{loanError}</div>}
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setLoanEmployee(null)}>Cancel</Button>
                <Button type="submit" disabled={isPending}>Save Loan</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ledger Modal */}
      {ledgerEmployee && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-200 p-4">
              <h3 className="text-lg font-bold text-zinc-900">Employee Ledger — {ledgerEmployee.full_name}</h3>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={printLedger}>Print (PDF)</Button>
                <Button size="sm" variant="ghost" onClick={exportLedgerExcel}>Export Excel</Button>
                <Button variant="ghost" onClick={() => setLedgerEmployee(null)}>Close</Button>
              </div>
            </div>
            <div className="overflow-auto p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>In (Rs.)</TableHead>
                    <TableHead>Out (Rs.)</TableHead>
                    <TableHead>Running Balance</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingLedger ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
                          <span className="text-xs text-zinc-500 font-medium">Loading ledger...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : ledgerRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-zinc-400 py-8">No ledger entries found</TableCell>
                    </TableRow>
                  ) : (
                    ledgerRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.entry_date}</TableCell>
                        <TableCell>{row.type}</TableCell>
                        <TableCell>{row.direction === "in" ? `Rs. ${Number(row.amount || 0).toLocaleString()}` : "—"}</TableCell>
                        <TableCell>{row.direction === "out" ? `Rs. ${Number(row.amount || 0).toLocaleString()}` : "—"}</TableCell>
                        <TableCell>Rs. {Number(row.running_balance || 0).toLocaleString()}</TableCell>
                        <TableCell>{row.description || "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-6 p-6">
            <h3 className="text-lg font-bold text-zinc-900 mb-5">
              {editingId ? "Edit Employee" : "Add Employee"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Row 1 */}
              <div className="grid grid-cols-2 gap-4">
                {field("Employee Code", "employee_code", "text", false, false)}
                {field("Full Name", "full_name", "text", true)}
              </div>
              {/* Role */}
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Role *</label>
                <select
                  className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white"
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as RoleValue }))}
                  required
                >
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              {/* Row 2 */}
              <div className="grid grid-cols-2 gap-4">
                {field("Phone", "phone")}
                {field("NIC", "nic")}
              </div>
              {field("Address", "address")}
              <div className="grid grid-cols-2 gap-4">
                {field("Joining Date", "joining_date", "date")}
                {field("Basic Salary (Rs.)", "basic_salary", "number")}
              </div>
              {/* Bank */}
              <div className="grid grid-cols-2 gap-4">
                {field("Bank Name", "bank_name")}
                {field("Account Number", "bank_account")}
              </div>
              {/* Contact */}
              <div className="grid grid-cols-2 gap-4">
                {field("Emergency Contact", "emergency_contact")}
                {field("Emergency Phone", "emergency_phone")}
              </div>
              {/* References */}
              <div className="border-t border-zinc-100 pt-3">
                <p className="text-xs font-semibold text-zinc-500 mb-3 uppercase tracking-wide">References</p>
                <div className="grid grid-cols-2 gap-4">
                  {field("1st Reference Name", "reference_1_name")}
                  {field("1st Reference Phone", "reference_1_phone")}
                  {field("2nd Reference Name", "reference_2_name")}
                  {field("2nd Reference Phone", "reference_2_phone")}
                </div>
              </div>
              {/* Toggles */}
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.house_owner}
                    onChange={(e) => setForm((f) => ({ ...f, house_owner: e.target.checked }))}
                    className="w-4 h-4 rounded"
                  />
                  House Owner
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                    className="w-4 h-4 rounded"
                  />
                  Active
                </label>
              </div>
              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button type="submit" className="flex-1" disabled={isPending}>
                  {isPending ? "Saving..." : "Save Employee"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Preview Modal */}
      {importPreview && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 flex-shrink-0">
              <h3 className="text-[15px] font-bold text-zinc-900">Import Employees Preview</h3>
              <button
                onClick={() => !isPending && setImportPreview(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-zinc-700">
                    Found {importPreview.length} employee record{importPreview.length !== 1 ? "s" : ""} across {importRoleSummary.length} role{importRoleSummary.length !== 1 ? "s" : ""}:
                  </span>
                  <span className="text-[11px] text-zinc-500 font-medium">
                    Auto-matching by Code, NIC, or Name
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {importRoleSummary.map(({ role, cfg, count }) => (
                    <span
                      key={role}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${cfg.color}`}
                    >
                      <span>{cfg.label}</span>
                      <span className="bg-white/80 rounded-full px-1.5 py-0.2 text-[10px] font-bold shadow-xs">
                        {count}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="border border-zinc-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Code</TableHead>
                      <TableHead>Full Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Phone / NIC</TableHead>
                      <TableHead className="text-right">Salary (Rs.)</TableHead>
                      <TableHead>Joining Date</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importPreview.map((emp, idx) => {
                      const cfg = getRoleConfig(emp.role);
                      return (
                        <TableRow key={idx} className="hover:bg-zinc-50/50">
                          <TableCell className="font-mono text-[11px] font-bold text-red-600">
                            {emp.employee_code || <span className="text-zinc-300">Auto</span>}
                          </TableCell>
                          <TableCell className="font-semibold text-xs text-zinc-900">
                            {emp.full_name}
                          </TableCell>
                          <TableCell>
                            <span className={`px-2 py-0.5 text-[10.5px] font-semibold rounded-full ${cfg.color}`}>
                              {cfg.label}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div>{emp.phone || "—"}</div>
                            {emp.nic && <div className="text-zinc-400 font-mono text-[10.5px]">{emp.nic}</div>}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {emp.basic_salary ? `Rs. ${Number(emp.basic_salary).toLocaleString()}` : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-zinc-600">
                            {emp.joining_date || "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={emp.active ? "success" : "secondary"}>
                              {emp.active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-zinc-100">
                <p className="text-xs text-zinc-500">
                  Existing employees will be updated with file details; new employees will be added.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setImportPreview(null)}
                    disabled={isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
                  >
                    <Upload className="h-4 w-4" />
                    {isPending ? "Importing..." : `Confirm Import (${importPreview.length} Employees)`}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Banner */}
      {importFeedback && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl border text-xs font-medium ${
            importFeedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {importFeedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
            )}
            <span>{importFeedback.message}</span>
          </div>
          <button
            onClick={() => setImportFeedback(null)}
            className="text-zinc-400 hover:text-zinc-600 text-sm font-bold ml-2 leading-none"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

