import { mas60PctFromBaseline } from "./portfolioMetrics.js";
import { buildPortfolioDetail } from "./segmentation.js";

const number = (value) => Number(value) || 0;
const iso = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").slice(0, 10);
const ratio = (a, b) => b ? a / b : 0;

export function buildMonthSummary({ franchiseIds, corte = [], gestiones = [], statusCatalog = [], pagos = [], desde, hasta, isCurrent, detail = null }) {
  const allowed = new Set(franchiseIds);
  const inRange = (row) => allowed.has(row.franchise_id) && iso(row.fecha_iso) >= desde && iso(row.fecha_iso) <= hasta;
  const events = gestiones.filter(inRange).filter((r) => !r.portfolio_status || r.portfolio_status === "active");
  const payments = pagos.filter(inRange);
  const catalog = [...statusCatalog].sort((a, b) => number(a.sort_order) - number(b.sort_order));
  const effective = new Set(catalog.filter((s) => s.efectiva).map((s) => s.value));
  const columns = [...franchiseIds, "todas"];
  const groups = Object.fromEntries(columns.map((id) => {
    const rows = events.filter((r) => id === "todas" || r.franchise_id === id);
    const source = corte.find((r) => r.franchise_id === id);
    const saldo = number(source?.saldo_total);
    const portfolio = source && source.available !== false ? {
      saldo, total: number(source.total ?? source.saldo_total),
      corrienteMonto: source.al_corriente_monto == null ? saldo * number(source.al_corriente_pct) / 100 : number(source.al_corriente_monto),
      vencidaMonto: source.vencida_monto == null ? saldo * number(source.cartera_vencida_pct) / 100 : number(source.vencida_monto),
      corriente: isCurrent ? ratio(number(source.al_corriente_monto), number(source.total)) : number(source.al_corriente_pct) / 100,
      vencida: isCurrent ? ratio(number(source.vencida_monto), number(source.total)) : number(source.cartera_vencida_pct) / 100,
      mas60Monto: number(source.tramo_60_mas_monto), mas60: isCurrent ? ratio(number(source.tramo_60_mas_monto), number(source.total)) : (mas60PctFromBaseline(source) ?? 0) / 100,
    } : null;
    const total = rows.length;
    const efectivas = rows.filter((r) => effective.has(r.estatus_value)).length;
    const acordadas = rows.filter((r) => r.estatus_value === "promesa_pago").length;
    // Query supplies fulfilled promises independently of timeline events, including
    // clients whose promise was created in a prior month.
    const cumplidas = number(source?.cumplidas);
    // Representación de saldos del corte (o en vivo en el mes en curso); null si no se guardó.
    const saldos = detail ? buildPortfolioDetail(detail, id === "todas" ? franchiseIds : [id])?.saldos ?? null : null;
    return [id, { portfolio, saldos, total, clientes: new Set(rows.map((r) => r.cliente_id)).size,
      efectivas, acordadas, cumplidas, contactabilidad: ratio(efectivas, total),
      tasaAcuerdo: ratio(acordadas, efectivas), cumplimiento: ratio(cumplidas, acordadas),
      recuperado: payments.filter((r) => id === "todas" || r.franchise_id === id).reduce((sum, r) => sum + number(r.monto), 0),
      distribution: Object.fromEntries(catalog.map((s) => [s.value, rows.filter((r) => r.estatus_value === s.value).length])),
    }];
  }));
  return { franchiseIds, desde, hasta, isCurrent, catalog, groups };
}
