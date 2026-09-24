-- Columna "Cliente" de la BDD (columna 0), distinta de "Grupo de facturación" (columna 1,
-- usada para clientes.name). Se guarda por factura, no agregada por cliente, siguiendo el
-- mismo patrón que ejecutivo_ventas/ejecutivo_cobranza -- ver buscador del Lector.
alter table public.facturas
  add column if not exists cliente_nombre text;
