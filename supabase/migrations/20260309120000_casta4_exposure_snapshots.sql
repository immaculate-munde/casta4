create table if not exists public.casta4_exposure_snapshots (
  workspace_id text not null,
  region_id text not null,
  region_label text not null,
  exposure_csv text not null,
  row_count integer not null default 0,
  source_filename text,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, region_id)
);

create index if not exists casta4_exposure_snapshots_workspace_idx
  on public.casta4_exposure_snapshots (workspace_id, updated_at desc);

alter table public.casta4_exposure_snapshots enable row level security;

comment on table public.casta4_exposure_snapshots is 'Saved regional exposure CSVs; one active book per workspace at a time';
