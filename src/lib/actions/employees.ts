"use server";

import { createClient, getTenantId } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const REVALIDATE_PATHS = [
  "/employee-management/directory",
  "/employee-management/payroll",
  "/employee-management/loans",
  "/expenses/agency",
];

export interface EmployeeFormData {
  employee_code?: string;
  full_name: string;
  role: "dm" | "preseller" | "operation_manager" | "loader" | "dvo" | "driver" | "guard" | "office" | "other";
  phone?: string;
  nic?: string;
  address?: string;
  joining_date?: string;
  basic_salary?: number;
  bank_name?: string;
  bank_account?: string;
  house_owner?: boolean;
  emergency_contact?: string;
  emergency_phone?: string;
  reference_1_name?: string;
  reference_1_phone?: string;
  reference_2_name?: string;
  reference_2_phone?: string;
  linked_route_id?: string | null;
  active?: boolean;
}

export async function getEmployees(filters?: { search?: string; role?: string; active?: boolean }) {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("employees")
      .select("*")
      .order("employee_code", { ascending: true })
      .order("full_name");

    if (filters?.role) query = query.eq("role", filters.role);
    if (filters?.active !== undefined) query = query.eq("active", filters.active);

    const { data, error } = await query;
    if (error) { console.error("[getEmployees]", error.message); return []; }

    if (filters?.search && data) {
      const s = filters.search.toLowerCase();
      return data.filter(
        (e) =>
          e.full_name?.toLowerCase().includes(s) ||
          e.employee_code?.toLowerCase().includes(s) ||
          e.phone?.toLowerCase().includes(s) ||
          e.nic?.toLowerCase().includes(s)
      );
    }
    return data || [];
  } catch (err: any) {
    console.error("[getEmployees] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function getEmployeeById(id: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .eq("id", id)
      .single();
    if (error) { console.error("[getEmployeeById]", error.message); return null; }
    return data;
  } catch (err: any) {
    console.error("[getEmployeeById] unexpected:", err?.message ?? err);
    return null;
  }
}

export async function createEmployee(formData: EmployeeFormData) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized: Tenant session not found.");

  const { data, error } = await supabase
    .from("employees")
    .insert({ ...formData, tenant_id: tenantId })
    .select()
    .single();

  if (error) throw new Error(error.message);
  REVALIDATE_PATHS.forEach(p => revalidatePath(p));
  return data;
}

export async function bulkImportEmployees(employeesList: EmployeeFormData[]) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized: Tenant session not found.");
  if (!employeesList || employeesList.length === 0) {
    return { created: 0, updated: 0, total: 0 };
  }

  // 1. Fetch existing employees for tenant to handle updates vs inserts
  const { data: existingEmployeesData, error: fetchErr } = await supabase
    .from("employees")
    .select("id, employee_code, full_name, nic")
    .eq("tenant_id", tenantId);

  if (fetchErr) throw new Error(fetchErr.message);

  const existingEmps = existingEmployeesData || [];
  const codeMap = new Map<string, { id: string; full_name: string }>();
  const nameMap = new Map<string, { id: string; employee_code: string | null }>();
  const nicMap = new Map<string, { id: string; full_name: string }>();
  const existingCodeSet = new Set<string>();
  let maxCodeNum = 0;

  existingEmps.forEach((emp) => {
    if (emp.employee_code) {
      const codeTrimmed = emp.employee_code.trim();
      codeMap.set(codeTrimmed.toLowerCase(), { id: emp.id, full_name: emp.full_name });
      existingCodeSet.add(codeTrimmed.toUpperCase());
      const match = codeTrimmed.match(/EMP-?(\d+)/i);
      if (match) {
        const val = parseInt(match[1], 10);
        if (val > maxCodeNum) maxCodeNum = val;
      }
    }
    if (emp.full_name) {
      nameMap.set(emp.full_name.trim().toLowerCase(), { id: emp.id, employee_code: emp.employee_code });
    }
    if (emp.nic) {
      nicMap.set(emp.nic.trim().toLowerCase(), { id: emp.id, full_name: emp.full_name });
    }
  });

  let createdCount = 0;
  let updatedCount = 0;

  for (const item of employeesList) {
    const rawName = (item.full_name || "").trim();
    if (!rawName) continue;

    const rawCode = (item.employee_code || "").trim();
    const rawNic = (item.nic || "").trim();

    // Match existing employee by employee_code, NIC, or exact full_name
    let existingId: string | null = null;
    if (rawCode && codeMap.has(rawCode.toLowerCase())) {
      existingId = codeMap.get(rawCode.toLowerCase())!.id;
    } else if (rawNic && nicMap.has(rawNic.toLowerCase())) {
      existingId = nicMap.get(rawNic.toLowerCase())!.id;
    } else if (nameMap.has(rawName.toLowerCase())) {
      existingId = nameMap.get(rawName.toLowerCase())!.id;
    }

    const payload: Record<string, any> = {
      full_name: rawName,
      role: item.role || "dm",
      phone: item.phone?.trim() || null,
      nic: rawNic || null,
      address: item.address?.trim() || null,
      joining_date: item.joining_date || null,
      basic_salary: typeof item.basic_salary === "number" && !isNaN(item.basic_salary) ? item.basic_salary : 0,
      bank_name: item.bank_name?.trim() || null,
      bank_account: item.bank_account?.trim() || null,
      house_owner: Boolean(item.house_owner),
      emergency_contact: item.emergency_contact?.trim() || null,
      emergency_phone: item.emergency_phone?.trim() || null,
      reference_1_name: item.reference_1_name?.trim() || null,
      reference_1_phone: item.reference_1_phone?.trim() || null,
      reference_2_name: item.reference_2_name?.trim() || null,
      reference_2_phone: item.reference_2_phone?.trim() || null,
      active: item.active !== undefined ? item.active : true,
    };

    if (existingId) {
      if (rawCode) {
        payload.employee_code = rawCode;
      }
      const { error: updateErr } = await supabase
        .from("employees")
        .update(payload)
        .eq("id", existingId);

      if (updateErr) {
        console.error("[bulkImportEmployees] Update error:", updateErr.message);
        throw new Error(`Failed to update employee "${rawName}": ${updateErr.message}`);
      }
      updatedCount++;
    } else {
      // Determine unique employee code
      let employee_code = rawCode;
      if (!employee_code) {
        maxCodeNum++;
        employee_code = `EMP-${String(maxCodeNum).padStart(3, "0")}`;
        while (existingCodeSet.has(employee_code.toUpperCase())) {
          maxCodeNum++;
          employee_code = `EMP-${String(maxCodeNum).padStart(3, "0")}`;
        }
      } else if (existingCodeSet.has(employee_code.toUpperCase())) {
        maxCodeNum++;
        employee_code = `EMP-${String(maxCodeNum).padStart(3, "0")}`;
      }

      existingCodeSet.add(employee_code.toUpperCase());
      payload.employee_code = employee_code;
      payload.tenant_id = tenantId;

      const { data: newEmp, error: insertErr } = await supabase
        .from("employees")
        .insert(payload)
        .select("id, employee_code, full_name, nic")
        .single();

      if (insertErr) {
        console.error("[bulkImportEmployees] Insert error:", insertErr.message);
        throw new Error(`Failed to insert employee "${rawName}": ${insertErr.message}`);
      }

      if (newEmp) {
        createdCount++;
        if (newEmp.employee_code) {
          codeMap.set(newEmp.employee_code.trim().toLowerCase(), { id: newEmp.id, full_name: newEmp.full_name });
        }
        nameMap.set(newEmp.full_name.trim().toLowerCase(), { id: newEmp.id, employee_code: newEmp.employee_code });
        if (newEmp.nic) {
          nicMap.set(newEmp.nic.trim().toLowerCase(), { id: newEmp.id, full_name: newEmp.full_name });
        }
      }
    }
  }

  REVALIDATE_PATHS.forEach(p => revalidatePath(p));
  return {
    created: createdCount,
    updated: updatedCount,
    total: employeesList.length,
  };
}

export async function updateEmployee(id: string, formData: Partial<EmployeeFormData>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .update(formData)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  REVALIDATE_PATHS.forEach(p => revalidatePath(p));
  return data;
}

export async function deleteEmployee(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("employees").delete().eq("id", id);
  if (error) throw new Error(error.message);
  REVALIDATE_PATHS.forEach(p => revalidatePath(p));
}

export async function deleteEmployees(ids: string[]) {
  if (!ids.length) return;
  const supabase = await createClient();
  const BATCH_SIZE = 200;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("employees").delete().in("id", chunk);
    if (error) throw new Error(error.message);
  }
  REVALIDATE_PATHS.forEach(p => revalidatePath(p));
}

export async function getIncrements(employeeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_increments")
    .select("*")
    .eq("employee_id", employeeId)
    .order("effective_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createIncrement(employeeId: string, formData: {
  reason: string; amount: number; effective_date: string; operator?: string;
}) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized");

  const { data: incData, error: incError } = await supabase
    .from("employee_increments")
    .insert({ ...formData, employee_id: employeeId, tenant_id: tenantId })
    .select().single();
  if (incError) throw new Error(incError.message);

  const { data: emp, error: empFetchErr } = await supabase
    .from("employees")
    .select("basic_salary")
    .eq("id", employeeId)
    .single();
  if (empFetchErr) throw new Error(empFetchErr.message);

  const newSalary = Number(emp.basic_salary || 0) + Number(formData.amount);
  const { error: updateErr } = await supabase
    .from("employees")
    .update({ basic_salary: newSalary })
    .eq("id", employeeId);
  if (updateErr) throw new Error(updateErr.message);

  revalidatePath("/employee-management/directory");
  return incData;
}

export async function deleteIncrement(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("employee_increments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/employee-management/directory");
}

export async function getLoans(employeeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_loans")
    .select("*")
    .eq("employee_id", employeeId)
    .order("issued_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getActiveLoan(employeeId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employee_loans")
      .select("*")
      .eq("employee_id", employeeId)
      .in("status", ["active", "override_active"])
      .order("issued_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) { console.error("[getActiveLoan]", error.message); return null; }
    return data ?? null;
  } catch (err: any) {
    console.error("[getActiveLoan] unexpected:", err?.message ?? err);
    return null;
  }
}

export async function createLoan(employeeId: string, formData: {
  principal_amount: number;
  monthly_installment: number;
  installment_cap_pct?: number;
  status?: string;
  override_reason?: string;
  issued_date: string;
  reason?: string;
}) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("employee_loans")
    .insert({
      ...formData,
      installment_cap_pct: formData.installment_cap_pct ?? 100,
      employee_id: employeeId,
      tenant_id: tenantId,
      outstanding_balance: formData.principal_amount,
      status: formData.status || "active",
      reason: formData.reason || null,
      override_reason: formData.override_reason || "Direct installment",
    })
    .select().single();
  if (error) throw new Error(error.message);
  REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
  revalidatePath(`/employee-management/loans/${employeeId}`);
  return data;
}

export async function updateLoan(
  loanId: string,
  formData: {
    principal_amount: number;
    monthly_installment: number;
    reason?: string;
    issued_date: string;
    status?: string;
  }
) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized");

  const { data: oldLoan, error: fetchErr } = await supabase
    .from("employee_loans")
    .select("*")
    .eq("id", loanId)
    .single();
  if (fetchErr || !oldLoan) throw new Error("Loan not found");

  const oldPrincipal = Number(oldLoan.principal_amount) || 0;
  const newPrincipal = Number(formData.principal_amount) || 0;
  const diff = newPrincipal - oldPrincipal;
  const currentOutstanding = Number(oldLoan.outstanding_balance) ?? oldPrincipal;
  const newOutstanding = Math.max(0, currentOutstanding + diff);

  const { data: updatedLoan, error: updateErr } = await supabase
    .from("employee_loans")
    .update({
      principal_amount: newPrincipal,
      monthly_installment: Number(formData.monthly_installment) || 0,
      reason: formData.reason ?? null,
      issued_date: formData.issued_date,
      outstanding_balance: newOutstanding,
      installment_cap_pct: 100,
      override_reason: "Direct installment",
      ...(formData.status ? { status: formData.status } : {}),
    })
    .eq("id", loanId)
    .select()
    .single();
  if (updateErr) throw new Error(updateErr.message);

  const { error: ledgerErr } = await supabase
    .from("employee_ledger")
    .update({
      amount: newPrincipal,
      entry_date: formData.issued_date,
      description: formData.reason ? `Loan Disbursed (${formData.reason})` : "Loan Disbursed",
    })
    .eq("source_table", "employee_loans")
    .eq("source_id", loanId);
  if (ledgerErr) console.error("[updateLoan] ledger update error:", ledgerErr.message);

  await supabase
    .from("payroll_runs")
    .update({
      loan_installment_due: Number(formData.monthly_installment) || 0,
    })
    .eq("loan_id", loanId);

  REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
  revalidatePath(`/employee-management/loans/${oldLoan.employee_id}`);
  return updatedLoan;
}

export async function deleteLoan(loanId: string) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized");

  const { data: loan, error: fetchErr } = await supabase
    .from("employee_loans")
    .select("employee_id")
    .eq("id", loanId)
    .single();
  if (fetchErr || !loan) throw new Error("Loan not found");

  const employeeId = loan.employee_id;

  await supabase
    .from("employee_ledger")
    .delete()
    .eq("source_table", "employee_loans")
    .eq("source_id", loanId);

  const { data: linkedRuns } = await supabase
    .from("payroll_runs")
    .select("id, basic_salary, bonus_amount, absent_deduction, sop_violation_deduction, loan_installment_applied")
    .eq("loan_id", loanId);

  if (linkedRuns && linkedRuns.length > 0) {
    for (const run of linkedRuns) {
      await supabase
        .from("employee_ledger")
        .delete()
        .eq("source_table", "payroll_runs")
        .eq("source_id", run.id)
        .eq("type", "loan");

      const basic = Number(run.basic_salary) || 0;
      const bonus = Number(run.bonus_amount) || 0;
      const absent = Number(run.absent_deduction) || 0;
      const sopD = Number(run.sop_violation_deduction) || 0;
      const netSalary = Math.max(0, basic + bonus - absent - sopD);
      const newNetPayable = netSalary;

      await supabase
        .from("payroll_runs")
        .update({
          loan_id: null,
          loan_installment_due: 0,
          loan_installment_applied: 0,
          balance_carried: 0,
          net_payable: newNetPayable,
        })
        .eq("id", run.id);

      await supabase
        .from("employee_ledger")
        .update({ amount: newNetPayable })
        .eq("source_table", "payroll_runs")
        .eq("source_id", run.id)
        .eq("type", "salary");
    }
  }

  const { error: delErr } = await supabase
    .from("employee_loans")
    .delete()
    .eq("id", loanId);
  if (delErr) throw new Error(delErr.message);

  REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
  revalidatePath(`/employee-management/loans/${employeeId}`);
}

export async function getEmployeeLedger(employeeId: string, filters?: { fromDate?: string; toDate?: string; type?: "all" | "salary" | "loan" }) {
  const supabase = await createClient();
  let query = supabase
    .from("employee_ledger_view")
    .select("*")
    .eq("employee_id", employeeId)
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (filters?.fromDate) query = query.gte("entry_date", filters.fromDate);
  if (filters?.toDate) query = query.lte("entry_date", filters.toDate);
  if (filters?.type && filters.type !== "all") query = query.eq("type", filters.type);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getLatestEmployeeBalances(): Promise<Record<string, number>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employee_ledger_view")
      .select("employee_id, running_balance")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error || !data) return {};

    const balances: Record<string, number> = {};
    for (const row of data) {
      if (row.employee_id && !(row.employee_id in balances)) {
        balances[row.employee_id] = Number(row.running_balance || 0);
      }
    }
    return balances;
  } catch {
    return {};
  }
}

export async function getEmployeeRunningBalance(employeeId: string): Promise<number> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employee_ledger_view")
      .select("running_balance")
      .eq("employee_id", employeeId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return 0;
    return Number(data.running_balance || 0);
  } catch {
    return 0;
  }
}

