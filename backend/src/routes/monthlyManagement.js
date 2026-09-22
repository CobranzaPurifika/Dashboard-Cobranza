import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireRole } from "../auth/authorization.js";
import { resolveFranchiseScope } from "../auth/franchiseScope.js";
import { buildMonthlyManagement } from "../domain/monthlyManagement.js";
import { mexicoTodayISO } from "../domain/dates.js";

export const monthlyManagementRouter = Router();

monthlyManagementRouter.get("/", async (req, res, next) => {
  try {
    const today = mexicoTodayISO();
    const month = String(req.query.month || today.slice(0, 7));
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: "Mes inválido" });
    }
    const allowed = resolveFranchiseScope(req.user, "todas");
    const throughDate = month === today.slice(0, 7) ? today : monthEnd(month);
    const [franchises, goals, counts, incidents] = await Promise.all([
      pool.query(
        `select id, label from franquicias
         where id = any($1::text[])
         order by array_position(array['aguascalientes','cancun','merida'], id)`,
        [allowed]
      ),
      pool.query(
        `select franchise_id, daily_goal from management_daily_goals
         where franchise_id = any($1::text[])`,
        [allowed]
      ),
      pool.query(
        `select c.franchise_id, gt.fecha_iso as fecha, count(distinct gt.cliente_id)::int as count
         from gestion_timeline gt
         join clientes c on c.id = gt.cliente_id
         where c.franchise_id = any($1::text[])
           and gt.fecha_iso between $2::date and $3::date
           and coalesce(gt.descripcion, '') !~* '^(Pago aplicado|Enviado a lista negra|Nota actualizada)(\\s+—.*)?$'
         group by c.franchise_id, gt.fecha_iso`,
        [allowed, `${month}-01`, throughDate]
      ),
      pool.query(
        `select franchise_id, fecha, note
         from management_day_incidents
         where franchise_id = any($1::text[]) and fecha between $2::date and $3::date`,
        [allowed, `${month}-01`, throughDate]
      ),
    ]);

    res.json(buildMonthlyManagement({
      month,
      throughDate,
      franchises: franchises.rows,
      goals: goals.rows,
      counts: counts.rows,
      incidents: incidents.rows,
    }));
  } catch (error) {
    next(error);
  }
});

monthlyManagementRouter.put(
  "/incidents/:franchise/:date",
  requireRole("admin", "gestor"),
  async (req, res, next) => {
    try {
      const { franchise, date } = req.params;
      resolveFranchiseScope(req.user, franchise);
      const note = String(req.body?.note ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
        return res.status(400).json({ error: "Fecha inválida" });
      }
      if (!note) return res.status(400).json({ error: "El motivo de la incidencia es obligatorio" });
      const { rows } = await pool.query(
        `insert into management_day_incidents (franchise_id, fecha, note, created_by)
         values ($1, $2, $3, $4)
         on conflict (franchise_id, fecha) do update
           set note = excluded.note, created_by = excluded.created_by, updated_at = now()
         returning franchise_id, fecha, note`,
        [franchise, date, note, req.user.id]
      );
      res.json(rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

monthlyManagementRouter.delete(
  "/incidents/:franchise/:date",
  requireRole("admin", "gestor"),
  async (req, res, next) => {
    try {
      const { franchise, date } = req.params;
      resolveFranchiseScope(req.user, franchise);
      await pool.query(
        `delete from management_day_incidents where franchise_id = $1 and fecha = $2`,
        [franchise, date]
      );
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  }
);

function monthEnd(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}
