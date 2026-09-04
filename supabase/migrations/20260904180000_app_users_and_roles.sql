create table if not exists public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  role text not null check (role in ('admin', 'gestor', 'lector')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_franchises (
  user_id uuid not null references public.app_users(id) on delete cascade,
  franchise_id text not null references public.franquicias(id) on delete cascade,
  primary key (user_id, franchise_id)
);

alter table public.gestion_timeline
  add column if not exists created_by uuid references public.app_users(id);

alter table public.blacklist
  add column if not exists created_by uuid references public.app_users(id);

alter table public.clientes
  add column if not exists agenda_updated_by uuid references public.app_users(id);

create index if not exists user_franchises_franchise_idx
  on public.user_franchises (franchise_id, user_id);

alter table public.app_users enable row level security;
alter table public.user_franchises enable row level security;

revoke all on public.app_users from anon, authenticated;
revoke all on public.user_franchises from anon, authenticated;
