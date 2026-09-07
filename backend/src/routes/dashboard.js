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
      pagosMes,
      baseline,
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
                coalesce(p.franchise_id, c.franchise_id) as franchise_id, p.fecha_iso, p.monto,
                p.fecha_iso >= greatest(
                  date_trunc('week', (now() at time zone 'America/Mexico_City'))::date,
                  date_trunc('month', (now() at time zone 'America/Mexico_City'))::date
                ) as is_weekly
         from pagos p left join clientes c on c.id = p.cliente_id
         where p.fecha_iso >= date_trunc('month', (now() at time zone 'America/Mexico_City'))::date
         and coalesce(p.franchise_id, c.franchise_id) = any($1::text[])
         order by p.fecha_iso desc`,
        params
      ),
      pool.query(
        `with ranked as (
           select ps.*,
             row_number() over (
               partition by franchise_id
               order by case when tipo_corte = 'Mensual' then 0 else 1 end,
                        fecha_corte desc
             ) as rn
           from portfolio_snapshots ps
           where franchise_id = any($1::text[])
             and fecha_corte < date_trunc('month', now() at time zone 'America/Mexico_City')::date
             and tipo_corte in ('Mensual', 'Semanal')
         ), latest as (
           select * from ranked where rn = 1
         )
         select max(fecha_corte) as fecha_corte,
                string_agg(distinct tipo_corte, ', ') as tipo_corte,
                case when coalesce(sum(saldo_total), 0) > 0
                  then sum(al_corriente_pct * saldo_total) / sum(saldo_total)
                  else avg(al_corriente_pct) end::float as al_corriente_pct,
                case when coalesce(sum(saldo_total), 0) > 0
                  then sum(cartera_vencida_pct * saldo_total) / sum(saldo_total)
                  else avg(cartera_vencida_pct) end::float as cartera_vencida_pct,
                sum(tramo_60_mas_monto)::float as tramo_60_mas_monto,
                sum(saldo_total)::float as saldo_total
         from latest`,
        [franchise === "todas" && allowed.length === 3 ? ["todas"] : allowed]
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
    const baselineRow = baseline.rows[0]?.fecha_corte ? baseline.rows[0] : null;
    const alCorrientePct = round1((kpiRow.al_corriente_monto / total) * 100);
    const vencidaPct = round1((kpiRow.vencida_monto / total) * 100);
    const mas60Pct = round1((kpiRow.mas60_monto / total) * 100);
    const baselineMas60Pct = baselineRow && baselineRow.tramo_60_mas_monto != null
      && Number(baselineRow.saldo_total) > 0
      ? Number(baselineRow.tramo_60_mas_monto) / Number(baselineRow.saldo_total) * 100
      : null;

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
        alCorriente: metricWithDelta(
          alCorrientePct, kpiRow.al_corriente_monto,
          baselineRow?.al_corriente_pct, (delta) => delta >= 0
        ),
        vencidaTotal: metricWithDelta(
          vencidaPct, kpiRow.vencida_monto,
          baselineRow?.cartera_vencida_pct, (delta) => delta <= 0
        ),
        mas60: metricWithDelta(
          mas60Pct, kpiRow.mas60_monto,
          baselineMas60Pct, (delta) => delta <= 0
        ),
      },
      baseline: baselineRow ? {
        fechaCorte: baselineRow.fecha_corte,
        tipoCorte: baselineRow.tipo_corte,
      } : null,
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
      recuperadoSemanal: summarizePayments(pagosMes.rows.filter((row) => row.is_weekly)),
      recuperadoMensual: summarizePayments(pagosMes.rows),
    };
    res.json(sanitizeDashboardForViewer(response, req.user));
  } catch (err) {
    next(err);
  }
});

function round1(n) {
  return Math.round(n * 10) / 10;
}

function metricWithDelta(pct, monto, baselinePct, isGood) {
  const hasBaseline = baselinePct !== null && baselinePct !== undefined && Number.isFinite(Number(baselinePct));
  const delta = hasBaseline ? round1(pct - Number(baselinePct)) : null;
  return {
    pct,
    monto,
    delta,
    deltaGood: delta === null ? null : isGood(delta),
  };
}

function summarizePayments(rows) {
  return {
    total: rows.reduce((sum, row) => sum + Number(row.monto), 0),
    count: new Set(rows.map((row) =>
      row.cliente_id || `${row.franchise_id}|${String(row.name ?? "").toLowerCase()}`
    )).size,
    rows: rows.map(({ is_weekly: _isWeekly, ...row }) => row),
  };
}
