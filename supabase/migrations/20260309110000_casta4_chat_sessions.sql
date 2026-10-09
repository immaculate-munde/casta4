create table if not exists public.casta4_chat_sessions (
  id uuid primary key,
  user_email text not null,
  title text not null default 'New chat',
  context_type text,
  context_meta jsonb,
  messages jsonb not null default '[]'::jsonb,
  greeting_seed text,
  updated_at timestamptz not null default now()
);

create index if not exists casta4_chat_sessions_user_updated_idx
  on public.casta4_chat_sessions (user_email, updated_at desc);

alter table public.casta4_chat_sessions enable row level security;

comment on table public.casta4_chat_sessions is 'ReAgent chat threads per signed-in user (API service role only)';
