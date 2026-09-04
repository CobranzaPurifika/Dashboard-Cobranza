create table if not exists public.import_runs (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('bdd', 'pagos')),
  trigger_type text not null check (trigger_type in ('automatic', 'manual')),
  status text not null check (status in ('running', 'validated', 'failed')),
  rows_read integer not null default 0,
  rows_inserted integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create unique index if not exists import_runs_one_running_per_source
  on public.import_runs (source_type)
  where status = 'running';

create table if not exists public.import_raw_rows (
  id bigint generated always as identity primary key,
  import_run_id uuid not null references public.import_runs(id),
  source_type text not null check (source_type in ('bdd', 'pagos')),
  source_file_id text not null,
  franchise_id text references public.franquicias(id),
  source_row integer not null,
  row_hash text not null,
  payload jsonb not null,
  imported_at timestamptz not null default now(),
  unique (source_file_id, row_hash)
);

create index if not exists import_raw_rows_run_idx
  on public.import_raw_rows (import_run_id);

create index if not exists import_raw_rows_source_idx
  on public.import_raw_rows (source_type, imported_at desc);

alter table public.import_runs enable row level security;
alter table public.import_raw_rows enable row level security;
