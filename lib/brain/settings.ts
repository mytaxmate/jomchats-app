import "server-only";
import { db, TENANT_ID } from "../db";
import type { Persona } from "./prompts";

export interface TenantSettings {
  persona: Persona;
  shadow: boolean;
  budgetUsdDaily: number;
  sentimentHandoverThreshold: number;
}

const DEFAULTS: TenantSettings = {
  persona: { name: "Aisha", clientName: "the appointed sales team", manglish: true },
  shadow: true, // shadow is the default until go-live (§15 P6)
  budgetUsdDaily: 5,
  sentimentHandoverThreshold: -0.4,
};

/** Read tenant settings.config (jsonb) and fold onto safe defaults. */
export async function loadSettings(): Promise<TenantSettings> {
  const { data } = await db()
    .from("settings")
    .select("config")
    .eq("tenant_id", TENANT_ID())
    .maybeSingle();

  const c = (data?.config ?? {}) as Record<string, unknown>;
  const persona = (c.persona ?? {}) as Record<string, unknown>;
  return {
    persona: {
      name: (persona.name as string) ?? DEFAULTS.persona.name,
      clientName:
        (persona.client_name as string) ??
        (c.client_name as string) ??
        DEFAULTS.persona.clientName,
      manglish: (persona.manglish as boolean) ?? DEFAULTS.persona.manglish,
    },
    shadow: (c.shadow as boolean) ?? DEFAULTS.shadow,
    budgetUsdDaily: (c.budget_usd_daily as number) ?? DEFAULTS.budgetUsdDaily,
    sentimentHandoverThreshold:
      (c.sentiment_handover_threshold as number) ??
      DEFAULTS.sentimentHandoverThreshold,
  };
}
