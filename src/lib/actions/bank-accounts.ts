"use server";

import { createClient, getTenantId } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const REVALIDATE = ["/cash-bank/bank-accounts", "/cash-bank/deposits", "/inventory/sell-in"];



// ---- BANK ACCOUNTS --------------------------------------------------------------------------------------------------------------------------

export async function getBankAccounts() {
  try {
    const supabase = await createClient();
    const { data: accounts, error } = await supabase
      .from("bank_accounts")
      .select("*")
      .order("bank_name")
      .order("account_title");
    if (error) { console.error("[getBankAccounts]", error.message); return []; }
    if (!accounts || accounts.length === 0) return [];

    const { data: ledgerData } = await supabase
      .from("bank_account_ledger")
      .select("bank_account_id, amount_in, amount_out");

    const totalsMap: Record<string, number> = {};
    (ledgerData || []).forEach((row: any) => {
      const bId = row.bank_account_id;
      const net = Number(row.amount_in || 0) - Number(row.amount_out || 0);
      totalsMap[bId] = (totalsMap[bId] || 0) + net;
    });

    return accounts.map((acc: any) => ({
      ...acc,
      current_balance: Number(acc.current_balance || 0) + (totalsMap[acc.id] || 0),
    }));
  } catch (err: any) {
    console.error("[getBankAccounts] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function createBankAccount(formData: {
  bank_name: string;
  account_title: string;
  account_number?: string;
  current_balance?: number;
  active?: boolean;
}) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("bank_accounts")
    .insert({ ...formData, tenant_id: tenantId })
    .select().single();
  if (error) throw new Error(error.message);
  REVALIDATE.forEach(p => revalidatePath(p));
  return data;
}

export async function updateBankAccount(id: string, formData: {
  bank_name?: string;
  account_title?: string;
  account_number?: string;
  active?: boolean;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_accounts")
    .update(formData)
    .eq("id", id)
    .select().single();
  if (error) throw new Error(error.message);
  REVALIDATE.forEach(p => revalidatePath(p));
  return data;
}

export async function deleteBankAccount(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  REVALIDATE.forEach(p => revalidatePath(p));
}

// ---- BANK ACCOUNT LEDGER (view) ------------------------------------------------------------------------------------------------

export async function getBankAccountLedger(bankAccountId: string) {
  try {
    const supabase = await createClient();

    // 1) Fetch initial opening balance (stored in bank_accounts.current_balance)
    const { data: bankAccount, error: accError } = await supabase
      .from("bank_accounts")
      .select("current_balance, created_at")
      .eq("id", bankAccountId)
      .single();

    if (accError) {
      console.error("[getBankAccountLedger] Bank account error:", accError.message);
      return [];
    }

    // 2) Fetch ledger entries
    const { data, error } = await supabase
      .from("bank_account_ledger")
      .select("*")
      .eq("bank_account_id", bankAccountId)
      .order("txn_date", { ascending: true })
      .order("amount_in", { ascending: false });
      
    if (error) {
      console.error("[getBankAccountLedger]", error.message);
      return [];
    }

    const rows = (data || []).map((row: any) => ({
      ...row,
      amount_in: Number(row.amount_in || 0),
      amount_out: Number(row.amount_out || 0),
    }));

    const initialOpeningBalance = Number(bankAccount?.current_balance || 0);
    let accum = initialOpeningBalance;
    const computed = rows.map((row: any) => {
      accum = accum + row.amount_in - row.amount_out;
      return {
        ...row,
        running_balance: accum,
      };
    });

    // Prepend Opening Balance row
    if (initialOpeningBalance > 0 || computed.length === 0) {
      computed.unshift({
        txn_date: bankAccount?.created_at
          ? new Date(bankAccount.created_at).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        txn_type: "Opening Balance",
        reference: "—",
        amount_in: 0,
        amount_out: 0,
        running_balance: initialOpeningBalance,
      });
    }

    return computed;
  } catch (err: any) {
    console.error("[getBankAccountLedger] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function getVendorAccounts() {
  try {
    const supabase = await createClient();
    const { data: accounts, error } = await supabase
      .from("vendor_accounts")
      .select("*")
      .order("vendor_name")
      .order("account_title");
    if (error) { console.error("[getVendorAccounts]", error.message); return []; }
    if (!accounts || accounts.length === 0) return [];

    const { data: ledgerData } = await supabase
      .from("vendor_account_ledger")
      .select("vendor_account_id, amount_in, amount_out");

    const totalsMap: Record<string, number> = {};
    (ledgerData || []).forEach((row: any) => {
      const vId = row.vendor_account_id;
      const net = Number(row.amount_in || 0) - Number(row.amount_out || 0);
      totalsMap[vId] = (totalsMap[vId] || 0) + net;
    });

    return accounts.map((acc: any) => ({
      ...acc,
      current_balance: Number(acc.current_balance || 0) + (totalsMap[acc.id] || 0),
    }));
  } catch (err: any) {
    console.error("[getVendorAccounts] unexpected:", err?.message ?? err);
    return [];
  }
}

export async function createVendorAccount(formData: {
  vendor_name: string;
  account_title: string;
  account_number?: string;
  current_balance?: number;
  active?: boolean;
}) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("vendor_accounts")
    .insert({ ...formData, tenant_id: tenantId })
    .select().single();
  if (error) throw new Error(error.message);
  REVALIDATE.forEach(p => revalidatePath(p));
  return data;
}

export async function updateVendorAccount(id: string, formData: {
  vendor_name?: string;
  account_title?: string;
  account_number?: string;
  active?: boolean;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendor_accounts")
    .update(formData)
    .eq("id", id)
    .select().single();
  if (error) throw new Error(error.message);
  REVALIDATE.forEach(p => revalidatePath(p));
  return data;
}

export async function deleteVendorAccount(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("vendor_accounts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  REVALIDATE.forEach(p => revalidatePath(p));
}

export async function getVendorAccountLedger(vendorAccountId: string) {
  try {
    const supabase = await createClient();

    const { data: vendorAccount, error: accError } = await supabase
      .from("vendor_accounts")
      .select("current_balance, created_at")
      .eq("id", vendorAccountId)
      .single();

    if (accError) {
      console.error("[getVendorAccountLedger] account error:", accError.message);
      return [];
    }

    const { data, error } = await supabase
      .from("vendor_account_ledger")
      .select("*")
      .eq("vendor_account_id", vendorAccountId)
      .order("txn_date", { ascending: true })
      .order("amount_in", { ascending: false });

    if (error) {
      console.error("[getVendorAccountLedger]", error.message);
      return [];
    }

    const rows = (data || []).map((row: any) => ({
      ...row,
      amount_in: Number(row.amount_in || 0),
      amount_out: Number(row.amount_out || 0),
    }));

    const initialOpeningBalance = 0;
    let accum = initialOpeningBalance;
    const computed = rows.map((row: any) => {
      accum = accum + row.amount_in - row.amount_out;
      return { ...row, running_balance: accum };
    });

    if (initialOpeningBalance > 0) {
      computed.unshift({
        txn_date: vendorAccount?.created_at
          ? new Date(vendorAccount.created_at).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        txn_type: "Opening Balance",
        reference: "—",
        amount_in: 0,
        amount_out: 0,
        running_balance: initialOpeningBalance,
      });
    }

    return computed;
  } catch (err: any) {
    console.error("[getVendorAccountLedger] unexpected:", err?.message ?? err);
    return [];
  }
}

