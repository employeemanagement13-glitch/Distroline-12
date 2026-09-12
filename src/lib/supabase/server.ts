import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function createClient() {
  const cookieStore = await cookies()
  const { getToken } = await auth()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignored if called from a Server Component
          }
        },
      },
      global: {
        fetch: async (url, options = {}) => {
          let clerkToken: string | null = null;
          try {
            clerkToken = await getToken();
          } catch {
            clerkToken = null;
          }
          const headers = new Headers(options?.headers);
          
          if (clerkToken) {
            try {
              const payloadBase64 = clerkToken.split('.')[1];
              if (payloadBase64) {
                const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
                if (payload.exp && payload.exp * 1000 <= Date.now()) {
                  clerkToken = null;
                }
              }
            } catch {
            }
          }

          if (clerkToken) {
            headers.set('Authorization', `Bearer ${clerkToken}`);
          } else if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
            headers.set('Authorization', `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`);
          }
          
          return fetch(url, { ...options, headers });
        },
      },
    }
  )
}

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function getTenantId() {
  const { userId, sessionClaims } = await auth();
  if (!userId) return undefined;
  
  if ((sessionClaims as any)?.tenant_id) {
    return (sessionClaims as any).tenant_id as string;
  }
  
  // If we reach here, sessionClaims is missing tenant_id. 
  // Let's check if the user actually has it in their metadata to distinguish between 
  // an unassigned user and a misconfigured/stale Clerk token.
  try {
    const { createClerkClient } = await import("@clerk/nextjs/server");
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const user = await clerk.users.getUser(userId);
    
    if (user.publicMetadata?.tenant_id) {
      throw new Error(
        "Clerk Session Claims missing 'tenant_id', but it exists in user metadata. " +
        "Please ensure you have configured 'Customize session token' in the Clerk Dashboard " +
        "(Settings -> Sessions) with: { \"tenant_id\": \"{{user.public_metadata.tenant_id}}\" }. " +
        "If already configured, please sign out and sign back in to refresh your token."
      );
    } else {
      throw new Error("Unauthorized: Your user account is not assigned to any tenant. Please contact your platform administrator.");
    }
  } catch (err: any) {
    if (err.message.includes("Clerk Session Claims missing") || err.message.includes("not assigned to any tenant")) {
      throw err;
    }
    console.error("Clerk fetch error in getTenantId:", err);
  }
  
  return undefined;
}

export async function checkTenantAccess() {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return { authorized: false, reason: "not_authenticated" };
  }
  
  const tenantId = (sessionClaims as any)?.tenant_id;
  if (!tenantId) {
    return { authorized: false, reason: "no_tenant_assigned" };
  }
  
  // Check if tenant has access_enabled = true
  try {
    const supabase = await createClient();
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('access_enabled, distro_name')
      .eq('id', tenantId)
      .single();
    
    if (error || !tenant) {
      return { authorized: false, reason: "tenant_not_found" };
    }
    
    if (!tenant.access_enabled) {
      return { authorized: false, reason: "tenant_disabled" };
    }
    
    return { authorized: true, tenantId, distroName: tenant.distro_name };
  } catch (err) {
    console.error("Error checking tenant access:", err);
    return { authorized: false, reason: "check_failed" };
  }
}

export async function getCurrentDistroName(): Promise<string | null> {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return null;
    const supabase = await createClient();
    const { data: tenant } = await supabase
      .from('tenants')
      .select('distro_name')
      .eq('id', tenantId)
      .single();
    return tenant?.distro_name || null;
  } catch (err) {
    return null;
  }
}
