import { getSettings } from "@/lib/actions/settings";
import { SettingsClient } from "./SettingsClient";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function SettingsPage() {
  const { settings, alerts, globalAlerts } = await getSettings();

  return (
    <div className="p-6">
      <PageHeader
        title="Distributor Settings"
        subtitle="Configure auto-assignment features and alert rule thresholds"
      />
      <SettingsClient initialSettings={settings} initialAlerts={alerts} globalAlerts={globalAlerts} />
    </div>
  );
}

