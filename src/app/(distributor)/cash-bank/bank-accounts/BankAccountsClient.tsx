"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/Table";
import {
  createBankAccount, updateBankAccount, deleteBankAccount, getBankAccountLedger,
  createVendorAccount, updateVendorAccount, deleteVendorAccount, getVendorAccountLedger,
} from "@/lib/actions/bank-accounts";
import { ExportButtons } from "@/components/export/ExportButtons";
import { Loader2 } from "lucide-react";

const BLANK_BANK = { bank_name: "", account_title: "", account_number: "", current_balance: "0", active: true };
const BLANK_VENDOR = { vendor_name: "", account_title: "", account_number: "", current_balance: "0", active: true };

interface BankAccount {
  id: string;
  bank_name: string;
  account_title: string;
  account_number?: string;
  current_balance: number;
  active: boolean;
  isDummy?: boolean;
}

interface VendorAccount {
  id: string;
  vendor_name: string;
  account_title: string;
  account_number?: string;
  current_balance: number;
  active: boolean;
}

interface LedgerRow {
  id: string;
  txn_date: string;
  txn_type: string;
  reference?: string;
  amount_in: number;
  amount_out: number;
  running_balance: number;
}

interface BankFormState {
  bank_name: string;
  account_title: string;
  account_number: string;
  current_balance: string;
  active: boolean;
}

interface VendorFormState {
  vendor_name: string;
  account_title: string;
  account_number: string;
  current_balance: string;
  active: boolean;
}

const BANK_NAMES = [
  "MCB", "HBL", "Meezan Bank", "Askari Bank", "UBL",
  "Bank Al Habib", "Allied Bank", "Faysal Bank", "NBP", "Other",
];

function BalancePill({ balance }: { balance: number }) {
  return (
    <span
      className="text-lg font-bold"
      style={{ color: balance >= 0 ? "var(--primary)" : "#dc2626" }}
    >
      Rs. {balance.toLocaleString(undefined, { minimumFractionDigits: 0 })}
    </span>
  );
}

interface Props {
  initialAccounts: BankAccount[];
  initialVendorAccounts?: VendorAccount[];
}

export function BankAccountsClient({ initialAccounts, initialVendorAccounts = [] }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Major Switch State
  const [majorTab, setMajorTab] = useState<"bank" | "vendor">("bank");

  // Bank Accounts State
  const [showBankModal, setShowBankModal] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [bankForm, setBankForm] = useState<BankFormState>({ ...BLANK_BANK });

  const allBankAccounts = initialAccounts;
  const [activeBankTabId, setActiveBankTabId] = useState<string | null>(allBankAccounts[0]?.id || null);
  const [bankLedgerCache, setBankLedgerCache] = useState<Record<string, LedgerRow[]>>({});
  const [loadingBankLedger, setLoadingBankLedger] = useState(false);

  // Vendor Accounts State
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [vendorForm, setVendorForm] = useState<VendorFormState>({ ...BLANK_VENDOR });

  const allVendorAccounts = initialVendorAccounts;
  const [activeVendorTabId, setActiveVendorTabId] = useState<string | null>(allVendorAccounts[0]?.id || null);
  const [vendorLedgerCache, setVendorLedgerCache] = useState<Record<string, LedgerRow[]>>({});
  const [loadingVendorLedger, setLoadingVendorLedger] = useState(false);

  // Dates
  const today = new Date().toISOString().split("T")[0];
  const firstDayOfMonth = `${today.substring(0, 8)}01`;
  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(today);
  const [appliedFromDate, setAppliedFromDate] = useState(firstDayOfMonth);
  const [appliedToDate, setAppliedToDate] = useState(today);
  const [isFilteringBank, setIsFilteringBank] = useState(false);
  const [isFilteringVendor, setIsFilteringVendor] = useState(false);

  const handleLoadBank = async () => {
    setIsFilteringBank(true);
    try {
      if (activeBankTabId && !activeBankAccount?.isDummy) {
        const rows = await getBankAccountLedger(activeBankTabId);
        setBankLedgerCache((prev) => ({ ...prev, [activeBankTabId]: rows }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAppliedFromDate(fromDate);
      setAppliedToDate(toDate);
      setIsFilteringBank(false);
    }
  };

  const handleLoadVendor = async () => {
    setIsFilteringVendor(true);
    try {
      if (activeVendorTabId) {
        const rows = await getVendorAccountLedger(activeVendorTabId);
        setVendorLedgerCache((prev) => ({ ...prev, [activeVendorTabId]: rows }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAppliedFromDate(fromDate);
      setAppliedToDate(toDate);
      setIsFilteringVendor(false);
    }
  };

  const setBank = (k: keyof BankFormState, v: string | boolean) => setBankForm((f) => ({ ...f, [k]: v }));
  const setVendor = (k: keyof VendorFormState, v: string | boolean) => setVendorForm((f) => ({ ...f, [k]: v }));

  const totalBankBalance = allBankAccounts
    .filter((a) => a.active)
    .reduce((s, a) => s + Number(a.current_balance || 0), 0);

  const totalVendorBalance = allVendorAccounts
    .filter((a) => a.active)
    .reduce((s, a) => s + Number(a.current_balance || 0), 0);

  // Bank Modals & Handlers
  const openAddBank = () => {
    setEditingBankId(null);
    setBankForm({ ...BLANK_BANK });
    setShowBankModal(true);
  };

  const openEditBank = (acc: BankAccount) => {
    if (acc.isDummy) {
      alert("This is a dummy bank account preview and cannot be edited.");
      return;
    }
    setEditingBankId(acc.id);
    setBankForm({
      bank_name: acc.bank_name || "",
      account_title: acc.account_title || "",
      account_number: acc.account_number || "",
      current_balance: String(acc.current_balance ?? 0),
      active: acc.active ?? true,
    });
    setShowBankModal(true);
  };

  const handleDeleteBank = (id: string) => {
    startTransition(async () => {
      try {
        await deleteBankAccount(id);
        if (activeBankTabId === id) setActiveBankTabId(initialAccounts[0]?.id || null);
        router.refresh();
      } catch (error) {
        if (error instanceof Error) alert(error.message);
      }
    });
  };

  const handleSubmitBank = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const payload = {
          bank_name: bankForm.bank_name,
          account_title: bankForm.account_title,
          account_number: bankForm.account_number || undefined,
          active: bankForm.active,
          ...(editingBankId ? {} : { current_balance: parseFloat(bankForm.current_balance) || 0 }),
        };
        if (editingBankId) await updateBankAccount(editingBankId, payload);
        else await createBankAccount(payload);
        setShowBankModal(false);
        router.refresh();
      } catch (error) {
        if (error instanceof Error) alert(error.message);
      }
    });
  };

  // Vendor Modals & Handlers
  const openAddVendor = () => {
    setEditingVendorId(null);
    setVendorForm({ ...BLANK_VENDOR });
    setShowVendorModal(true);
  };

  const openEditVendor = (acc: VendorAccount) => {
    setEditingVendorId(acc.id);
    setVendorForm({
      vendor_name: acc.vendor_name || "",
      account_title: acc.account_title || "",
      account_number: acc.account_number || "",
      current_balance: String(acc.current_balance ?? 0),
      active: acc.active ?? true,
    });
    setShowVendorModal(true);
  };

  const handleDeleteVendor = (id: string) => {
    startTransition(async () => {
      try {
        await deleteVendorAccount(id);
        if (activeVendorTabId === id) setActiveVendorTabId(initialVendorAccounts[0]?.id || null);
        router.refresh();
      } catch (error) {
        if (error instanceof Error) alert(error.message);
      }
    });
  };

  const handleSubmitVendor = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const payload = {
          vendor_name: vendorForm.vendor_name,
          account_title: vendorForm.account_title,
          account_number: vendorForm.account_number || undefined,
          active: vendorForm.active,
          ...(editingVendorId ? {} : { current_balance: parseFloat(vendorForm.current_balance) || 0 }),
        };
        if (editingVendorId) await updateVendorAccount(editingVendorId, payload);
        else await createVendorAccount(payload);
        setShowVendorModal(false);
        router.refresh();
      } catch (error) {
        if (error instanceof Error) alert(error.message);
      }
    });
  };

  // Fetch Bank Ledger when active tab changes
  const activeBankAccount = useMemo(
    () => allBankAccounts.find((a) => a.id === activeBankTabId),
    [allBankAccounts, activeBankTabId]
  );

  useEffect(() => {
    if (majorTab !== "bank" || !activeBankTabId || !activeBankAccount || activeBankAccount.isDummy) return;
    if (bankLedgerCache[activeBankTabId]) return;

    const bankAccountId = activeBankTabId;
    let isMounted = true;

    async function loadLedger() {
      setLoadingBankLedger(true);
      try {
        const rows = await getBankAccountLedger(bankAccountId);
        if (isMounted) {
          setBankLedgerCache((prev) => ({ ...prev, [bankAccountId]: rows }));
        }
      } catch {
        // Ignore fetch errors
      } finally {
        if (isMounted) setLoadingBankLedger(false);
      }
    }

    void loadLedger();
    return () => { isMounted = false; };
  }, [majorTab, activeBankTabId, activeBankAccount, bankLedgerCache]);

  // Fetch Vendor Ledger when active tab changes
  const activeVendorAccount = useMemo(
    () => allVendorAccounts.find((a) => a.id === activeVendorTabId),
    [allVendorAccounts, activeVendorTabId]
  );

  useEffect(() => {
    if (majorTab !== "vendor" || !activeVendorTabId || !activeVendorAccount) return;
    if (vendorLedgerCache[activeVendorTabId]) return;

    const vendorAccountId = activeVendorTabId;
    let isMounted = true;

    async function loadLedger() {
      setLoadingVendorLedger(true);
      try {
        const rows = await getVendorAccountLedger(vendorAccountId);
        if (isMounted) {
          setVendorLedgerCache((prev) => ({ ...prev, [vendorAccountId]: rows }));
        }
      } catch {
        // Ignore fetch errors
      } finally {
        if (isMounted) setLoadingVendorLedger(false);
      }
    }

    void loadLedger();
    return () => { isMounted = false; };
  }, [majorTab, activeVendorTabId, activeVendorAccount, vendorLedgerCache]);

  // Filtered rows
  const currentBankLedgerRows = activeBankTabId ? (bankLedgerCache[activeBankTabId] || []) : [];
  const isDummyAccount = activeBankAccount?.isDummy ?? false;
  const filteredBankLedgerRows = currentBankLedgerRows.map((row: LedgerRow) => {
    if (row.txn_type === "Sell In Payment") {
      const actualOut = Math.abs(Number(row.amount_out || 0)) + Math.abs(Number(row.amount_in || 0));
      return { ...row, amount_in: 0, amount_out: actualOut };
    }
    return row;
  }).filter((row: LedgerRow) => {
    if (!row.txn_date) return true;
    return row.txn_date >= appliedFromDate && row.txn_date <= appliedToDate;
  });

  const exportBankLedgerData = useMemo(() => {
    return filteredBankLedgerRows.map((row) => ({
      Date: row.txn_date || "—",
      Type: row.txn_type || "—",
      Reference: row.reference || "—",
      "In (Rs.)": row.amount_in ? Number(row.amount_in) : 0,
      "Out (Rs.)": row.amount_out ? Number(row.amount_out) : 0,
      "Running Balance (Rs.)": Number(row.running_balance) || 0,
    }));
  }, [filteredBankLedgerRows]);

  const currentVendorLedgerRows = activeVendorTabId ? (vendorLedgerCache[activeVendorTabId] || []) : [];
  const filteredVendorLedgerRows = currentVendorLedgerRows.filter((row: LedgerRow) => {
    if (!row.txn_date) return true;
    return row.txn_date >= appliedFromDate && row.txn_date <= appliedToDate;
  });

  const exportVendorLedgerData = useMemo(() => {
    return filteredVendorLedgerRows.map((row) => ({
      Date: row.txn_date || "—",
      Type: row.txn_type || "—",
      Reference: row.reference || "—",
      "In (Rs.)": row.amount_in ? Number(row.amount_in) : 0,
      "Out (Rs.)": row.amount_out ? Number(row.amount_out) : 0,
      "Running Balance (Rs.)": Number(row.running_balance) || 0,
    }));
  }, [filteredVendorLedgerRows]);

  return (
    <div className="space-y-6">
      {/* ── MAJOR SWITCHES ── */}
      <div className="flex border-b border-zinc-200 gap-6">
        <button
          onClick={() => setMajorTab("bank")}
          className={`pb-3 text-base font-bold transition-colors border-b-2 ${
            majorTab === "bank"
              ? "border-[var(--primary)] text-[var(--primary)]"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          Bank Accounts
        </button>
        <button
          onClick={() => setMajorTab("vendor")}
          className={`pb-3 text-base font-bold transition-colors border-b-2 ${
            majorTab === "vendor"
              ? "border-[var(--primary)] text-[var(--primary)]"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          Vendor Accounts
        </button>
      </div>

      {/* ── BANK ACCOUNTS MAJOR TAB ── */}
      {majorTab === "bank" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Total Bank Balance (Active Accounts)</p>
              <BalancePill balance={totalBankBalance} />
            </div>
            <Button onClick={openAddBank}>+ Add Bank Account</Button>
          </div>

          {initialAccounts.length === 0 ? (
            <div className="text-center text-zinc-400 py-12 bg-white rounded-lg border border-zinc-200">
              No bank accounts added yet
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {allBankAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => setActiveBankTabId(acc.id)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                      activeBankTabId === acc.id
                        ? "text-white border-transparent shadow-sm"
                        : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
                    }`}
                    style={activeBankTabId === acc.id ? { background: "var(--primary)" } : undefined}
                  >
                    {acc.bank_name} ({acc.account_title})
                  </button>
                ))}
              </div>

              {activeBankAccount && (
                <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 bg-zinc-50">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                        style={{ background: "var(--primary)" }}
                      >
                        {activeBankAccount.bank_name?.charAt(0) || "B"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-zinc-900 text-lg">{activeBankAccount.account_title}</p>
                          {!activeBankAccount.active && <Badge variant="secondary">Inactive</Badge>}
                        </div>
                        <p className="text-sm text-zinc-500">
                          {activeBankAccount.bank_name}
                          {activeBankAccount.account_number ? ` · ${activeBankAccount.account_number}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xs text-zinc-500 mb-0.5">Current Balance</p>
                        <BalancePill balance={Number(activeBankAccount.current_balance || 0)} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEditBank(activeBankAccount)}>
                          Edit Info
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => handleDeleteBank(activeBankAccount.id)}
                          disabled={isPending}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="px-5 py-3 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-4 bg-white">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-zinc-600">From Date</label>
                        <Input
                          type="date"
                          value={fromDate}
                          onChange={(e) => setFromDate(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-zinc-600">To Date</label>
                        <Input
                          type="date"
                          value={toDate}
                          onChange={(e) => setToDate(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="default"
                        disabled={isFilteringBank || loadingBankLedger}
                        onClick={handleLoadBank}
                      >
                        {isFilteringBank ? (
                          <span className="flex items-center">
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                            Loading...
                          </span>
                        ) : (
                          "Load"
                        )}
                      </Button>
                    </div>
                    <ExportButtons
                      data={exportBankLedgerData}
                      filename={`${activeBankAccount.bank_name || "bank"}_${activeBankAccount.account_title || "account"}_ledger`}
                    />
                  </div>

                  <div className="overflow-x-auto bg-white flex-1">
                    {loadingBankLedger && !isDummyAccount ? (
                      <div className="text-center text-zinc-400 py-12 text-sm">Loading ledger...</div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-zinc-50">
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Reference</TableHead>
                            <TableHead className="text-right">In (Rs.)</TableHead>
                            <TableHead className="text-right">Out (Rs.)</TableHead>
                            <TableHead className="text-right">Running Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredBankLedgerRows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-zinc-400 py-12">
                                No transactions found for the selected dates.
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredBankLedgerRows.map((row: LedgerRow, i: number) => (
                              <TableRow key={i}>
                                <TableCell>{row.txn_date}</TableCell>
                                <TableCell>
                                  <Badge variant={row.txn_type === "Deposit" ? "success" : "secondary"}>
                                    {row.txn_type}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-xs">{row.reference || "—"}</TableCell>
                                <TableCell className="text-right text-green-700">
                                  {row.amount_in ? `Rs. ${Number(row.amount_in).toLocaleString()}` : "—"}
                                </TableCell>
                                <TableCell className="text-right text-red-600">
                                  {row.amount_out ? `Rs. ${Number(row.amount_out).toLocaleString()}` : "—"}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  Rs.{" "}
                                  {(Number(row.running_balance) || 0).toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                  })}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── VENDOR ACCOUNTS MAJOR TAB ── */}
      {majorTab === "vendor" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Total Vendor Credit Balance</p>
              <BalancePill balance={totalVendorBalance} />
            </div>
            <Button onClick={openAddVendor}>+ Add Vendor Account</Button>
          </div>

          {initialVendorAccounts.length === 0 ? (
            <div className="text-center text-zinc-400 py-12 bg-white rounded-lg border border-zinc-200">
              No vendor accounts added yet. Click "+ Add Vendor Account" to create sub accounts for On-Credit tracking.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {allVendorAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => setActiveVendorTabId(acc.id)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                      activeVendorTabId === acc.id
                        ? "text-white border-transparent shadow-sm"
                        : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
                    }`}
                    style={activeVendorTabId === acc.id ? { background: "var(--primary)" } : undefined}
                  >
                    {acc.vendor_name} ({acc.account_title})
                  </button>
                ))}
              </div>

              {activeVendorAccount && (
                <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 bg-zinc-50">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                        style={{ background: "var(--primary)" }}
                      >
                        {activeVendorAccount.vendor_name?.charAt(0) || "V"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-zinc-900 text-lg">{activeVendorAccount.account_title}</p>
                          {!activeVendorAccount.active && <Badge variant="secondary">Inactive</Badge>}
                        </div>
                        <p className="text-sm text-zinc-500">
                          {activeVendorAccount.vendor_name}
                          {activeVendorAccount.account_number ? ` · ${activeVendorAccount.account_number}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xs text-zinc-500 mb-0.5">Current Balance</p>
                        <BalancePill balance={Number(activeVendorAccount.current_balance || 0)} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEditVendor(activeVendorAccount)}>
                          Edit Info
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => handleDeleteVendor(activeVendorAccount.id)}
                          disabled={isPending}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="px-5 py-3 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-4 bg-white">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-zinc-600">From Date</label>
                        <Input
                          type="date"
                          value={fromDate}
                          onChange={(e) => setFromDate(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-zinc-600">To Date</label>
                        <Input
                          type="date"
                          value={toDate}
                          onChange={(e) => setToDate(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="default"
                        disabled={isFilteringVendor || loadingVendorLedger}
                        onClick={handleLoadVendor}
                      >
                        {isFilteringVendor ? (
                          <span className="flex items-center">
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                            Loading...
                          </span>
                        ) : (
                          "Load"
                        )}
                      </Button>
                    </div>
                    <ExportButtons
                      data={exportVendorLedgerData}
                      filename={`${activeVendorAccount.vendor_name || "vendor"}_${activeVendorAccount.account_title || "account"}_ledger`}
                    />
                  </div>

                  <div className="overflow-x-auto bg-white flex-1">
                    {loadingVendorLedger ? (
                      <div className="text-center text-zinc-400 py-12 text-sm">Loading vendor ledger...</div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-zinc-50">
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Reference</TableHead>
                            <TableHead className="text-right">In (Rs.)</TableHead>
                            <TableHead className="text-right">Out (Rs.)</TableHead>
                            <TableHead className="text-right">Running Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredVendorLedgerRows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-zinc-400 py-12">
                                No transactions found for the selected dates.
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredVendorLedgerRows.map((row: LedgerRow, i: number) => (
                              <TableRow key={i}>
                                <TableCell>{row.txn_date}</TableCell>
                                <TableCell className="font-medium text-xs">
                                  <Badge variant={row.txn_type.includes("Billed") ? "success" : "warning"}>
                                    {row.txn_type}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-xs">{row.reference || "—"}</TableCell>
                                <TableCell className="text-right text-amber-700">
                                  {row.amount_in ? `Rs. ${Number(row.amount_in).toLocaleString()}` : "—"}
                                </TableCell>
                                <TableCell className="text-right text-green-700">
                                  {row.amount_out ? `Rs. ${Number(row.amount_out).toLocaleString()}` : "—"}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  Rs.{" "}
                                  {(Number(row.running_balance) || 0).toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                  })}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Bank Modal */}
      {showBankModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-zinc-900 mb-5">
              {editingBankId ? "Edit Bank Account" : "Add Bank Account"}
            </h3>
            <form onSubmit={handleSubmitBank} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Bank Name *</label>
                <select
                  className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white"
                  value={bankForm.bank_name}
                  onChange={(e) => setBank("bank_name", e.target.value)}
                  required
                >
                  <option value="">— Select bank —</option>
                  {BANK_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Account Title *</label>
                <Input value={bankForm.account_title} onChange={(e) => setBank("account_title", e.target.value)} required placeholder="e.g. Imran Ali" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Account Number</label>
                <Input value={bankForm.account_number} onChange={(e) => setBank("account_number", e.target.value)} placeholder="e.g. 0123456789" />
              </div>
              {!editingBankId && (
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Opening Balance (Rs.)</label>
                  <Input type="number" step="0.01" min="0" value={bankForm.current_balance} onChange={(e) => setBank("current_balance", e.target.value)} />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                <input type="checkbox" checked={bankForm.active} onChange={(e) => setBank("active", e.target.checked)} className="w-4 h-4 rounded" />
                Active
              </label>
              <div className="flex gap-2 pt-2">
                <Button type="submit" className="flex-1" disabled={isPending}>{isPending ? "Saving…" : "Save Account"}</Button>
                <Button type="button" variant="outline" onClick={() => setShowBankModal(false)}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Vendor Modal */}
      {showVendorModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-zinc-900 mb-5">
              {editingVendorId ? "Edit Vendor Account" : "Add Vendor Account"}
            </h3>
            <form onSubmit={handleSubmitVendor} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Vendor Name *</label>
                <Input
                  value={vendorForm.vendor_name}
                  onChange={(e) => setVendor("vendor_name", e.target.value)}
                  required
                  placeholder="e.g. CCBPL Vendor"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Account Title *</label>
                <Input
                  value={vendorForm.account_title}
                  onChange={(e) => setVendor("account_title", e.target.value)}
                  required
                  placeholder="e.g. CCBPL Credit Account"
                />
              </div>

              {!editingVendorId && (
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Opening Balance (Rs.)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={vendorForm.current_balance}
                    onChange={(e) => setVendor("current_balance", e.target.value)}
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={vendorForm.active}
                  onChange={(e) => setVendor("active", e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                Active
              </label>
              <div className="flex gap-2 pt-2">
                <Button type="submit" className="flex-1" disabled={isPending}>
                  {isPending ? "Saving…" : "Save Account"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowVendorModal(false)}>
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
