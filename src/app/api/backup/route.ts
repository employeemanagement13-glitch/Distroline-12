import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient, getTenantId } from "@/lib/supabase/server";
import { updateBackupRecord } from "@/lib/actions/backup";

export async function POST() {
  const supabase = await createClient();
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let { data: backupRow, error: insertErr } = await supabase
    .from("backups")
    .insert({ status: "in_progress", tenant_id: tenantId, triggered_by: "manual" })
    .select()
    .single();

  if (insertErr && (insertErr.message?.includes("triggered_by") || insertErr.message?.includes("column"))) {
    const fallback = await supabase
      .from("backups")
      .insert({ status: "in_progress", tenant_id: tenantId })
      .select()
      .single();
    backupRow = fallback.data;
    insertErr = fallback.error;
  }

  if (insertErr || !backupRow) {
    return NextResponse.json({ error: insertErr?.message || "Failed to create backup" }, { status: 500 });
  }

  try {
    const tenantId = backupRow.tenant_id as string;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = `${tenantId}/${timestamp}.json`;

    const tables = [
      "invoices", "shops", "employees", "warehouse_stock",
      "damaged_stock", "returns_wayback", "stock_audits",
      "empties_log", "route_assignments", "dm_routes",
      "cash_deposits", "ccbpl_purchases", "agency_expenses",
      "agency_ledger", "ccbpl_penalties", "late_deliveries", "alerts",
      "bank_accounts", "vendor_accounts", "payroll_runs", "fuel_entries",
      "vehicle_maintenance", "vehicle_registry",
    ];

    const backup: Record<string, any[]> = {};
    for (const table of tables) {
      const { data } = await supabase.from(table).select("*");
      backup[table] = data || [];
    }

    const json = JSON.stringify(backup, null, 2);
    const bytes = new TextEncoder().encode(json);

    // Ensure bucket exists
    const { data: bucketData, error: bucketError } = await serviceSupabase.storage.getBucket("backups");
    if (bucketError && bucketError.message.includes("not found")) {
      await serviceSupabase.storage.createBucket("backups", {
        public: false,
        fileSizeLimit: 52428800, // 50MB
      });
    } else if (bucketError && !bucketError.message.includes("not found")) {
      console.error("Error checking bucket:", bucketError);
    }

    const { error: uploadErr } = await serviceSupabase.storage
      .from("backups")
      .upload(filePath, bytes, {
        contentType: "application/json",
        upsert: false,
      });

    if (uploadErr) throw new Error(uploadErr.message);

    await updateBackupRecord(backupRow.id, {
      status: "completed",
      file_path: filePath,
    });

    return NextResponse.json({ id: backupRow.id, file_path: filePath });
  } catch (err: any) {
    await updateBackupRecord(backupRow.id, { status: "failed" });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
