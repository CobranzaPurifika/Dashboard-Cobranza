-- Detalle de cada corte (Mensual/Semanal) para reconstruir en meses pasados la
-- Representación de saldos y la Segmentación: monto y clientes por franquicia x
-- segmento x tramo, más el total de clientes y saldo por segmento. "todas" se obtiene
-- sumando franquicias, por eso no se guarda. Se captura en el mismo momento que
-- portfolio_snapshots (rawImport.js / weeklySnapshots.js).
create table if not exists public.portfolio_snapshot_tramos (
  franchise_id text not null
    check (franchise_id in ('aguascalientes', 'cancun', 'merida')),
  fecha_corte date not null,
  tipo_corte text not null check (tipo_corte in ('Semanal', 'Mensual')),
  segment text not null,
  tramo text not null check (tramo in ('good', 'warning', 'serious', 'critical')),
  monto numeric not null default 0,
  clientes integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (franchise_id, fecha_corte, tipo_corte, segment, tramo)
);

create table if not exists public.portfolio_snapshot_segments (
  franchise_id text not null
    check (franchise_id in ('aguascalientes', 'cancun', 'merida')),
  fecha_corte date not null,
  tipo_corte text not null check (tipo_corte in ('Semanal', 'Mensual')),
  segment text not null,
  label text,
  clientes integer not null default 0,
  saldo numeric not null default 0,
  created_at timestamptz not null default now(),
  primary key (franchise_id, fecha_corte, tipo_corte, segment)
);

alter table public.portfolio_snapshot_tramos enable row level security;
alter table public.portfolio_snapshot_segments enable row level security;
revoke all on table public.portfolio_snapshot_tramos from anon, authenticated;
revoke all on table public.portfolio_snapshot_segments from anon, authenticated;
