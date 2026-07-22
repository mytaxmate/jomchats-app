import "server-only";

/**
 * Server-side env access. Fails loudly if a required var is missing.
 * NEVER import this into a client component.
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  supabaseUrl: () => required("SUPABASE_URL"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseAnonKey: () => optional("SUPABASE_ANON_KEY"),
  tenantId: () => required("TENANT_ID"),
  // "TZ" is reserved on Vercel — use APP_TZ. Format dates explicitly in this zone.
  appTz: () => optional("APP_TZ", "Asia/Kuala_Lumpur"),
  anthropicKey: () => required("ANTHROPIC_API_KEY"),
  answerModel: () => optional("ANSWER_MODEL"),
  fastModel: () => optional("FAST_MODEL"),
  // Simulator gate (§8.9): the private test chat requires this header.
  simulatorSecret: () => optional("SIMULATOR_SECRET"),
  // Meta / WhatsApp Cloud API (§14). Optional so builds pass before setup.
  metaAppSecret: () => optional("META_APP_SECRET"),
  metaVerifyToken: () => optional("META_VERIFY_TOKEN"),
  metaWaToken: () => optional("META_WA_TOKEN"),
  metaPhoneNumberId: () => optional("META_PHONE_NUMBER_ID"),
  // Filled in as later phases land:
  voyageKey: () => optional("VOYAGE_API_KEY"),
};
