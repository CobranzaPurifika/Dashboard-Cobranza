import { Router } from "express";
import { pool } from "../db/pool.js";
import { resolveFranchiseScope } from "../auth/franchiseScope.js";

export const clientesRouter = Router();

// GET /api/clientes/prioridad?franchise=cancun&segment=comercial&q=cliente-o-folio
// Orden confirmado en el Artifact: no gestionados hoy primero; después urgencia por tramo
// y saldo. Las promesas vigentes y los clientes en lista negra salen de la lista normal,
// pero una búsqueda explícita por cliente o folio sí puede encontrarlos.
clientesRouter.get("/prioridad", async (req, res, next) => {
  try {
    const { franchise, segment, q } = req.query;
    const allowed = resolveFranchiseScope(req.user, franchise || "todas");
    const params = [allowed];
    const conditions = [
      "c.franchise_id = any($1::text[])",
      "c.portfolio_status != 'settled'",
    ];

    if (segment) {
      params.push(segment);
      conditions.push(`c.segment = $${params.length}`);
    }

    const search = String(q ?? "").trim();
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(
        c.name ilike $${params.length}
        or exists (
          select 1 from facturas f
          where f.cliente_id = c.id and f.folio ilike $${params.length}
        )
      )`);
    } else {
      conditions.push("c.is_blacklisted is not true");
      conditions.push(`not (
        c.estatus_value = 'promesa_pago'
        and c.promise_deadline_iso >= (now() at time zone 'America/Mexico_City')::date
        and not exists (
          select 1 from pagos p
          where p.cliente_id = c.id
            and p.fecha_iso between c.promise_gestion_iso and c.promise_deadline_iso
        )
      )`);
    }

    const where = `where ${conditions.join(" and ")}`;
    const [priority, total] = await Promise.all([
      pool.query(
        `select c.id, c.name, c.franchise_id, c.segment, c.segment_label,
                c.saldo::float, c.tramo, c.tramo_label, c.estatus_value,
                c.last_gestion_iso, c.promise_deadline_iso, c.is_blacklisted,
                c.portfolio_status,
                s.label as estatus_label, s.bg as estatus_bg,
                (c.last_gestion_iso = (now() at time zone 'America/Mexico_City')::date)
                  as managed_today
         from clientes c
         left join status_gestion s on s.value = c.estatus_value
         ${where}
         order by
           (c.last_gestion_iso = (now() at time zone 'America/Mexico_City')::date) asc,
           case c.tramo
             when 'critical' then 4
             when 'serious' then 3
             when 'warning' then 2
             when 'good' then 1
             else 0
           end desc,
           c.saldo desc,
           c.name asc
         limit 1000`,
        params
      ),
      pool.query(
        `select count(*)::int as total
         from clientes c
         where c.franchise_id = any($1::text[]) and c.portfolio_status != 'settled'`,
        [allowed]
      ),
    ]);

    res.json({ rows: priority.rows, shown: priority.rows.length, total: total.rows[0].total });
  } catch (err) {
    next(err);
  }
});

// GET /api/clientes?franchise=aguascalientes&tramo=critical&segment=comercial&q=texto
clientesRouter.get("/", async (req, res, next) => {
  try {
    const { franchise, tramo, segment, q } = req.query;
    const conditions = [];
    const params = [resolveFranchiseScope(req.user, franchise || "todas")];
    conditions.push("c.franchise_id = any($1::text[])");
    conditions.push("c.portfolio_status != 'settled'");
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
    const allowed = resolveFranchiseScope(req.user, "todas");
    const [cliente, facturas, pagos, timeline] = await Promise.all([
      pool.query(
        `select c.*, s.label as estatus_label, s.bg as estatus_bg, s.fg as estatus_fg
         from clientes c left join status_gestion s on s.value = c.estatus_value
         where c.id = $1 and c.franchise_id = any($2::text[])`,
        [id, allowed]
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
