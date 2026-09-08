import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireRole } from "../auth/authorization.js";
import { resolveFranchiseScope } from "../auth/franchiseScope.js";
import { buildMonthlyManagement, parseDailyGoal } from "../domain/monthlyManagement.js";
import { mexicoTodayISO } from "../domain/dates.js";

export const monthlyManagementRouter = Router();

monthlyManagementRouter.get("/goals", requireRole("admin"), async (req, res, next) => {
  try {
    const allowed = resolveFranchiseScope(req.user, "todas");
    const { rows } = await pool.query(
      `select g.franchise_id, f.label, g.daily_goal
       from management_daily_goals g
       join franquicias f on f.id = g.franchise_id
       where g.franchise_id = any($1::text[])
       order by array_position(array['aguascalientes','cancun','merida'], g.franchise_id)`,
      [allowed]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

monthlyManagementRouter.put("/goals/:franchise", requireRole("admin"), async (req, res, next) => {
  try {
    const { franchise } = req.params;
    resolveFranchiseScope(req.user, franchise);
    const dailyGoal = parseDailyGoal(req.body?.dailyGoal);
    if (dailyGoal === null) {
      return res.status(400).json({ error: "La meta diaria debe ser un entero entre 1 y 100" });
    }
    const { rows } = await pool.query(
      `insert into management_daily_goals (franchise_id, daily_goal)
       values ($1, $2)
       on conflict (franchise_id) do update set daily_goal = excluded.daily_goal
       returning franchise_id, daily_goal`,
      [franchise, dailyGoal]
    );
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

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
