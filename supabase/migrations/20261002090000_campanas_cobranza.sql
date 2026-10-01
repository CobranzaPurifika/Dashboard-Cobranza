-- Módulo Campañas: cobranza preventiva y correctiva por envío masivo asistido.
--
-- Es un módulo independiente: lee la BDD de Drive en modo solo lectura y NO escribe en
-- clientes, facturas, pagos ni gestion_timeline (los recordatorios no deben inflar
-- "Gestiones del mes", las metas por franquicia ni el embudo de gestión).

-- Directorio de contactos por cliente. La llave es la franquicia más el Grupo De
-- Facturación normalizado (minúsculas, sin acentos, espacios simples), que es como la BDD
-- identifica al cliente; no depende del id interno de `clientes`.
create table if not exists public.campana_contactos (
  franchise_id text not null
    check (franchise_id in ('aguascalientes', 'cancun', 'merida')),
  group_key text not null,
  nombre text not null,
  telefono text,
  correo text,
  -- Solo aplica a comerciales: el cliente aparece en el lote de correo únicamente si se
  -- marcó explícitamente en el directorio.
  recibe_correo boolean not null default false,
  origen text not null default 'manual' check (origen in ('portal', 'manual')),
  -- Una vez editado en el módulo, la carga del archivo del portal ya no lo sobrescribe.
  editado_manual boolean not null default false,
  updated_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (franchise_id, group_key)
);

-- Bitácora de recordatorios enviados. La llave única impide que un cliente reciba dos
-- veces el mismo recordatorio: preventivo por factura (periodo = folio) y correctivo por
-- mes y número de recordatorio (periodo = 'YYYY-MM-R1' / 'YYYY-MM-R2').
create table if not exists public.campana_envios (
  id bigserial primary key,
  franchise_id text not null
    check (franchise_id in ('aguascalientes', 'cancun', 'merida')),
  group_key text not null,
  cliente_nombre text not null,
  cliente_id text,
  regla text not null check (regla in ('preventivo', 'correctivo')),
  periodo text not null,
  canal text not null check (canal in ('whatsapp', 'correo')),
  destino text not null,
  folios text[] not null default '{}',
  monto numeric not null default 0,
  enviado_por uuid references public.app_users(id),
  enviado_at timestamptz not null default now(),
  unique (franchise_id, group_key, regla, periodo)
);

create index if not exists campana_envios_fecha_idx
  on public.campana_envios (franchise_id, enviado_at desc);

alter table public.campana_contactos enable row level security;
alter table public.campana_envios enable row level security;
revoke all on table public.campana_contactos from anon, authenticated;
revoke all on table public.campana_envios from anon, authenticated;
