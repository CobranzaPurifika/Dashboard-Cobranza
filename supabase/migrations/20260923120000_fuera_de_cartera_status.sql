-- El botón Actualizar ya no deja clientes en "pending_validation" esperando la siguiente
-- corrida: dentro de la misma corrida decide, con el Pagos recién subido, si el cliente que
-- desapareció de la BDD ya se pagó (settled) o se va a "fuera_de_cartera" (removido de las
-- vistas activas de inmediato, conservando su historial de gestión).
alter table public.clientes drop constraint if exists clientes_portfolio_status_check;
alter table public.clientes
  add constraint clientes_portfolio_status_check
  check (portfolio_status in ('active', 'fuera_de_cartera', 'settled'));
