-- Estado operativo separado del historial: BDD decide quién integra la cartera vigente.
alter table public.clientes
  add column if not exists portfolio_status text not null default 'active',
  add column if not exists last_bdd_seen_at timestamptz,
  add column if not exists pending_validation_since timestamptz;

alter table public.clientes drop constraint if exists clientes_portfolio_status_check;
alter table public.clientes
  add constraint clientes_portfolio_status_check
  check (portfolio_status in ('active', 'pending_validation', 'settled'));

update public.clientes
set last_bdd_seen_at = now()
where last_bdd_seen_at is null and portfolio_status != 'settled';

create index if not exists clientes_portfolio_status_idx
  on public.clientes (portfolio_status, franchise_id);

-- Conserva la relación histórica factura-cliente aunque la factura deje de estar en BDD.
create table if not exists public.invoice_client_keys (
  franchise_id text not null references public.franquicias(id),
  folio text not null,
  cliente_id text not null references public.clientes(id),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (franchise_id, folio)
);

insert into public.invoice_client_keys (franchise_id, folio, cliente_id)
select distinct on (c.franchise_id, f.folio)
  c.franchise_id, f.folio, f.cliente_id
from public.facturas f
join public.clientes c on c.id = f.cliente_id
where nullif(trim(f.folio), '') is not null
order by c.franchise_id, f.folio, f.fecha_facturacion desc nulls last, f.id desc
on conflict (franchise_id, folio) do update
set cliente_id = excluded.cliente_id, last_seen_at = now();

-- Pagos puede contener clientes que ya no aparecen en la BDD activa.
alter table public.pagos
  alter column cliente_id drop not null,
  add column if not exists franchise_id text references public.franquicias(id),
  add column if not exists grupo_facturacion text,
  add column if not exists dedupe_key text;

update public.pagos p
set franchise_id = c.franchise_id
from public.clientes c
where p.cliente_id = c.id and p.franchise_id is null;

with ranked as (
  select id,
    row_number() over (
      partition by lower(regexp_replace(coalesce(factura,''), '\s+', '', 'g')),
                   fecha_iso, round(monto::numeric, 2)
      order by id
    ) as duplicate_number,
    lower(regexp_replace(factura, '\s+', '', 'g')) || '|' || fecha_iso::text || '|' ||
      to_char(round(monto::numeric, 2), 'FM999999999999990.00') as generated_key
  from public.pagos
  where nullif(trim(factura), '') is not null and fecha_iso is not null and monto > 0
)
update public.pagos p
set dedupe_key = ranked.generated_key
from ranked
where p.id = ranked.id and ranked.duplicate_number = 1 and p.dedupe_key is null;

create unique index if not exists pagos_dedupe_key_uidx
  on public.pagos (dedupe_key) where dedupe_key is not null;
create index if not exists pagos_franchise_fecha_idx
  on public.pagos (franchise_id, fecha_iso desc);

-- Las promesas se guardan como eventos históricos; el estado activo del cliente sí puede limpiarse.
create table if not exists public.payment_promises (
  id bigint generated always as identity primary key,
  cliente_id text not null references public.clientes(id),
  gestion_iso date not null,
  deadline_iso date not null,
  status text not null default 'active'
    check (status in ('active', 'fulfilled', 'cancelled', 'expired')),
  fulfilled_at date,
  fulfilled_payment_id bigint references public.pagos(id),
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now()
);

create index if not exists payment_promises_client_idx
  on public.payment_promises (cliente_id, gestion_iso desc);
create unique index if not exists payment_promises_one_active_per_client
  on public.payment_promises (cliente_id) where status = 'active';

insert into public.payment_promises (cliente_id, gestion_iso, deadline_iso, created_by)
select c.id, c.promise_gestion_iso, c.promise_deadline_iso, c.agenda_updated_by
from public.clientes c
where c.promise_gestion_iso is not null and c.promise_deadline_iso is not null
  and not exists (
    select 1 from public.payment_promises pp
    where pp.cliente_id = c.id and pp.status = 'active'
  );

-- Amplía la bitácora para distinguir validación, aplicación y corrida omitida por seguridad.
alter table public.import_runs drop constraint if exists import_runs_status_check;
alter table public.import_runs
  add constraint import_runs_status_check
  check (status in ('running', 'validated', 'applied', 'skipped', 'failed'));
alter table public.import_runs
  add column if not exists rows_applied integer not null default 0,
  add column if not exists details jsonb not null default '{}'::jsonb;

alter table public.invoice_client_keys enable row level security;
alter table public.payment_promises enable row level security;
