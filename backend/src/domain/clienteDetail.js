import { pool } from "../db/pool.js";

// Compartido entre /api/clientes/:id (con sesión) y /api/public-clientes/:id (Lector, sin
// sesión) -- mismo detalle completo en los dos casos, ver server.js sobre por qué el Lector
// sí puede ver todo esto (uso interno entre compañeros, no un enlace público externo).
export async function fetchClienteDetail(id, allowedFranchises) {
  const [cliente, facturas, pagos, timeline] = await Promise.all([
    pool.query(
      `select c.*, s.label as estatus_label, s.bg as estatus_bg, s.fg as estatus_fg, b.motivo as blacklist_motivo
       from clientes c
       left join status_gestion s on s.value = c.estatus_value
       left join blacklist b on b.id = c.id
       where c.id = $1 and c.franchise_id = any($2::text[])`,
      [id, allowedFranchises]
    ),
    pool.query(
      `select * from facturas where cliente_id = $1 order by fecha_facturacion desc nulls last`,
      [id]
    ),
    pool.query(`select * from pagos where cliente_id = $1 order by fecha_iso desc nulls last`, [id]),
    pool.query(
      `select * from gestion_timeline where cliente_id = $1 order by fecha_iso desc nulls last, id desc`,
      [id]
    ),
  ]);

  if (cliente.rows.length === 0) return null;

  return {
    ...cliente.rows[0],
    invoices: facturas.rows,
    pagos: pagos.rows,
    timeline: timeline.rows,
  };
}
