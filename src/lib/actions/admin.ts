"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { createClerkClient, currentUser } from "@clerk/nextjs/server";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// Helper to check if caller is platform admin
async function checkAdmin() {
  const user = await currentUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail) {
    throw new Error("Unauthorized: Platform Admin access required.");
  }
  const primaryEmail = user.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId
  )?.emailAddress;

  if (primaryEmail !== adminEmail) {
    throw new Error("Unauthorized: Platform Admin access required.");
  }
}

// --------------------------------------------------------------------------
// TENANTS CRUD
// --------------------------------------------------------------------------
export async function getTenants() {
  noStore();
  try {
    await checkAdmin();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("tenants")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[getTenants] error:", error.message);
      return [];
    }
    return data || [];
  } catch (err: any) {
    console.error("[getTenants] unexpected error:", err?.message ?? err);
    return [];
  }
}

export async function createTenant(formData: {
  distro_name: string;
  email: string;
  phone_number: string;
  access_enabled?: boolean;
}) {
  await checkAdmin();
  const supabase = createAdminClient();
  
  // Insert tenant into Supabase
  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .insert({
      distro_name: formData.distro_name,
      email: formData.email,
      phone_number: formData.phone_number,
      access_enabled: formData.access_enabled !== undefined ? formData.access_enabled : true,
    })
    .select()
    .single();

  if (tenantErr) throw new Error(tenantErr.message);

  // Link Clerk User metadata if user exists
  try {
    const clerkUsers = await clerk.users.getUserList({
      emailAddress: [formData.email.toLowerCase().trim()],
    });
    if (clerkUsers.data && clerkUsers.data.length > 0) {
      const user = clerkUsers.data[0];
      await clerk.users.updateUser(user.id, {
        publicMetadata: {
          tenant_id: tenant.id,
        },
      });
    }
  } catch (err: any) {
    console.error("Clerk metadata link warning:", err.message);
  }

  revalidatePath("/admin/dashboard");
  return tenant;
}

export async function updateTenant(
  id: string,
  formData: {
    distro_name?: string;
    email?: string;
    phone_number?: string;
    access_enabled?: boolean;
  }
) {
  await checkAdmin();
  const supabase = createAdminClient();
  const { data: tenant, error } = await supabase
    .from("tenants")
    .update(formData)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  // If email updated, relink Clerk metadata
  if (formData.email) {
    try {
      const clerkUsers = await clerk.users.getUserList({
        emailAddress: [formData.email.toLowerCase().trim()],
      });
      if (clerkUsers.data && clerkUsers.data.length > 0) {
        const user = clerkUsers.data[0];
        await clerk.users.updateUser(user.id, {
          publicMetadata: {
            tenant_id: tenant.id,
          },
        });
      }
    } catch (err: any) {
      console.error("Clerk metadata relink warning:", err.message);
    }
  }

  revalidatePath("/admin/dashboard");
  return tenant;
}

export async function deleteTenant(id: string) {
  await checkAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase.from("tenants").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/dashboard");
}

// --------------------------------------------------------------------------
// GLOBAL FEATURE FLAGS & TENANT CONFIG
// --------------------------------------------------------------------------
export async function getGlobalFlags() {
  noStore();
  try {
    await checkAdmin();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("global_feature_flags")
      .select("*")
      .order("flag_key");
    if (error) {
      console.error("[getGlobalFlags] error:", error.message);
      return [];
    }
    return data || [];
  } catch (err: any) {
    console.error("[getGlobalFlags] unexpected error:", err?.message ?? err);
    return [];
  }
}

export async function updateGlobalFlag(flagKey: string, enabled: boolean, label?: string) {
  await checkAdmin();
  const supabase = createAdminClient();
  
  const payload: { flag_key: string; enabled: boolean; label?: string } = {
    flag_key: flagKey,
    enabled,
  };
  if (label) payload.label = label;

  const { error } = await supabase
    .from("global_feature_flags")
    .upsert(payload, { onConflict: "flag_key" });
  if (error) throw new Error(error.message);
  
  // If enabling globally, remove all tenant-specific overrides so the global setting takes effect
  if (enabled) {
    const { error: deleteError } = await supabase
      .from("tenant_feature_flags")
      .delete()
      .eq("flag_key", flagKey);
    if (deleteError) console.error("Failed to clear tenant overrides:", deleteError);
  }
  
  try {
    const bc = supabase.channel("broadcast_channel_global_feature_flags");
    bc.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        bc.send({
          type: "broadcast",
          event: "change",
          payload: { flag_key: flagKey, enabled },
        });
      }
    });
  } catch (_) {}

  revalidatePath("/admin/settings");
  revalidatePath("/admin/tenants"); // Revalidate tenant pages too since they show global flags
  revalidatePath("/"); // Revalidate all distributor pages since sidebar may change
}

export async function getTenantConfig(tenantId: string) {
  noStore();
  try {
    await checkAdmin();
    const supabase = createAdminClient();
    const { data: globalFlags, error: gErr } = await supabase
      .from("global_feature_flags")
      .select("*")
      .order("flag_key");
    if (gErr) {
      console.error("[getTenantConfig] global flags error:", gErr.message);
      return { globalMap: {}, tenantMap: {} };
    }

    const { data: tenantFlags, error: tErr } = await supabase
      .from("tenant_feature_flags")
      .select("*")
      .eq("tenant_id", tenantId);
    if (tErr) {
      console.error("[getTenantConfig] tenant flags error:", tErr.message);
      return { globalMap: {}, tenantMap: {} };
    }

    const globalMap: Record<string, boolean> = {};
    for (const gf of globalFlags || []) {
      globalMap[gf.flag_key] = gf.enabled;
    }

    const tenantMap: Record<string, boolean> = {};
    for (const tf of tenantFlags || []) {
      tenantMap[tf.flag_key] = tf.enabled;
    }

    return {
      globalMap,
      tenantMap,
    };
  } catch (err: any) {
    console.error("[getTenantConfig] unexpected error:", err?.message ?? err);
    return { globalMap: {}, tenantMap: {} };
  }
}

export async function updateTenantFlag(tenantId: string, flagKey: string, enabled: boolean) {
  await checkAdmin();
  const supabase = createAdminClient();

  const { data: gf } = await supabase
    .from("global_feature_flags")
    .select("flag_key")
    .eq("flag_key", flagKey)
    .single();

  if (!gf) {
    await supabase.from("global_feature_flags").insert({
      flag_key: flagKey,
      label: flagKey,
      enabled: true,
    });
  }

  const { error } = await supabase
    .from("tenant_feature_flags")
    .upsert({ tenant_id: tenantId, flag_key: flagKey, enabled }, { onConflict: "tenant_id,flag_key" })
    .select();
  if (error) throw new Error(error.message);

  try {
    const bc = supabase.channel("broadcast_channel_tenant_feature_flags");
    bc.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        bc.send({
          type: "broadcast",
          event: "change",
          payload: { tenant_id: tenantId, flag_key: flagKey, enabled },
        });
      }
    });
  } catch (_) {}

  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath("/"); // Revalidate distributor pages since sidebar may change
}

// --------------------------------------------------------------------------
// GLOBAL ALERT SETTINGS
// --------------------------------------------------------------------------
export async function getGlobalAlertSettings() {
  noStore();
  try {
    await checkAdmin();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("global_alert_settings")
      .select("*")
      .order("alert_type");
    if (error) {
      console.error("[getGlobalAlertSettings] error:", error.message);
      return [];
    }
    return data || [];
  } catch (err: any) {
    console.error("[getGlobalAlertSettings] unexpected error:", err?.message ?? err);
    return [];
  }
}

export async function updateGlobalAlertSetting(alertType: string, enabled: boolean) {
  await checkAdmin();
  const supabase = createAdminClient();
  
  // Update global alert setting
  const { error } = await supabase
    .from("global_alert_settings")
    .update({ enabled })
    .eq("alert_type", alertType);
  if (error) throw new Error(error.message);
  
  // If enabling globally, reset all tenant-specific overrides to enabled
  if (enabled) {
    const { error: updateError } = await supabase
      .from("tenant_alert_settings")
      .update({ 
        cash_not_deposited_enabled: true,
        overdue_threshold_enabled: true 
      });
    if (updateError) console.error("Failed to reset tenant alert overrides:", updateError);
  }
  
  revalidatePath("/admin/settings");
  revalidatePath("/admin/tenants"); // Revalidate tenant pages since they show global alerts
  revalidatePath("/settings"); // Revalidate distributor settings page
}

// --------------------------------------------------------------------------
// BROADCAST BANNERS
// --------------------------------------------------------------------------
export async function getBanner() {
  noStore();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_broadcast_banners")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return null;
  return data && data.length > 0 ? data[0] : null;
}

export async function setBanner(message: string) {
  await checkAdmin();
  const supabase = createAdminClient();
  // Deactivate old active banners first
  await supabase
    .from("admin_broadcast_banners")
    .update({ active: false })
    .eq("active", true);

  const { data, error } = await supabase
    .from("admin_broadcast_banners")
    .insert({ message, active: true })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/"); // Revalidate all pages since banner shows everywhere
  revalidatePath("/admin/settings");
  return data;
}

export async function deactivateBanner() {
  await checkAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("admin_broadcast_banners")
    .update({ active: false })
    .eq("active", true);
  if (error) throw new Error(error.message);
  revalidatePath("/"); // Revalidate all pages since banner shows everywhere
  revalidatePath("/admin/settings");
}

// --------------------------------------------------------------------------
// ACCESS LOGS
// --------------------------------------------------------------------------
export async function getLogs() {
  noStore();
  try {
    await checkAdmin();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("admin_logs")
      .select("pk_timestamp, ip_address, is_mdos_user, tenant_id, visited_pages, pages_visited, user_id, tenant:tenants(distro_name)")
      .order("pk_timestamp", { ascending: false });
    if (error) {
      console.error("[getLogs] error:", error.message);
      return [];
    }

    const userIds = Array.from(new Set((data || []).map((l: any) => l.user_id).filter(Boolean)));
    const userMap: Record<string, { email?: string; name?: string }> = {};

    if (userIds.length > 0) {
      try {
        const clerkUsers = await clerk.users.getUserList({ userId: userIds });
        for (const u of clerkUsers.data) {
          const email =
            u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ||
            u.emailAddresses[0]?.emailAddress;
          const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || email;
          userMap[u.id] = { email, name };
        }
      } catch (clerkErr) {
        console.error("[getLogs] Clerk enrichment error:", clerkErr);
      }
    }

    const adminEmail = process.env.ADMIN_EMAIL;

    return (data || []).map((l: any) => {
      const uInfo = userMap[l.user_id];
      const isMdos = Boolean(
        l.is_mdos_user ||
        l.user_id ||
        l.tenant_id ||
        uInfo?.email ||
        (l.visited_pages || []).length > 0
      );

      return {
        ...l,
        is_mdos_user: isMdos,
        user_email: uInfo?.email || null,
        user_name: uInfo?.name || null,
      };
    });
  } catch (err: any) {
    console.error("[getLogs] unexpected error:", err?.message ?? err);
    return [];
  }
}

export async function deleteLog(pkTimestamp: string) {
  await checkAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase.from("admin_logs").delete().eq("pk_timestamp", pkTimestamp);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/logs");
}

export async function getTenantAlertSettings(tenantId: string) {
  noStore();
  const defaultSettings = {
    cash_not_deposited_enabled: false,
    cash_not_deposited_hours: 24,
    overdue_threshold_enabled: false,
    overdue_threshold_days: 0,
  };
  try {
    await checkAdmin();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("tenant_alert_settings")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();
    if (error && error.code !== "PGRST116") {
      console.error("[getTenantAlertSettings] error:", error.message);
      return defaultSettings;
    }
    return data || defaultSettings;
  } catch (err: any) {
    console.error("[getTenantAlertSettings] unexpected error:", err?.message ?? err);
    return defaultSettings;
  }
}

