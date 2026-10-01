import { mas60PctFromBaseline } from "./portfolioMetrics.js";
import { summarizePayments } from "./recoveryPayments.js";

const round1 = (value) => Math.round(value * 10) / 10;

export const canViewHistoricalDashboard = (role) => ["admin", "supervisor"].includes(role);

function delta(current, previous, isGood) {
  const value = previous == null ? null : round1(current - Number(previous));
  return {
    deltaSemana: null,
    deltaSemanaGood: null,
    deltaMes: value,
    deltaMesGood: value == null ? null : isGood(value),
  };
}

function metric(pct, monto, previous, isGood) {
  return { pct: round1(pct), monto: Number(monto), ...delta(pct, previous, isGood) };
}

/** Builds the regular dashboard contract from a saved monthly summary. */
export function buildHistoricalDashboard({ summary, groupId, previousPortfolio = null,
  history = [], overdueHistory = [], coverage = null, detail = null }) {
  const group = summary.groups[groupId];
  const portfolio = group?.portfolio ?? null;
  const distribution = summary.catalog.map((row) => ({
    key: row.value,
    label: row.label,
    bg: row.bg,
    count: group?.distribution[row.value] ?? 0,
    names: [],
  }));
  const fechaCorte = portfolio ? summary.hasta : null;
  const kpi = portfolio ? {
    alCorriente: metric(portfolio.corriente * 100, portfolio.corrienteMonto,
      previousPortfolio?.al_corriente_pct, (value) => value >= 0),
    vencidaTotal: metric(portfolio.vencida * 100, portfolio.vencidaMonto,
      previousPortfolio?.cartera_vencida_pct, (value) => value <= 0),
    mas60: metric(portfolio.mas60 * 100, portfolio.mas60Monto,
      mas60PctFromBaseline(previousPortfolio), (value) => value <= 0),
  } : { alCorriente: null, vencidaTotal: null, mas60: null };

  return {
    portfolio: { clientes: detail?.clientes ?? null, saldo: portfolio?.saldo ?? null },
    kpi,
    baseline: { semana: null, mes: previousPortfolio?.fecha_corte ? { fechaCorte: previousPortfolio.fecha_corte } : null },
    saldos: detail?.saldos ?? [],
    segmentacion: detail?.segmentacion ?? [],
    gestion: coverage == null ? null : { total: null, gestionados: null, pctCobertura: Number(coverage) },
    distribucion: distribution,
    funnel: {
      total: group?.total ?? 0,
      efectiva: group?.efectivas ?? 0,
      acordadas: group?.acordadas ?? 0,
      cumplidas: group?.cumplidas ?? 0,
    },
    expectativaCobro: null,
    expectativaCobroDetalle: [],
    historico: history,
    historicoVencida: overdueHistory,
    recuperadoSemanal: null,
    recuperadoMensual: summarizePayments(summary.pagos.filter((row) =>
      groupId === "todas" || row.franchise_id === groupId)),
    historical: { month: summary.month, fechaCorte },
  };
}

// Keeping this decision pure makes the compatibility promise explicit: a current-month
// request returns the exact object produced by the existing dashboard implementation.
export function selectDashboardResponse(currentResponse, historicalResponse = null) {
  return historicalResponse ?? currentResponse;
}
