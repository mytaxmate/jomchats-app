import "server-only"; // hard guard: this module must never reach a client bundle
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Server-only Supabase client using the SERVICE ROLE key.
 * Bypasses RLS — only ever runs inside server functions (§8.2).
 */
let _admin: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (_admin) return _admin;
  _admin = createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _admin;
}

/** The single pilot tenant id. */
export const TENANT_ID = () => env.tenantId();
