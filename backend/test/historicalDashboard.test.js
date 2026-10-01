import assert from "node:assert/strict";
import test from "node:test";
import { buildHistoricalDashboard, canViewHistoricalDashboard, selectDashboardResponse } from "../src/domain/historicalDashboard.js";

const summary = {
  month: "2026-09", hasta: "2026-09-30", pagos: [{ franchise_id: "cancun", cliente_id: 1, monto: 125 }],
  catalog: [{ value: "promesa_pago", label: "Promesa", efectiva: true, sort_order: 1 }],
  groups: { cancun: { portfolio: { saldo: 1000, corriente: .7, corrienteMonto: 700,
    vencida: .3, vencidaMonto: 300, mas60: .1, mas60Monto: 100 }, total: 2,
    efectivas: 1, acordadas: 1, cumplidas: 1, distribution: { promesa_pago: 1 } } },
};

test("el mes en curso conserva exactamente el objeto de respuesta actual", () => {
  const current = { kpi: { untouched: true }, recuperadoSemanal: { total: 10 } };
  assert.strictEqual(selectDashboardResponse(current), current);
  assert.deepEqual(selectDashboardResponse(current), current);
});

test("solo admin y supervisor pueden consultar un dashboard histórico", () => {
  assert.equal(canViewHistoricalDashboard("admin"), true);
  assert.equal(canViewHistoricalDashboard("supervisor"), true);
  assert.equal(canViewHistoricalDashboard("gestor"), false);
  assert.equal(canViewHistoricalDashboard("lector"), false);
  assert.equal(canViewHistoricalDashboard(undefined), false);
});

test("arma el contrato histórico con corte, delta mensual y campos no disponibles", () => {
  const response = buildHistoricalDashboard({ summary, groupId: "cancun", previousPortfolio: {
    fecha_corte: "2026-08-31", al_corriente_pct: 65, cartera_vencida_pct: 35,
    tramo_60_mas_monto: 150, saldo_total: 1000,
  } });
  assert.equal(response.historical.fechaCorte, "2026-09-30");
  assert.equal(response.kpi.alCorriente.deltaMes, 5);
  assert.equal(response.kpi.alCorriente.deltaSemana, null);
  assert.equal(response.recuperadoMensual.total, 125);
  assert.equal(response.recuperadoSemanal, null);
  assert.deepEqual(response.saldos, []);
  assert.equal(response.expectativaCobro, null);
});

test("representa un mes sin corte sin inventar KPIs", () => {
  const withoutCut = structuredClone(summary);
  withoutCut.groups.cancun.portfolio = null;
  const response = buildHistoricalDashboard({ summary: withoutCut, groupId: "cancun" });
  assert.equal(response.historical.fechaCorte, null);
  assert.equal(response.kpi.alCorriente, null);
  assert.equal(response.portfolio.saldo, null);
});

test("usa el detalle guardado del corte para saldos, segmentación y clientes", () => {
  const detail = { saldos: [{ tramo: "good", label: "Al corriente", value: 700, clientes: 4 }],
    segmentacion: [{ segment: "comercial", label: "Comercial", clientes: 5, monto: 700, tramos: [] }], clientes: 5 };
  const response = buildHistoricalDashboard({ summary, groupId: "cancun", detail });
  assert.deepEqual(response.saldos, detail.saldos);
  assert.deepEqual(response.segmentacion, detail.segmentacion);
  assert.equal(response.portfolio.clientes, 5);
});
