-- Dato informativo proveniente de la columna AD de BDD.
alter table public.facturas
  add column if not exists ejecutivo_cobranza text;

create index if not exists facturas_ejecutivo_cobranza_idx
  on public.facturas (ejecutivo_cobranza)
  where ejecutivo_cobranza is not null;
