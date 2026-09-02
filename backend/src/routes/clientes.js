import { Router } from "express";
import { pool } from "../db/pool.js";

export const clientesRouter = Router();

// GET /api/clientes?franchise=aguascalientes&tramo=critical&segment=comercial&q=texto
clientesRouter.get("/", async (req, res, next) => {
  try {
    const { franchise, tramo, segment, q } = req.query;
    const conditions = [];
    const params = [];

    if (franchise && franchise !== "todas") {
      params.push(franchise);
      conditions.push(`c.franchise_id = $${params.length}`);
    }
    if (tramo) {
      params.push(tramo);
      conditions.push(`c.tramo = $${params.length}`);
    }
    if (segment) {
      params.push(segment);
      conditions.push(`c.segment = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`c.name ILIKE $${params.length}`);
    }

    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const { rows } = await pool.query(
      `select c.*, s.label as estatus_label, s.bg as estatus_bg, s.fg as estatus_fg
       from clientes c
       left join status_gestion s on s.value = c.estatus_value
       ${where}
       order by c.saldo desc`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/clientes/:id  -- detalle con facturas, pagos y timeline
clientesRouter.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const [cliente, facturas, pagos, timeline] = await Promise.all([
      pool.query(
        `select c.*, s.label as estatus_label, s.bg as estatus_bg, s.fg as estatus_fg
         from clientes c left join status_gestion s on s.value = c.estatus_value
         where c.id = $1`,
        [id]
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

    if (cliente.rows.length === 0) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    res.json({
      ...cliente.rows[0],
      invoices: facturas.rows,
      pagos: pagos.rows,
      timeline: timeline.rows,
    });
  } catch (err) {
    next(err);
  }
});
