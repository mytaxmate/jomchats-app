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
  // Filled in as later phases land:
  anthropicKey: () => optional("ANTHROPIC_API_KEY"),
  answerModel: () => optional("ANSWER_MODEL"),
  fastModel: () => optional("FAST_MODEL"),
};
