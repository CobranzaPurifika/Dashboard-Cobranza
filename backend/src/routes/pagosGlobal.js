import { Router } from "express";
import { pool } from "../db/pool.js";
import { resolveFranchiseScope } from "../auth/franchiseScope.js";

export const pagosGlobalRouter = Router();

// GET /api/pagos?franchise=todas&q=cliente-o-folio&desde=2026-09-01&hasta=2026-09-30
// Vista global de "Aplicación de pagos": hasta ahora solo se veían los pagos de un cliente
// abriendo su ficha (ver clientes.js). Por defecto muestra el mes en curso para no traer
// todo el histórico de golpe; desde/hasta lo amplían.
pagosGlobalRouter.get("/", async (req, res, next) => {
  try {
    const { franchise, q, desde, hasta } = req.query;
    const allowed = resolveFranchiseScope(req.user, franchise || "todas");
    const params = [allowed];
    const conditions = ["coalesce(p.franchise_id, c.franchise_id) = any($1::text[])"];

    const search = String(q ?? "").trim();
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(
        c.name ilike $${params.length}
        or p.grupo_facturacion ilike $${params.length}
        or p.factura ilike $${params.length}
        or p.folio ilike $${params.length}
      )`);
    }

    if (desde) {
      params.push(desde);
      conditions.push(`p.fecha_iso >= $${params.length}`);
    } else {
      conditions.push(
        `p.fecha_iso >= date_trunc('month', (now() at time zone 'America/Mexico_City'))::date`
      );
    }

    if (hasta) {
      params.push(hasta);
      conditions.push(`p.fecha_iso <= $${params.length}`);
    }

    const where = `where ${conditions.join(" and ")}`;
    const { rows } = await pool.query(
      `select p.id, p.cliente_id, coalesce(c.name, p.grupo_facturacion) as name,
              coalesce(p.franchise_id, c.franchise_id) as franchise_id,
              p.fecha_iso, p.monto::float, p.forma, p.folio, p.factura
       from pagos p left join clientes c on c.id = p.cliente_id
       ${where}
       order by p.fecha_iso desc, p.id desc
       limit 500`,
      params
    );

    res.json({ rows, shown: rows.length, total: rows.reduce((sum, row) => sum + row.monto, 0) });
  } catch (err) {
    next(err);
  }
});
