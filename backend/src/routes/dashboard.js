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
    const whereClientes = "where franchise_id = any($1::text[]) and portfolio_status = 'active'";
    const andClientes = "and c.franchise_id = any($1::text[]) and c.portfolio_status = 'active'";

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
      baselineMensual,
      baselineSemanal,
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
         where c.franchise_id = any($1::text[]) and c.portfolio_status = 'active'`,
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
         where c.franchise_id = any($1::text[]) and c.portfolio_status = 'active'
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
                p.folio, p.factura,
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
      // Corte mensual: el cierre real más reciente ANTES del mes en curso (captureMonthlyPortfolioBaseline).
      pool.query(
        baselineQuery("Mensual", "and fecha_corte < date_trunc('month', now() at time zone 'America/Mexico_City')::date"),
        [franchise === "todas" && allowed.length === 3 ? ["todas"] : allowed]
      ),
      // Corte semanal: el más reciente antes de hoy (captureWeeklyPortfolioBaseline, cron nocturno
      // de cada lunes) -- a diferencia del mensual, sí puede caer dentro del mes en curso.
      pool.query(
        baselineQuery("Semanal", "and fecha_corte < (now() at time zone 'America/Mexico_City')::date"),
        [franchise === "todas" && allowed.length === 3 ? ["todas"] : allowed]
      ),
      // Distribución de estatus: las gestiones (eventos, no el estatus vigente del cliente)
      // registradas en la bitácora dentro del mes en curso, agrupadas por el estatus con el que
      // se guardó cada una -- "gestiones del periodo", no una foto de dónde está cada cliente hoy.
      pool.query(
        `select s.value as key, s.label, s.bg, s.efectiva,
           count(t.id)::int as count,
           coalesce(array_agg(distinct t.name order by t.name) filter (where t.id is not null), '{}') as names
         from status_gestion s
         left join (
           select gt.id, gt.estatus_value, c.name
           from gestion_timeline gt
           join clientes c on c.id = gt.cliente_id
           where c.franchise_id = any($1::text[])
             and c.portfolio_status = 'active'
             and date_trunc('month', gt.fecha_iso) = date_trunc('month', current_date)
         ) t on t.estatus_value = s.value
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
      // Expectativa de cobro: la factura más vencida (folio numérico más bajo) de cada cliente
      // con promesa de pago activa (vigente, sin cumplir todavía) -- computeActivePromisesTotal,
      // ahora también por cliente (no solo la suma) para mostrar el detalle en Modo Presentación.
      pool.query(
        `with activos as (
           select c.id, c.name, c.promise_deadline_iso
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
         select a.name, a.promise_deadline_iso, fo.monto::float as monto
         from activos a
         join facturas_ord fo on fo.cliente_id = a.id and fo.rn = 1
         order by a.promise_deadline_iso asc, fo.monto desc`,
        params
      ),
    ]);

    const kpiRow = kpi.rows[0];
    const total = kpiRow.total || 1;
    const baselineMensualRow = baselineMensual.rows[0]?.fecha_corte ? baselineMensual.rows[0] : null;
    const baselineSemanalRow = baselineSemanal.rows[0]?.fecha_corte ? baselineSemanal.rows[0] : null;
    const alCorrientePct = round1((kpiRow.al_corriente_monto / total) * 100);
    const vencidaPct = round1((kpiRow.vencida_monto / total) * 100);
    const mas60Pct = round1((kpiRow.mas60_monto / total) * 100);
    const baselineMensualMas60Pct = mas60PctFromBaseline(baselineMensualRow);
    const baselineSemanalMas60Pct = mas60PctFromBaseline(baselineSemanalRow);

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
          baselineSemanalRow?.al_corriente_pct, baselineMensualRow?.al_corriente_pct, (delta) => delta >= 0
        ),
        vencidaTotal: metricWithDelta(
          vencidaPct, kpiRow.vencida_monto,
          baselineSemanalRow?.cartera_vencida_pct, baselineMensualRow?.cartera_vencida_pct, (delta) => delta <= 0
        ),
        mas60: metricWithDelta(
          mas60Pct, kpiRow.mas60_monto,
          baselineSemanalMas60Pct, baselineMensualMas60Pct, (delta) => delta <= 0
        ),
      },
      baseline: {
        semana: baselineSemanalRow ? { fechaCorte: baselineSemanalRow.fecha_corte } : null,
        mes: baselineMensualRow ? { fechaCorte: baselineMensualRow.fecha_corte } : null,
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
      expectativaCobro: activePromises.rows.reduce((sum, row) => sum + Number(row.monto), 0),
      expectativaCobroDetalle: activePromises.rows.map((row) => ({
        name: row.name,
        deadline: row.promise_deadline_iso,
        monto: Number(row.monto),
      })),
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

function metricWithDelta(pct, monto, baselineSemanaPct, baselineMesPct, isGood) {
  const deltaSemana = computeDelta(pct, baselineSemanaPct);
  const deltaMes = computeDelta(pct, baselineMesPct);
  return {
    pct,
    monto,
    deltaSemana,
    deltaSemanaGood: deltaSemana === null ? null : isGood(deltaSemana),
    deltaMes,
    deltaMesGood: deltaMes === null ? null : isGood(deltaMes),
  };
}

function computeDelta(pct, baselinePct) {
  const hasBaseline = baselinePct !== null && baselinePct !== undefined && Number.isFinite(Number(baselinePct));
  return hasBaseline ? round1(pct - Number(baselinePct)) : null;
}

function mas60PctFromBaseline(row) {
  return row && row.tramo_60_mas_monto != null && Number(row.saldo_total) > 0
    ? Number(row.tramo_60_mas_monto) / Number(row.saldo_total) * 100
    : null;
}

// Corte más reciente (por franquicia, ponderado por saldo; "todas" ya viene pre-agregado en su
// propia fila) antes del punto de corte que decida cada llamado -- comparte forma entre el corte
// mensual y el semanal, solo cambia el tipo_corte y qué tan reciente puede ser.
function baselineQuery(tipoCorte, cutoffCondition) {
  return `with ranked as (
       select ps.*,
         row_number() over (partition by franchise_id order by fecha_corte desc) as rn
       from portfolio_snapshots ps
       where franchise_id = any($1::text[])
         and tipo_corte = '${tipoCorte}'
         ${cutoffCondition}
     ), latest as (
       select * from ranked where rn = 1
     )
     select max(fecha_corte) as fecha_corte,
            case when coalesce(sum(saldo_total), 0) > 0
              then sum(al_corriente_pct * saldo_total) / sum(saldo_total)
              else avg(al_corriente_pct) end::float as al_corriente_pct,
            case when coalesce(sum(saldo_total), 0) > 0
              then sum(cartera_vencida_pct * saldo_total) / sum(saldo_total)
              else avg(cartera_vencida_pct) end::float as cartera_vencida_pct,
            sum(tramo_60_mas_monto)::float as tramo_60_mas_monto,
            sum(saldo_total)::float as saldo_total
     from latest`;
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
