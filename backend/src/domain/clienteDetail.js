import { pool } from "../db/pool.js";
import { groupPaymentsByFolio, invoiceEvidence } from "./paymentEvidence.js";

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

  // Cada factura indica si ya tiene un pago que la cubre (pagado, cubierta, ultimo_pago_iso).
  // No cambia saldo ni facturas -- la BDD sigue siendo la fuente de verdad (invariante 1);
  // solo evita que la ficha presente como pendiente una factura que el cliente ya pagó.
  // Se buscan los pagos por folio en la franquicia, no solo los ligados a este cliente.
  const { franchise_id: franchiseId } = cliente.rows[0];
  const folioPayments = await pool.query(
    `select factura, fecha_iso::text, monto::float from pagos
     where franchise_id = $1 and monto > 0
       and lower(regexp_replace(coalesce(factura, ''), '\\s+', '', 'g')) = any($2::text[])`,
    [franchiseId, facturas.rows.map((f) => String(f.folio ?? "").replace(/\s+/g, "").toLowerCase())]
  );
  const byFolio = groupPaymentsByFolio(folioPayments.rows);
  const invoices = facturas.rows.map((invoice) => ({ ...invoice, ...invoiceEvidence(invoice, byFolio) }));

  return {
    ...cliente.rows[0],
    invoices,
    pagos: pagos.rows,
    timeline: timeline.rows,
  };
}
