import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";
  if (process.env.CRON_SECRET && !isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { data: tenantRows, error: tErr } = await serviceSupabase
      .from("tenants")
      .select("id");

    if (tErr) throw tErr;
    if (!tenantRows || tenantRows.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: "No tenants found" });
    }

    const tenantIds = tenantRows.map((t: any) => t.id).filter(Boolean);

    const tables = [
      "invoices", "shops", "employees", "warehouse_stock",
      "damaged_stock", "returns_wayback", "stock_audits",
      "empties_log", "route_assignments", "dm_routes",
      "cash_deposits", "ccbpl_purchases", "agency_expenses",
      "agency_ledger", "ccbpl_penalties", "late_deliveries", "alerts",
      "bank_accounts", "vendor_accounts", "payroll_runs", "fuel_entries",
      "vehicle_maintenance", "vehicle_registry",
    ];

    let successCount = 0;
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    for (const tenantId of tenantIds) {
      const { data: lastBackup } = await serviceSupabase
        .from("backups")
        .select("backup_date")
        .eq("tenant_id", tenantId)
        .eq("status", "completed")
        .order("backup_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastBackup && lastBackup.backup_date > cutoff24h) {
        continue;
      }

      let { data: backupRow, error: insertErr } = await serviceSupabase
        .from("backups")
        .insert({ status: "in_progress", tenant_id: tenantId, triggered_by: "auto" })
        .select()
        .single();

      if (insertErr && (insertErr.message?.includes("triggered_by") || insertErr.message?.includes("column"))) {
        const fallback = await serviceSupabase
          .from("backups")
          .insert({ status: "in_progress", tenant_id: tenantId })
          .select()
          .single();
        backupRow = fallback.data;
        insertErr = fallback.error;
      }

      if (insertErr || !backupRow) {
        console.error(`[cron/backups] insert failed for tenant ${tenantId}:`, insertErr?.message);
        continue;
      }

      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filePath = `${tenantId}/${timestamp}.json`;
        const backup: Record<string, any[]> = {};

        for (const table of tables) {
          const { data } = await serviceSupabase
            .from(table)
            .select("*")
            .eq("tenant_id", tenantId);
          backup[table] = data || [];
        }

        const json = JSON.stringify(backup, null, 2);
        const bytes = new TextEncoder().encode(json);

        const { data: bucketData, error: bucketError } = await serviceSupabase.storage.getBucket("backups");
        if (bucketError && bucketError.message.includes("not found")) {
          await serviceSupabase.storage.createBucket("backups", {
            public: false,
            fileSizeLimit: 52428800,
          });
        }

        const { error: uploadErr } = await serviceSupabase.storage
          .from("backups")
          .upload(filePath, bytes, { contentType: "application/json", upsert: false });

        if (uploadErr) throw new Error(uploadErr.message);

        await serviceSupabase
          .from("backups")
          .update({ status: "completed", file_path: filePath })
          .eq("id", backupRow.id);

        successCount++;
      } catch (err: any) {
        await serviceSupabase
          .from("backups")
          .update({ status: "failed" })
          .eq("id", backupRow.id);
      }
    }

    return NextResponse.json({ success: true, count: successCount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
