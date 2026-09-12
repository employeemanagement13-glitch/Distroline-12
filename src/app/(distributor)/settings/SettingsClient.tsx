"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { updateAlertSettings, updateCreditInvoicesLimit } from "@/lib/actions/settings";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";

interface Props {
  initialSettings: any;
  initialAlerts: any;
  globalAlerts: any[];
}

export function SettingsClient({ initialSettings, initialAlerts, globalAlerts }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isPendingCredit, startTransitionCredit] = useTransition();

  const [creditInvoicesLimit, setCreditInvoicesLimit] = useState(
    String(initialSettings?.credit_invoices_limit ?? "1")
  );

  const [alerts, setAlerts] = useState({
    cash_not_deposited_enabled: initialAlerts.cash_not_deposited_enabled,
    cash_not_deposited_hours: String(initialAlerts.cash_not_deposited_hours ?? "24"),
    overdue_threshold_enabled: initialAlerts.overdue_threshold_enabled,
    overdue_threshold_days: String(initialAlerts.overdue_threshold_days ?? "0"),
  });

  const cashNotDepositedGloballyEnabled = globalAlerts.find(ga => ga.alert_type === 'cash_not_deposited')?.enabled ?? true;
  const overdueThresholdGloballyEnabled = globalAlerts.find(ga => ga.alert_type === 'overdue_threshold')?.enabled ?? true;

  useRealtimeTable('global_alert_settings', () => router.refresh());

  const handleSaveCreditLimit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(creditInvoicesLimit, 10);
    if (isNaN(val) || val < 1) {
      alert("Credit Invoices Limit must be at least 1.");
      return;
    }
    startTransitionCredit(async () => {
      try {
        await updateCreditInvoicesLimit(val);
        router.refresh();
        alert("Credit Invoices Limit updated successfully.");
      } catch (err: any) {
        alert(err.message);
      }
    });
  };

  const handleSaveAlerts = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        await updateAlertSettings({
          cash_not_deposited_enabled: alerts.cash_not_deposited_enabled,
          cash_not_deposited_hours: parseInt(alerts.cash_not_deposited_hours) || 24,
          overdue_threshold_enabled: alerts.overdue_threshold_enabled,
          overdue_threshold_days: parseInt(alerts.overdue_threshold_days) || 0,
        });
        router.refresh();
        alert("Alert settings updated successfully.");
      } catch (err: any) {
        alert(err.message);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Credit Invoices Limit Configuration */}
      <form onSubmit={handleSaveCreditLimit} className="bg-white rounded-lg border border-zinc-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-md font-bold text-zinc-900">Credit Invoices Limit</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Global limit applied across all shops (default = 1). Governs when any credit outlet automatically becomes overdue.
            </p>
          </div>
          <Badge variant="default" className="text-xs">Global Policy</Badge>
        </div>

        <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1">
            <div className="font-semibold text-zinc-800 text-sm">
              Allowed Unpaid Invoices
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              If an outlet exceeds this number of unpaid credit invoices (e.g. limit is {creditInvoicesLimit || 1}, and {Number(creditInvoicesLimit || 1) + 1} or more invoices are generated while previous remain unpaid), the outlet is automatically marked as <span className="text-red-600 font-semibold">OVERDUE</span> and a real-time alert is generated in Tab 7 Alerts.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-700">Limit:</span>
            <Input
              type="number"
              min="1"
              step="1"
              value={creditInvoicesLimit}
              onChange={(e) => setCreditInvoicesLimit(e.target.value)}
              className="w-24 text-center font-bold text-base"
              required
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={isPendingCredit}>
            {isPendingCredit ? "Saving Limit..." : "Save Credit Invoices Limit"}
          </Button>
        </div>
      </form>

      <form onSubmit={handleSaveAlerts} className="bg-white rounded-lg border border-zinc-200 shadow-sm p-6 space-y-4">
        <h3 className="text-md font-bold text-zinc-900">Alert Configuration</h3>
        <p className="text-xs text-zinc-500">
          Set custom timeframes and thresholds to trigger discrepancy and overdue alerts.
          {!cashNotDepositedGloballyEnabled && " (Cash Not Deposited disabled globally)"}
          {!overdueThresholdGloballyEnabled && " (Overdue Threshold disabled globally)"}
        </p>

        <div className="space-y-4">
          {overdueThresholdGloballyEnabled && (
            <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1">
                <div className="font-semibold text-zinc-800 flex items-center gap-2">
                  <span>Overdue Account Days Trigger</span>
                  <Badge variant={alerts.overdue_threshold_enabled ? "success" : "secondary"}>
                    {alerts.overdue_threshold_enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  Generates a system alert if a credit invoice remains unpaid for this many days after its due date.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={alerts.overdue_threshold_enabled}
                  onChange={(e) =>
                    setAlerts({ ...alerts, overdue_threshold_enabled: e.target.checked })
                  }
                  className="rounded border-zinc-300 text-red-600 focus:ring-indigo-500 h-4 w-4"
                />
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-600">Days:</span>
                  <Input
                    type="number"
                    min="0"
                    value={alerts.overdue_threshold_days}
                    onChange={(e) =>
                      setAlerts({ ...alerts, overdue_threshold_days: e.target.value })
                    }
                    className="w-20"
                    disabled={!alerts.overdue_threshold_enabled}
                  />
                </div>
              </div>
            </div>
          )}

          {!cashNotDepositedGloballyEnabled && !overdueThresholdGloballyEnabled && (
            <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200 text-center text-zinc-500 text-sm">
              All alert types are currently disabled by the platform administrator.
            </div>
          )}
        </div>

        {overdueThresholdGloballyEnabled && (
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving configuration..." : "Save Alert Settings"}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}