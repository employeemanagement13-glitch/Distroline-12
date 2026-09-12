import { getBackups } from "@/lib/actions/backup";
import { BackupClient } from "./BackupClient";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function BackupPage() {
  const backups = await getBackups();
  return (
    <div className="p-6">
      <PageHeader
        title="Data Backup"
        subtitle="Tab 5, Page 1 — Backup and download tenant-scoped data safely"
      />
      <BackupClient initialBackups={backups} />
    </div>
  );
}

