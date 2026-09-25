-- Estatus resultante de cada gestión, para poder contar "gestiones del mes en curso" por
-- resultado (Distribución de estatus / Funnel) en vez del estatus VIGENTE de cada cliente
-- (que puede venir de meses anteriores si no lo han vuelto a tocar).
alter table public.gestion_timeline add column if not exists estatus_value text;

-- Backfill de lo ya guardado: dot_color es el bg de status_gestion en el momento en que se
-- guardó la gestión, y hoy no hay dos estatus con el mismo color, así que sirve como llave de
-- reconstrucción para las filas existentes (quedan sin backfillear las pocas cuyo color ya no
-- coincide con ningún estatus vigente).
update public.gestion_timeline gt
set estatus_value = s.value
from public.status_gestion s
where gt.estatus_value is null and s.bg = gt.dot_color;

create index if not exists gestion_timeline_estatus_mes_idx
  on public.gestion_timeline (estatus_value, fecha_iso);
