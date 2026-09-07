-- Dato informativo proveniente de la columna AC de BDD.
alter table public.facturas
  add column if not exists ejecutivo_ventas text;

create index if not exists facturas_ejecutivo_ventas_idx
  on public.facturas (ejecutivo_ventas)
  where ejecutivo_ventas is not null;
