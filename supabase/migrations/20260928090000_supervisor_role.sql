-- Nuevo rol "supervisor": revisa lo gestionado (detalle de cliente, gestiones del mes) sin
-- poder gestionar, y sí puede tocar configuración (Estatus de gestión, Metas) -- pero no
-- actualizar la BDD, eso sigue siendo exclusivo de admin.
alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users
  add constraint app_users_role_check
  check (role in ('admin', 'supervisor', 'gestor', 'lector'));
