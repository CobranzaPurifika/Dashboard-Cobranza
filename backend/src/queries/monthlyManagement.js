import { buildMonthlyManagement } from "../domain/monthlyManagement.js";

// Cumplimiento de gestiones diarias (clientes únicos por día hábil vs. meta, con incidencias);
// lo usan el panel "Gestiones acumuladas del mes" y la hoja Cumplimiento del reporte Excel.
export async function queryMonthlyManagement({ month, throughDate, franchiseIds }, db) {
  db ??= (await import("../db/pool.js")).pool;
  const [franchises, goals, counts, incidents] = await Promise.all([
    db.query(
      `select id, label from franquicias
       where id = any($1::text[])
       order by array_position(array['aguascalientes','cancun','merida'], id)`,
      [franchiseIds]
    ),
    db.query(
      `select franchise_id, daily_goal from management_daily_goals
       where franchise_id = any($1::text[])`,
      [franchiseIds]
    ),
    db.query(
      `select c.franchise_id, gt.fecha_iso as fecha, count(distinct gt.cliente_id)::int as count
       from gestion_timeline gt
       join clientes c on c.id = gt.cliente_id
       where c.franchise_id = any($1::text[])
         and gt.fecha_iso between $2::date and $3::date
         and coalesce(gt.descripcion, '') !~* '^(Pago aplicado|Enviado a lista negra|Nota actualizada)(\\s+—.*)?$'
       group by c.franchise_id, gt.fecha_iso`,
      [franchiseIds, `${month}-01`, throughDate]
    ),
    db.query(
      `select franchise_id, fecha, note
       from management_day_incidents
       where franchise_id = any($1::text[]) and fecha between $2::date and $3::date`,
      [franchiseIds, `${month}-01`, throughDate]
    ),
  ]);
  return buildMonthlyManagement({
    month,
    throughDate,
    franchises: franchises.rows,
    goals: goals.rows,
    counts: counts.rows,
    incidents: incidents.rows,
  });
}
