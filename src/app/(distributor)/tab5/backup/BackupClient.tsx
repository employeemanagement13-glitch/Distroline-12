"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { getBackupSignedUrl, deleteBackup, deleteBackups } from "@/lib/actions/backup";

interface Props {
  initialBackups: any[];
}

export function BackupClient({ initialBackups }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleBackupNow = () => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/backup", { method: "POST" });
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error || "Failed to trigger backup");
        }
        router.refresh();
      } catch (err: any) {
        alert(err.message);
      }
    });
  };

  const handleDownload = (filePath: string) => {
    startTransition(async () => {
      try {
        const url = await getBackupSignedUrl(filePath);
        window.open(url, "_blank");
      } catch (err: any) {
        alert(err.message);
      }
    });
  };

    const isAllSelected = initialBackups.length > 0 && initialBackups.every((b) => selectedIds.includes(b.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) setSelectedIds([]);
    else setSelectedIds(initialBackups.map((b) => b.id));
  };

  const handleBulkDelete = () => {
    if (!selectedIds.length) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected backup(s)?`)) return;
    const itemsToDelete = initialBackups
      .filter((b) => selectedIds.includes(b.id))
      .map((b) => ({ id: b.id, file_path: b.file_path }));

    startTransition(async () => {
      try {
        await deleteBackups(itemsToDelete);
        setSelectedIds([]);
        router.refresh();
      } catch (err: any) {
        alert(err.message);
      }
    });
  };

  const handleDelete = (id: string, filePath?: string) => {
    if (!confirm("Are you sure you want to permanently delete this backup?")) return;
    startTransition(async () => {
      try {
        await deleteBackup(id, filePath);
        router.refresh();
      } catch (err: any) {
        alert(err.message);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-zinc-50 p-4 rounded-lg border border-zinc-200">
        <div>
          <h3 className="font-semibold text-zinc-900">Distributor Data Backup</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Triggering a backup will dump all tables scoped to your distribution to a secure JSON file.
          </p>
          <div className="mt-2 text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-100 inline-flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            Automatic daily backups run every 24 hours for all tenants.
          </div>
        </div>
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
          <Button onClick={handleBackupNow} disabled={isPending}>
            {isPending ? "Backing up..." : "Backup Now"}
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-center"><input type="checkbox" checked={isAllSelected} onChange={handleToggleSelectAll} className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4" /></TableHead>
              <TableHead>Backup Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Triggered By</TableHead>
              <TableHead className="text-center">Download</TableHead>
              <TableHead className="text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialBackups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-zinc-400 py-8">
                  No backups found. Trigger your first backup above.
                </TableCell>
              </TableRow>
            ) : (
              initialBackups.map((item) => (
                <TableRow key={item.id} className={selectedIds.includes(item.id) ? "bg-red-50/50" : ""}>
                  <TableCell className="w-10 text-center"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => setSelectedIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])} className="rounded border-zinc-300 accent-red-600 cursor-pointer h-4 w-4" /></TableCell>
                  <TableCell suppressHydrationWarning>
                    {new Date(item.backup_date).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.status === "completed"
                          ? "success"
                          : item.status === "failed"
                          ? "destructive"
                          : "warning"
                      }
                    >
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize">{item.triggered_by === "auto" ? "Automatic Daily" : "Manual"}</TableCell>
                  {/* Download column */}
                  <TableCell className="text-center">
                    {item.status === "completed" && item.file_path ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(item.file_path)}
                        disabled={isPending}
                      >
                        Download
                      </Button>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </TableCell>
                  {/* Action column */}
                  <TableCell className="text-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => handleDelete(item.id, item.file_path)}
                      disabled={isPending}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

