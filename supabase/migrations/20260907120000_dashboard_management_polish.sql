-- Cortes mensuales para deltas del dashboard. Los registros históricos de
-- vencida se aprovechan como baseline real para al corriente/vencida; +60
-- queda nulo hasta que exista un corte completo, nunca se inventa.
create table if not exists public.portfolio_snapshots (
  franchise_id text not null
    check (franchise_id in ('aguascalientes', 'cancun', 'merida', 'todas')),
  fecha_corte date not null,
  tipo_corte text not null default 'Mensual'
    check (tipo_corte in ('Semanal', 'Mensual')),
  al_corriente_pct numeric,
  cartera_vencida_pct numeric,
  tramo_60_mas_monto numeric,
  saldo_total numeric,
  created_at timestamptz not null default now(),
  primary key (franchise_id, fecha_corte, tipo_corte)
);

insert into public.portfolio_snapshots
  (franchise_id, fecha_corte, tipo_corte, al_corriente_pct, cartera_vencida_pct)
select franchise_id, (date_trunc('month', month)::date + interval '1 month - 1 day')::date,
       'Mensual', 100 - pct, pct
from public.vencida_snapshots
where provisional is not true and pct is not null
on conflict do nothing;

insert into public.portfolio_snapshots
  (franchise_id, fecha_corte, tipo_corte, al_corriente_pct, cartera_vencida_pct)
select 'todas', (date_trunc('month', month)::date + interval '1 month - 1 day')::date,
       'Mensual', 100 - avg(pct), avg(pct)
from public.vencida_snapshots
where provisional is not true and pct is not null
group by month
on conflict do nothing;

create index if not exists portfolio_snapshots_lookup_idx
  on public.portfolio_snapshots (franchise_id, fecha_corte desc, tipo_corte);

-- Metas e incidencias de Gestiones acumuladas del mes.
create table if not exists public.management_daily_goals (
  franchise_id text primary key references public.franquicias(id),
  daily_goal integer not null check (daily_goal >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users(id)
);

insert into public.management_daily_goals (franchise_id, daily_goal)
values ('aguascalientes', 3), ('cancun', 9), ('merida', 3)
on conflict (franchise_id) do nothing;

create table if not exists public.management_day_incidents (
  franchise_id text not null references public.franquicias(id),
  fecha date not null,
  note text not null check (length(trim(note)) > 0),
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (franchise_id, fecha)
);

create index if not exists management_incidents_fecha_idx
  on public.management_day_incidents (fecha desc, franchise_id);

-- Los endpoints de detalle dejan de depender de escaneos completos.
create index if not exists facturas_cliente_fecha_idx
  on public.facturas (cliente_id, fecha_facturacion desc);
create index if not exists pagos_cliente_fecha_idx
  on public.pagos (cliente_id, fecha_iso desc);
create index if not exists gestion_timeline_cliente_fecha_idx
  on public.gestion_timeline (cliente_id, fecha_iso desc, id desc);
create index if not exists gestion_timeline_fecha_cliente_idx
  on public.gestion_timeline (fecha_iso, cliente_id);
create index if not exists clientes_priority_idx
  on public.clientes (franchise_id, portfolio_status, last_gestion_iso, tramo, saldo desc);

alter table public.portfolio_snapshots enable row level security;
alter table public.management_daily_goals enable row level security;
alter table public.management_day_incidents enable row level security;

revoke all on table public.portfolio_snapshots from anon, authenticated;
revoke all on table public.management_daily_goals from anon, authenticated;
revoke all on table public.management_day_incidents from anon, authenticated;
