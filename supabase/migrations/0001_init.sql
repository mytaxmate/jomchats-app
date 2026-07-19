-- ============================================================================
-- JomChats · Aurum pilot — initial schema (BUILD_PLAN §5)
-- The VAULT. Everything lives here. RLS enabled on every table.
-- ============================================================================

create extension if not exists vector;      -- pgvector for embeddings
create extension if not exists pgcrypto;    -- gen_random_uuid()

-- ============================ People & conversations ========================
create table contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  wa_phone text not null,                 -- E.164, unique per tenant
  wa_name text,
  first_source text,                      -- 'ig-bio' | 'fb-ctwa' | 'tiktok' | 'qr' | 'direct'
  language text default 'en',             -- rolling detected: en | ms | zh
  is_test boolean default false,          -- simulator & team numbers; excluded from analytics
  lead jsonb default '{}'::jsonb,         -- {purpose, budget_band, timeline, financing, eligibility_notes}
  lead_score text default 'new',          -- new | warm | hot | disqualified
  opted_out boolean default false,
  created_at timestamptz default now(),
  unique (tenant_id, wa_phone)
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contact_id uuid not null references contacts(id),
  mode text not null default 'ai',        -- 'ai' | 'human' | 'shadow'
  status text not null default 'open',    -- open | closed
  last_customer_msg_at timestamptz,       -- drives 24h service-window logic
  assigned_staff_id uuid,
  created_at timestamptz default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  conversation_id uuid not null references conversations(id),
  wamid text unique,                       -- Meta message id → idempotency/dedupe
  direction text not null,                 -- 'in' | 'out'
  sender text not null,                    -- 'customer' | 'ai' | 'staff:<id>' | 'system'
  type text not null default 'text',       -- text | image | interactive | template | audio | document
  body text,
  media_path text,                         -- Storage path (private bucket), never a public URL
  status text,                             -- sent | delivered | read | failed
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ================================ The vault =================================
create table kb_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  title text not null,
  storage_path text not null,              -- private bucket 'vault'
  classification text not null default 'internal',  -- 'internal' | 'shareable'
  status text not null default 'processing',        -- processing | learned | disabled
  pages int, sha256 text, uploaded_by uuid,
  created_at timestamptz default now()
);

create table kb_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  document_id uuid references kb_documents(id) on delete cascade,
  content text not null,                   -- ≤ ~350 tokens, with heading breadcrumb prefix
  page int,
  embedding vector(1024),
  tsv tsvector generated always as (to_tsvector('simple', content)) stored,
  created_at timestamptz default now()
);
create index on kb_chunks using hnsw (embedding vector_cosine_ops);
create index on kb_chunks using gin (tsv);

create table kb_facts (                     -- curated, human-verified atomic facts (§7 layer 1)
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  key text not null,                        -- 'price.starting' | 'unit.size_sqft' | 'tenure' ...
  question_forms text[],                    -- phrasings this fact answers (used in retrieval)
  value text not null,                      -- canonical answer content, EN
  numeric_values text[],                    -- every number that may appear ('265000','550','734','2')
  disclaimer text,                          -- e.g. 'Indicative; subject to final SPA.'
  source text not null,                     -- 'FAQ p1' | 'Brochure p6' | 'Client email 2026-07-15'
  verified_by uuid, verified_at timestamptz,
  active boolean default true,
  created_at timestamptz default now(),
  unique (tenant_id, key)
);

create table verbatim_answers (             -- sensitive topics: ONLY these exact words (§7 layer 5)
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  topic text not null,                      -- 'booking_fee_refund' | 'eligibility' | ...
  trigger_patterns text[],                  -- keywords/intents that must route here
  answer_en text, answer_ms text, answer_zh text,
  approved_by text, approved_at timestamptz,
  active boolean default false,             -- inactive until client signs off
  created_at timestamptz default now()
);

create table whats_new (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  title text not null, body text not null,
  starts_at timestamptz default now(),
  expires_at timestamptz,                   -- HARD stop: never referenced after expiry
  active boolean default true,
  created_at timestamptz default now()
);

-- ================================= Bookings =================================
create table booking_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,                        -- 'Sales gallery visit' | 'Callback'
  duration_min int not null default 30,
  capacity_per_slot int not null default 4,
  open_rule jsonb not null,                  -- {days:[2..7], start:'10:00', end:'18:00', slot_every:30, tz:'Asia/Kuala_Lumpur'}
  created_at timestamptz default now()
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  booking_type_id uuid references booking_types(id),
  contact_id uuid references contacts(id),
  starts_at timestamptz not null,
  pax int default 2,
  status text not null default 'confirmed',   -- confirmed | rescheduled | cancelled | no_show | attended
  notes text,
  reminders_sent jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- ============================ Handover & staff ==============================
create table staff (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  auth_user_id uuid unique,                  -- Supabase auth link
  name text, wa_phone text, email text,
  role text default 'agent',                 -- 'admin' | 'agent'
  alert_order int default 1,                 -- escalation chain position
  created_at timestamptz default now()
);

create table handovers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  conversation_id uuid references conversations(id),
  reason text not null,                       -- trigger key (§10.1)
  summary text,                               -- AI-written context for the human
  status text default 'waiting',              -- waiting | picked_up | resolved
  created_at timestamptz default now(),
  picked_up_at timestamptz, picked_up_by uuid,
  escalation_level int default 0
);

-- ===================== Observability (the improvement engine) ===============
create table ai_turns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  conversation_id uuid, message_in_id uuid, message_out_id uuid,
  intent text, language text,
  retrieved jsonb,                            -- [{chunk_id|fact_key, score, excerpt}]
  draft jsonb,                                -- full structured draft (§6 step 6)
  verifier jsonb,                             -- {verdict, unsupported_claims[], notes}
  numeric_check jsonb,                        -- {numbers_found[], all_matched: bool}
  action text not null,                       -- 'sent' | 'blocked_fallback' | 'handover' | 'shadow_pending' | 'verbatim'
  latency_ms int, model text,
  tokens_in int, tokens_out int, cost_usd numeric(10,6),
  review_verdict text,                        -- null | 'correct' | 'wrong' | 'style'
  review_note text, reviewed_by uuid, reviewed_at timestamptz,
  created_at timestamptz default now()
);

create table corrections (                     -- wrong answer → new knowledge loop
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ai_turn_id uuid references ai_turns(id),
  correct_answer text not null,
  becomes text not null default 'fact',        -- 'fact' | 'verbatim' | 'guardrail'
  applied boolean default false, applied_at timestamptz,
  created_at timestamptz default now()
);

create table jobs (                            -- durable work queue
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  kind text not null,                          -- 'process_message' | 'send_reminder' | 'digest'
  payload jsonb not null,
  run_after timestamptz default now(),
  attempts int default 0, max_attempts int default 5,
  status text default 'pending',               -- pending | running | done | dead
  last_error text,
  created_at timestamptz default now()
);
create index on jobs (status, run_after);

-- ============================ Config & eval =================================
create table settings (
  tenant_id uuid primary key,
  config jsonb not null default '{}'::jsonb,   -- persona, business hours, guardrail lists, shadow flag, budgets
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table eval_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  run_at timestamptz default now(),
  pass_rate numeric(5,2),
  results jsonb,
  git_sha text
);

-- ============================================================================
-- RLS: enable on EVERY table. anon/authenticated get NOTHING by default.
-- Service-role key (server functions only) bypasses RLS.
-- Portal users get a JWT claim tenant_id; policies added in a later phase (P3).
-- ============================================================================
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- Explicitly revoke anon so the "zero rows for anon" test passes hard.
revoke all on all tables in schema public from anon;
