import { reportMonthRange } from "../domain/reportMonth.js";
import { queryLivePortfolioDetail, queryPortfolioDetail } from "./portfolioSnapshotDetail.js";

// Explicit date parameters make these queries reusable for historical dashboards.
export async function queryMonthActivity({ franchiseIds, desde, hasta }, db) {
  db ??= (await import("../db/pool.js")).pool;
  const params = [franchiseIds, desde, hasta];
  const [gestiones, pagos, catalog, fulfilled] = await Promise.all([
    db.query(`select gt.*, c.name, c.franchise_id, c.portfolio_status, s.label as status_label
      from gestion_timeline gt join clientes c on c.id = gt.cliente_id
      left join status_gestion s on s.value = gt.estatus_value
      where c.franchise_id = any($1::text[]) and gt.fecha_iso between $2::date and $3::date`, params),
    db.query(`select p.*, coalesce(c.name, p.grupo_facturacion) as name,
      coalesce(p.franchise_id, c.franchise_id) as franchise_id
      from pagos p left join clientes c on c.id = p.cliente_id
      where coalesce(p.franchise_id, c.franchise_id) = any($1::text[])
      and p.fecha_iso between $2::date and $3::date`, params),
    db.query("select value, label, bg, efectiva, sort_order from status_gestion order by sort_order"),
    db.query(`select c.franchise_id, count(distinct pp.cliente_id)::int as cumplidas
      from payment_promises pp join clientes c on c.id = pp.cliente_id
      where c.franchise_id = any($1::text[]) and c.portfolio_status = 'active'
      and pp.status = 'fulfilled'
      and pp.fulfilled_at between $2::date and $3::date
      group by c.franchise_id`, params),
  ]);
  return { gestiones: gestiones.rows, pagos: pagos.rows, statusCatalog: catalog.rows, fulfilled: fulfilled.rows };
}

export async function queryMonthPortfolio({ franchiseIds, hasta, isCurrent }, db) {
  db ??= (await import("../db/pool.js")).pool;
  if (!isCurrent) {
    const ids = franchiseIds.length === 3 ? [...franchiseIds, "todas"] : franchiseIds;
    const result = await db.query(`select * from portfolio_snapshots
      where franchise_id = any($1::text[]) and tipo_corte = 'Mensual' and fecha_corte = $2::date`, [ids, hasta]);
    return result.rows;
  }
  const result = await db.query(`with balances as (
      select franchise_id, sum(saldo)::float as saldo_total from clientes
      where franchise_id = any($1::text[]) and portfolio_status = 'active' group by franchise_id
    ), invoices as (
      select c.franchise_id, sum(f.monto)::float as total,
        coalesce(sum(f.monto) filter (where f.dias_vencida <= 0),0)::float as al_corriente_monto,
        coalesce(sum(f.monto) filter (where f.dias_vencida > 0),0)::float as vencida_monto,
        coalesce(sum(f.monto) filter (where f.dias_vencida > 60),0)::float as tramo_60_mas_monto
      from facturas f join clientes c on c.id = f.cliente_id
      where c.franchise_id = any($1::text[]) and c.portfolio_status = 'active' group by c.franchise_id
    ) select ids.franchise_id, coalesce(b.saldo_total,0) as saldo_total,
      coalesce(i.total,0) as total, coalesce(i.al_corriente_monto,0) as al_corriente_monto,
      coalesce(i.vencida_monto,0) as vencida_monto, coalesce(i.tramo_60_mas_monto,0) as tramo_60_mas_monto
      from unnest($1::text[]) as ids(franchise_id)
      left join balances b using (franchise_id) left join invoices i using (franchise_id)`, [franchiseIds]);
  const total = { franchise_id: "todas" };
  for (const key of ["saldo_total", "total", "al_corriente_monto", "vencida_monto", "tramo_60_mas_monto"]) {
    total[key] = result.rows.reduce((sum, r) => sum + Number(r[key]), 0);
  }
  return [...result.rows, total];
}

export async function queryMonthSummary({ month, franchiseIds, now = new Date() }, db) {
  const range = reportMonthRange(month, now);
  const params = { ...range, franchiseIds };
  const [activity, portfolio, detail] = await Promise.all([
    queryMonthActivity(params, db), queryMonthPortfolio(params, db),
    range.isCurrent ? queryLivePortfolioDetail(params, db)
      : queryPortfolioDetail({ franchiseIds, fechaCorte: range.hasta }, db),
  ]);
  const corte = [...franchiseIds, "todas"].map((id) => {
    const source = portfolio.find((r) => r.franchise_id === id);
    return { ...source, franchise_id: id, available: !!source,
      cumplidas: activity.fulfilled.filter((r) => id === "todas" || r.franchise_id === id)
        .reduce((sum, r) => sum + Number(r.cumplidas), 0) };
  });
  return { ...params, ...activity, corte, detail };
}
