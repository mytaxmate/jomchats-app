# JomChats — app (Aurum = first tenant)

AI WhatsApp concierge ("Aisha") for **AURUM @ Bandar Sunway**. Single-tenant pilot,
schema carries `tenant_id` everywhere so it grows into the multi-client JomChats SaaS.

Full spec: `AURUM-PILOT-BUILD-PLAN.md` (source of truth).

## Three non-negotiables
1. **The knowledge vault must never leak.** Client data lives only in our own Supabase.
2. **The bot must never hallucinate.** Every fact traces to the vault; else it hands over.
3. **Every answer is observable.** Every AI turn is logged and reviewable.

## Stack
- **Next.js 15** (App Router, TypeScript) on **Vercel** (JomChats account).
- **Supabase** (Postgres + pgvector + Auth + Storage) — the vault. Project `jomchats-aurum`, region Singapore.
- Anthropic API (answers + verification), Voyage embeddings, Meta WhatsApp Cloud API, Resend. *(wired in later phases)*

> Note: the build plan named Netlify for its 15-min background functions. This build runs on
> Vercel to keep one ecosystem with the marketing site; the async pipeline + timed jobs
> (P2/P4) will use Vercel functions + a Postgres `jobs` queue, with Supabase `pg_cron` or
> Vercel Cron for scheduling. Revisit if long-running background work needs more than Vercel allows.

## Status — P0 (foundations) ✅
- [x] Repo + Next.js app + minimal (data-free) public page + `/api/health`
- [x] Full DB schema (`supabase/migrations/0001_init.sql`) — RLS on every table
- [x] Seed: tenant, staff, booking types, 20 verified facts, verbatim-gap rows (`supabase/seed.sql`)
- [x] `.env.example` (every var), Supabase project provisioned
- [ ] Env values set in Vercel; deployed; RLS verified (anon → 0 rows)

## Next: P1 — Vault + Brain + Simulator
Ingestion, embeddings, hybrid retrieval, the message pipeline (§6), verifier, numeric check,
`ai_turns` logging, and the eval harness (≥60 golden cases). Nothing sends until shadow exit (§15 P6).

## Local dev
```bash
npm install
cp .env.example .env.local   # fill in the Supabase keys (see Supabase → Project Settings → API)
npm run dev                  # http://localhost:3000  (/api/health returns active_facts)
npm run typecheck
```

## Database
Apply schema + seed via the Supabase SQL Editor (or CLI):
`supabase/migrations/0001_init.sql` then `supabase/seed.sql`.

## Secrets
Never commit `.env*`. Set values only in Vercel env. `lib/db.ts` is `server-only` and must
never reach a client bundle.
