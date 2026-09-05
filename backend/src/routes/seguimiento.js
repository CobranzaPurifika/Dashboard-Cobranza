import { Router } from "express";
import { pool } from "../db/pool.js";
import { resolveFranchiseScope } from "../auth/franchiseScope.js";

export const seguimientoRouter = Router();

// GET /api/seguimiento?franchise=todas
seguimientoRouter.get("/", async (req, res, next) => {
  try {
    const allowed = resolveFranchiseScope(req.user, req.query.franchise || "todas");
    const params = [allowed];
    const today = "(now() at time zone 'America/Mexico_City')::date";

    const [overdue, scheduled] = await Promise.all([
      pool.query(
        `select c.id, c.name, c.franchise_id, c.promise_gestion_iso,
                c.promise_deadline_iso, (${today} - c.promise_deadline_iso)::int as days_overdue
         from clientes c
         where c.franchise_id = any($1::text[])
           and c.promise_gestion_iso is not null
           and c.promise_deadline_iso < ${today}
           and not exists (
             select 1 from pagos p
             where p.cliente_id = c.id
               and p.fecha_iso between c.promise_gestion_iso and c.promise_deadline_iso
           )
         order by c.promise_deadline_iso asc, c.saldo desc`,
        params
      ),
      pool.query(
        `select c.id, c.name, c.franchise_id, c.agenda_fecha_iso,
                c.agenda_hora, c.agenda_nota, c.agenda_detail
         from clientes c
         where c.franchise_id = any($1::text[])
           and c.agenda_active = true
         order by c.agenda_fecha_iso asc nulls last, c.agenda_hora asc nulls last, c.name asc`,
        params
      ),
    ]);

    res.json({ overdue: overdue.rows, scheduled: scheduled.rows });
  } catch (err) {
    next(err);
  }
});
