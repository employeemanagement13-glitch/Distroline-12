"use server";

import { createClient, getTenantId } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const REVALIDATE = ["/employee-management/payroll"];

export async function getPayrollSOPs() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("payroll_sops")
      .select("*")
      .order("date_from", { ascending: false });
    if (error) { console.error("[getPayrollSOPs]", error.message); return []; }
    return data || [];
  } catch (err: any) {
    console.error("[getPayrollSOPs] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function createPayrollSOP(formData: {
  name: string;
  date_from: string;
  date_to: string;
  shift_start: string;
  shift_end: string;
  morning_grace_minutes?: number;
  grace_limit_days?: number;
  grace_deduction_days?: number;
  grace_limit_repeats_monthly?: boolean;
  after_grace_deduct_days?: number;
  stack_deductions?: boolean;
  holiday_bonus_days?: number;
  thumb_miss_deduct_days?: number;
  biometric_enabled?: boolean;
  short_leave_start?: string;
  before_sl_deduct_days?: number;
  short_leave_limit_days?: number;
  after_sl_deduct_days?: number;
}) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("payroll_sops")
    .insert({ ...formData, tenant_id: tenantId })
    .select().single();
  if (error) throw new Error(error.message);
  REVALIDATE.forEach(p => revalidatePath(p));
  return data;
}

export async function updatePayrollSOP(id: string, formData: Record<string, any>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_sops")
    .update(formData)
    .eq("id", id)
    .select().single();
  if (error) throw new Error(error.message);
  REVALIDATE.forEach(p => revalidatePath(p));
  return data;
}

export async function deletePayrollSOP(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("payroll_sops").delete().eq("id", id);
  if (error) throw new Error(error.message);
  REVALIDATE.forEach(p => revalidatePath(p));
}

export async function getPayrollRuns(filters?: { month?: string; employeeId?: string }) {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("payroll_runs")
      .select(`
        *,
        employee:employees(id, employee_code, full_name, role, basic_salary, bank_name, bank_account, joining_date),
        sop:payroll_sops(id, name, biometric_enabled, shift_start, shift_end),
        loan:employee_loans(id, principal_amount, outstanding_balance, installment_cap_pct, status, override_reason)
      `)
      .order("salary_month", { ascending: false })
      .order("created_at", { ascending: false });

    if (filters?.month) {
      query = query.gte("salary_month", `${filters.month}-01`)
                   .lt("salary_month", `${filters.month}-32`);
    }
    if (filters?.employeeId) {
      query = query.eq("employee_id", filters.employeeId);
    }

    const { data, error } = await query;
    if (error) { console.error("[getPayrollRuns]", error.message); return []; }
    return data || [];
  } catch (err: any) {
    console.error("[getPayrollRuns] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function getPayrollRunById(id: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("payroll_runs")
      .select(`
        *,
        employee:employees(id, employee_code, full_name, role, bank_name, bank_account, joining_date),
        sop:payroll_sops(id, name, biometric_enabled, shift_start, shift_end, morning_grace_minutes, grace_limit_days),
        loan:employee_loans(id, principal_amount, outstanding_balance, installment_cap_pct, status, override_reason)
      `)
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);
    return data;
  } catch (err: any) {
    console.error("[getPayrollRunById] unexpected:", err?.message ?? err);
    return null;
  }
}

export async function createPayrollRun(formData: {
  employee_id: string;
  sop_id?: string;
  loan_id?: string;
  salary_month: string;
  expense_date?: string;
  working_days: number;
  basic_salary: number;
  bonus_amount?: number;
  absent_deduction?: number;
  sop_violation_deduction?: number;
  loan_installment_due?: number;
  loan_installment_applied?: number;
  balance_carried?: number;
  operator?: string;
  computer_voucher?: string;
  bank_account_id?: string;
}) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized");

  let { data, error } = await supabase
    .from("payroll_runs")
    .insert({ ...formData, tenant_id: tenantId })
    .select(`
      *,
      employee:employees(id, employee_code, full_name, role)
    `)
    .single();

  if (error && (error.message.includes("schema cache") || error.message.includes("column"))) {
    const { expense_date, bank_account_id, ...safePayload } = formData;
    const retry = await supabase
      .from("payroll_runs")
      .insert({ ...safePayload, tenant_id: tenantId })
      .select(`
        *,
        employee:employees(id, employee_code, full_name, role)
      `)
      .single();
    if (retry.error) throw new Error(retry.error.message);
    data = retry.data;
  } else if (error) {
    throw new Error(error.message);
  }

  REVALIDATE.forEach(p => revalidatePath(p));
  revalidatePath("/expenses/agency");
  revalidatePath("/cash-bank/bank-accounts");
  return data;
}

export async function updatePayrollRun(id: string, formData: Record<string, any>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_runs")
    .update(formData)
    .eq("id", id)
    .select().single();
  if (error) throw new Error(error.message);
  REVALIDATE.forEach(p => revalidatePath(p));
  revalidatePath("/cash-bank/bank-accounts");
  return data;
}

export async function deletePayrollRun(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("payroll_runs").delete().eq("id", id);
  if (error) throw new Error(error.message);
  REVALIDATE.forEach(p => revalidatePath(p));
  revalidatePath("/cash-bank/bank-accounts");
}

export async function getSalaryHeadView(month?: string) {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("salary_head_view")
      .select("*")
      .order("year", { ascending: false })
      .order("month");

    const { data, error } = await query;

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    if (!error && data && data.length > 0) {
      const mapped = data.map((r: any) => {
        const mIdx = monthNames.findIndex((m) => m.toLowerCase() === r.month?.trim().toLowerCase());
        const mStr = mIdx >= 0 ? String(mIdx + 1).padStart(2, "0") : "01";
        const dateStr = r.salary_month || r.expense_date || (r.year && r.month ? `${r.year}-${mStr}-01` : "");
        return {
          ...r,
          date: dateStr,
          expense_date: r.expense_date || dateStr,
          salary_month: r.salary_month || dateStr,
          name: r.name || r.employee_name || r.full_name || "",
          employee_name: r.name || r.employee_name || r.full_name || "",
        };
      });
      if (month) {
        return mapped.filter((r) => r.month?.trim().toLowerCase() === month.toLowerCase());
      }
      return mapped;
    }

    const { data: runs, error: runsErr } = await supabase
      .from("payroll_runs")
      .select(`
        id,
        tenant_id,
        salary_month,
        expense_date,
        net_payable,
        employee:employees(employee_code, full_name, role)
      `)
      .order("salary_month", { ascending: false });

    if (runsErr || !runs) return [];

    const fallbackData = runs.map((r: any) => {
      const d = r.salary_month ? new Date(r.salary_month) : new Date();
      const mName = monthNames[d.getUTCMonth()] || "";
      const yr = d.getUTCFullYear();
      const emp = Array.isArray(r.employee) ? r.employee[0] : r.employee;
      const empName = emp?.full_name || "";
      const dateStr = r.expense_date || (r.salary_month ? String(r.salary_month).slice(0, 10) : `${yr}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`);
      return {
        tenant_id: r.tenant_id,
        employee_code: emp?.employee_code || "",
        name: empName,
        employee_name: empName,
        role: emp?.role || "",
        date: dateStr,
        expense_date: dateStr,
        salary_month: r.salary_month,
        month: mName,
        year: yr,
        net_payable: r.net_payable,
        source: "Payroll Run auto",
      };
    });

    if (month) {
      return fallbackData.filter((r) => r.month?.trim().toLowerCase() === month.toLowerCase());
    }
    return fallbackData;
  } catch (err: any) {
    console.error("[getSalaryHeadView] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function deletePayrollRuns(ids: string[]) {
  if (!ids.length) return;
  const supabase = await createClient();
  const BATCH_SIZE = 200;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("payroll_runs").delete().in("id", chunk);
    if (error) throw new Error(error.message);
  }
  REVALIDATE.forEach(p => revalidatePath(p));
  revalidatePath("/cash-bank/bank-accounts");
}