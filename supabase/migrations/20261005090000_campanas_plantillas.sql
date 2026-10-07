-- Módulo Campañas: plantillas editables y registro del mensaje enviado.
--
-- Requiere 20261002090000_campanas_cobranza.sql. Sigue sin escribir en clientes, facturas,
-- pagos ni gestion_timeline.

-- Plantillas de los recordatorios editadas por un administrador. Si una clave no tiene fila,
-- se usa la plantilla predeterminada del backend (backend/src/campanas/plantillas.js).
create table if not exists public.campana_plantillas (
  clave text primary key
    check (clave in (
      'preventivo_whatsapp', 'correctivo_whatsapp',
      'preventivo_correo_asunto', 'preventivo_correo',
      'correctivo_correo_asunto', 'correctivo_correo'
    )),
  contenido text not null,
  updated_by uuid references public.app_users(id),
  updated_at timestamptz not null default now()
);

-- Texto tal como se envió cada recordatorio (con las ediciones de último momento) para poder
-- revisarlo en el Historial. El correctivo pasa a ser semanal: periodo 'YYYY-MM-R1' a 'R4'.
alter table public.campana_envios add column if not exists mensaje text;
alter table public.campana_envios add column if not exists asunto text;
alter table public.campana_envios add column if not exists editado boolean not null default false;

alter table public.campana_plantillas enable row level security;
revoke all on table public.campana_plantillas from anon, authenticated;
