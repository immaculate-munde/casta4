-- Casta4 demo workspace (API uses service role; no public Data API access)

create table if not exists public.casta4_workspaces (
  id text primary key,
  manifest jsonb not null default '{}'::jsonb,
  exposure_csv text,
  ep_curve_model_csv text,
  updated_at timestamptz not null default now()
);

create table if not exists public.casta4_workspace_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.casta4_workspaces (id) on delete cascade,
  filename text not null,
  content text not null,
  updated_at timestamptz not null default now(),
  unique (workspace_id, filename)
);

create index if not exists casta4_workspace_documents_workspace_id_idx
  on public.casta4_workspace_documents (workspace_id);

alter table public.casta4_workspaces enable row level security;
alter table public.casta4_workspace_documents enable row level security;

-- No policies: anon/authenticated cannot read/write via PostgREST.
-- Node API uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).

comment on table public.casta4_workspaces is 'Active exposure CSV, EP model CSV, manifest JSON for Casta4 rag-server';
comment on table public.casta4_workspace_documents is 'User-uploaded text for ReAgent RAG context';
