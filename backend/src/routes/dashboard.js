import { Router } from "express";
import { pool } from "../db/pool.js";
import { resolveFranchiseScope } from "../auth/franchiseScope.js";
import { sanitizeDashboardForViewer } from "../domain/publicDashboard.js";

export const dashboardRouter = Router();

// GET /api/dashboard/:franchise  (franchise = aguascalientes | cancun | merida | todas)
// Todo se calcula en vivo con SQL sobre clientes/facturas/pagos/timeline -- nada queda
// congelado en un JSON que haya que regenerar y volver a publicar a mano, como pasaba en
// el artifact original (CLIENTS en memoria + republish). Las mismas reglas de negocio que
// tenía el artifact (computeFunnel, computeDistribucionYGestion, computeCumplidas,
// computeActivePromisesTotal) se reimplementan aquí en SQL.
dashboardRouter.get("/:franchise", async (req, res, next) => {
  const { franchise } = req.params;

  try {
    const allowed = resolveFranchiseScope(req.user, franchise);
    const params = [allowed];
    const whereClientes = "where franchise_id = any($1::text[]) and portfolio_status != 'settled'";
    const andClientes = "and c.franchise_id = any($1::text[]) and c.portfolio_status != 'settled'";

    const [
      portfolio,
      kpi,
      saldos,
      segmentacion,
      totalClientes,
      gestionadosMes,
      historico,
      historicoVencida,
      recuperadoSemanal,
      distribucion,
      cumplidas,
      activePromises,
    ] = await Promise.all([
      pool.query(
        `select count(*)::int as clientes, coalesce(sum(saldo),0)::float as saldo
         from clientes ${whereClientes}`,
        params
      ),
      pool.query(
        `select
           coalesce(sum(f.monto) filter (where f.dias_vencida <= 0), 0)::float as al_corriente_monto,
           coalesce(sum(f.monto) filter (where f.dias_vencida > 0), 0)::float as vencida_monto,
           coalesce(sum(f.monto) filter (where f.dias_vencida > 60), 0)::float as mas60_monto,
           coalesce(sum(f.monto), 0)::float as total
         from facturas f join clientes c on c.id = f.cliente_id
         where c.franchise_id = any($1::text[]) and c.portfolio_status != 'settled'`,
        params
      ),
      pool.query(
        `select
           case when f.dias_vencida <= 0 then 'good' when f.dias_vencida <= 30 then 'warning'
                when f.dias_vencida <= 60 then 'serious' else 'critical' end as tramo,
           case when f.dias_vencida <= 0 then 'Al corriente' when f.dias_vencida <= 30 then '1-30 días'
                when f.dias_vencida <= 60 then '31-60 días' else '+60 días' end as label,
           coalesce(sum(f.monto),0)::float as value, count(distinct f.cliente_id)::int as clientes
         from facturas f join clientes c on c.id = f.cliente_id
         where c.franchise_id = any($1::text[]) and c.portfolio_status != 'settled'
         group by 1, 2 order by array_position(array['good','warning','serious','critical'],
           case when f.dias_vencida <= 0 then 'good' when f.dias_vencida <= 30 then 'warning'
                when f.dias_vencida <= 60 then 'serious' else 'critical' end)`,
        params
      ),
      pool.query(
        `select segment, segment_label as label, count(*)::int as clientes, coalesce(sum(saldo),0)::float as monto
         from clientes ${whereClientes}
         group by segment, segment_label`,
        params
      ),
      pool.query(`select count(*)::int as total from clientes ${whereClientes}`, params),
      // "gestionados" (mes en curso): clientes DISTINTOS con al menos un evento de timeline
      // fechado dentro del mes calendario actual -- mismo criterio que computeDistribucionYGestion
      // del artifact original (lastGestionISO se sobreescribe en cada guardado y por eso no sirve
      // para un acumulado mensual).
      pool.query(
        `select count(distinct gt.cliente_id)::int as gestionados
         from gestion_timeline gt join clientes c on c.id = gt.cliente_id
         where date_trunc('month', gt.fecha_iso) = date_trunc('month', current_date)
         ${andClientes}`,
        params
      ),
      pool.query(
        franchise !== "todas"
          ? `select month, monto_recuperado, pct_cobertura, weeks
             from kpi_snapshots where franchise_id = any($1::text[]) order by month`
          : `select month, sum(monto_recuperado)::float as monto_recuperado,
                    avg(pct_cobertura)::float as pct_cobertura, max(weeks) as weeks
             from kpi_snapshots where franchise_id = any($1::text[])
             group by month order by month`,
        params
      ),
      pool.query(
        franchise !== "todas"
          ? `select month, pct, provisional
             from vencida_snapshots where franchise_id = any($1::text[]) order by month`
          : `select month, avg(pct)::float as pct, bool_or(provisional) as provisional
             from vencida_snapshots where franchise_id = any($1::text[])
             group by month order by month`,
        params
      ),
      pool.query(
        `select p.cliente_id, coalesce(c.name, p.grupo_facturacion) as name,
                p.franchise_id, p.fecha_iso, p.monto
         from pagos p left join clientes c on c.id = p.cliente_id
         where p.fecha_iso >= greatest(
           date_trunc('week', (now() at time zone 'America/Mexico_City'))::date,
           date_trunc('month', (now() at time zone 'America/Mexico_City'))::date
         )
         and p.franchise_id = any($1::text[])
         order by p.fecha_iso desc`,
        params
      ),
      // Distribución de estatus: las 10 filas de status_gestion siempre presentes (incluso en 0),
      // con los nombres de los clientes en cada una para el tooltip -- igual que el original.
      pool.query(
        `select s.value as key, s.label, s.bg, s.efectiva,
           count(c.id)::int as count,
           coalesce(array_agg(c.name order by c.name) filter (where c.id is not null), '{}') as names
         from status_gestion s
         left join clientes c on c.estatus_value = s.value
           and c.franchise_id = any($1::text[])
           and c.portfolio_status != 'settled'
         group by s.value, s.label, s.bg, s.efectiva, s.sort_order
         order by s.sort_order`,
        params
      ),
      // Promesas cumplidas: promise_gestion_iso/promise_deadline_iso capturados y un pago aplicado
      // dentro de esa ventana -- misma definición que clientPromiseFulfilled.
      pool.query(
        `select count(distinct pp.cliente_id)::int as cumplidas
         from payment_promises pp join clientes c on c.id = pp.cliente_id
         where pp.status = 'fulfilled'
           and date_trunc('month', pp.fulfilled_at) = date_trunc('month', current_date)
           ${andClientes}`,
        params
      ),
      // Expectativa de cobro: suma de la factura más vencida (folio numérico más bajo) de cada
      // cliente con promesa de pago activa (vigente, sin cumplir todavía) -- computeActivePromisesTotal.
      pool.query(
        `with activos as (
           select c.id
           from clientes c
           where c.estatus_value = 'promesa_pago'
             and c.promise_deadline_iso is not null
             and c.promise_deadline_iso >= (now() at time zone 'America/Mexico_City')::date
             and not exists (
               select 1 from pagos p
               where p.cliente_id = c.id
                 and p.fecha_iso between c.promise_gestion_iso and c.promise_deadline_iso
             )
             ${andClientes}
         ),
         facturas_ord as (
           select f.cliente_id, f.monto,
             row_number() over (
               partition by f.cliente_id
               order by nullif(regexp_replace(f.folio, '\\D', '', 'g'), '')::bigint asc nulls last
             ) as rn
           from facturas f
           join activos a on a.id = f.cliente_id
         )
         select coalesce(sum(monto), 0)::float as total
         from facturas_ord where rn = 1`,
        params
      ),
    ]);

    const kpiRow = kpi.rows[0];
    const total = kpiRow.total || 1;

    const distRows = distribucion.rows.map((r) => ({
      key: r.key,
      label: r.label,
      bg: r.bg,
      count: r.count,
      names: r.names,
    }));
    const distTotal = distRows.reduce((s, r) => s + r.count, 0);
    const efectiva = distribucion.rows.filter((r) => r.efectiva).reduce((s, r) => s + r.count, 0);
    const acordadas = distRows.find((r) => r.key === "promesa_pago")?.count ?? 0;

    const response = {
      portfolio: portfolio.rows[0],
      kpi: {
        alCorriente: { pct: round1((kpiRow.al_corriente_monto / total) * 100), monto: kpiRow.al_corriente_monto },
        vencidaTotal: { pct: round1((kpiRow.vencida_monto / total) * 100), monto: kpiRow.vencida_monto },
        mas60: { pct: round1((kpiRow.mas60_monto / total) * 100), monto: kpiRow.mas60_monto },
      },
      saldos: saldos.rows,
      segmentacion: segmentacion.rows,
      gestion: {
        total: totalClientes.rows[0].total,
        gestionados: gestionadosMes.rows[0].gestionados,
      },
      distribucion: distRows,
      funnel: {
        total: distTotal,
        efectiva,
        acordadas,
        cumplidas: cumplidas.rows[0].cumplidas,
      },
      expectativaCobro: activePromises.rows[0].total,
      historico: historico.rows,
      historicoVencida: historicoVencida.rows,
      recuperadoSemanal: {
        total: recuperadoSemanal.rows.reduce((s, r) => s + Number(r.monto), 0),
        count: new Set(recuperadoSemanal.rows.map((row) =>
          row.cliente_id || `${row.franchise_id}|${String(row.name ?? "").toLowerCase()}`
        )).size,
        rows: recuperadoSemanal.rows,
      },
    };
    res.json(sanitizeDashboardForViewer(response, req.user));
  } catch (err) {
    next(err);
  }
});

function round1(n) {
  return Math.round(n * 10) / 10;
}
