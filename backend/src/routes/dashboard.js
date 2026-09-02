import { Router } from "express";
import { pool } from "../db/pool.js";

export const dashboardRouter = Router();

// GET /api/dashboard/:franchise  (franchise = aguascalientes | cancun | merida | todas)
// Todo se calcula en vivo con SQL sobre clientes/facturas/pagos -- nada queda congelado
// en un JSON que haya que regenerar y volver a publicar a mano.
dashboardRouter.get("/:franchise", async (req, res, next) => {
  const { franchise } = req.params;
  const franchiseFilter = franchise === "todas" ? null : franchise;

  try {
    const params = franchiseFilter ? [franchiseFilter] : [];
    const whereClientes = franchiseFilter ? "where franchise_id = $1" : "";

    const [portfolio, kpi, saldos, segmentacion, gestion, historico, historicoVencida, recuperadoSemanal] =
      await Promise.all([
        pool.query(
          `select count(*)::int as clientes, coalesce(sum(saldo),0)::float as saldo
           from clientes ${whereClientes}`,
          params
        ),
        pool.query(
          `select
             coalesce(sum(saldo) filter (where tramo = 'good'), 0)::float as al_corriente_monto,
             coalesce(sum(saldo) filter (where tramo != 'good'), 0)::float as vencida_monto,
             coalesce(sum(saldo) filter (where tramo = 'critical'), 0)::float as mas60_monto,
             coalesce(sum(saldo), 0)::float as total
           from clientes ${whereClientes}`,
          params
        ),
        pool.query(
          `select tramo, tramo_label as label, coalesce(sum(saldo),0)::float as value, count(*)::int as clientes
           from clientes ${whereClientes}
           group by tramo, tramo_label`,
          params
        ),
        pool.query(
          `select segment, segment_label as label, count(*)::int as clientes, coalesce(sum(saldo),0)::float as monto
           from clientes ${whereClientes}
           group by segment, segment_label`,
          params
        ),
        pool.query(
          `select count(*)::int as total, count(*) filter (where estatus_value is not null)::int as gestionados
           from clientes ${whereClientes}`,
          params
        ),
        pool.query(
          franchiseFilter
            ? `select month, monto_recuperado, pct_cobertura, weeks from kpi_snapshots where franchise_id = $1 order by month`
            : `select month, sum(monto_recuperado)::float as monto_recuperado, avg(pct_cobertura)::float as pct_cobertura, max(weeks) as weeks
               from kpi_snapshots group by month order by month`,
          params
        ),
        pool.query(
          franchiseFilter
            ? `select month, pct, provisional from vencida_snapshots where franchise_id = $1 order by month`
            : `select month, avg(pct)::float as pct, bool_or(provisional) as provisional
               from vencida_snapshots group by month order by month`,
          params
        ),
        pool.query(
          `select p.cliente_id, c.name, c.franchise_id, p.fecha_iso, p.monto
           from pagos p join clientes c on c.id = p.cliente_id
           where p.fecha_iso >= (current_date - interval '7 days')
           ${franchiseFilter ? "and c.franchise_id = $1" : ""}
           order by p.fecha_iso desc`,
          params
        ),
      ]);

    const kpiRow = kpi.rows[0];
    const total = kpiRow.total || 1;

    res.json({
      portfolio: portfolio.rows[0],
      kpi: {
        alCorriente: { pct: round1((kpiRow.al_corriente_monto / total) * 100), monto: kpiRow.al_corriente_monto },
        vencidaTotal: { pct: round1((kpiRow.vencida_monto / total) * 100), monto: kpiRow.vencida_monto },
        mas60: { pct: round1((kpiRow.mas60_monto / total) * 100), monto: kpiRow.mas60_monto },
      },
      saldos: saldos.rows,
      segmentacion: segmentacion.rows,
      gestion: gestion.rows[0],
      historico: historico.rows,
      historicoVencida: historicoVencida.rows,
      recuperadoSemanal: {
        total: recuperadoSemanal.rows.reduce((s, r) => s + Number(r.monto), 0),
        count: recuperadoSemanal.rows.length,
        rows: recuperadoSemanal.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

function round1(n) {
  return Math.round(n * 10) / 10;
}
