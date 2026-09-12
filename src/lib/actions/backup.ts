"use server";

import { createClient, getTenantId } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

export async function getBackups() {
  try {
    const supabase = await createClient();
    const tenantId = await getTenantId();
    if (!tenantId) return [];

    let query = supabase
      .from("backups")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("backup_date", { ascending: false });

    const { data, error } = await query;
    if (error) {
      console.error("[getBackups] error:", error.message);
      return [];
    }
    return data || [];
  } catch (err: any) {
    console.error("[getBackups] unexpected error:", err?.message ?? err);
    return [];
  }
}

export async function createBackupRecord() {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized: Tenant session not found.");

  let { data, error } = await supabase
    .from("backups")
    .insert({ status: "in_progress", tenant_id: tenantId, triggered_by: "manual" })
    .select()
    .single();

  if (error && (error.message?.includes("triggered_by") || error.message?.includes("column"))) {
    const fallback = await supabase
      .from("backups")
      .insert({ status: "in_progress", tenant_id: tenantId })
      .select()
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw new Error(error.message);
  return data;
}

export async function updateBackupRecord(
  id: string,
  update: { status: "completed" | "failed"; file_path?: string }
) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized: Tenant session not found.");

  const { error } = await supabase
    .from("backups")
    .update(update)
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  revalidatePath("/tab5/backup");
}

export async function getBackupSignedUrl(filePath: string) {
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized: Tenant session not found.");

  // Strict tenant boundary check: file path must be prefixed with caller tenant ID
  if (!filePath || !filePath.startsWith(`${tenantId}/`)) {
    throw new Error("Unauthorized: Cannot access backup file of another tenant.");
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data, error } = await supabase.storage
    .from("backups")
    .createSignedUrl(filePath, 60 * 60 * 24);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function deleteBackup(id: string, filePath?: string) {
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized: Tenant session not found.");

  if (filePath && !filePath.startsWith(`${tenantId}/`)) {
    throw new Error("Unauthorized: Cannot delete backup file of another tenant.");
  }

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Delete file from storage if it belongs to tenant
  if (filePath) {
    await serviceSupabase.storage.from("backups").remove([filePath]);
  }

  // Delete the DB record scoped to tenant
  const supabase = await createClient();
  const { error } = await supabase
    .from("backups")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  revalidatePath("/tab5/backup");
}
export async function deleteBackups(items: { id: string; file_path?: string }[]) {
  if (!items.length) return;
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("Unauthorized: Tenant session not found.");

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const filePathsToRemove = items
    .map((i) => i.file_path)
    .filter((fp): fp is string => !!fp && fp.startsWith(`${tenantId}/`));

  if (filePathsToRemove.length > 0) {
    await serviceSupabase.storage.from("backups").remove(filePathsToRemove);
  }

  const ids = items.map((i) => i.id);
  const supabase = await createClient();
  const { error } = await supabase
    .from("backups")
    .delete()
    .in("id", ids)
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);
  revalidatePath("/tab5/backup");
}