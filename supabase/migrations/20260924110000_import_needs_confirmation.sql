-- Cuando la caída de clientes/saldo supera el umbral de anomalía, el botón Actualizar ya no
-- aborta la corrida en silencio: le pregunta al administrador si aplicar de todas formas.
alter table public.import_runs drop constraint if exists import_runs_status_check;
alter table public.import_runs
  add constraint import_runs_status_check
  check (status in ('running', 'validated', 'applied', 'skipped', 'needs_confirmation', 'failed'));
