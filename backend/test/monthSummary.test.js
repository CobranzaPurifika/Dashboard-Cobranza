import assert from "node:assert/strict";
import test from "node:test";
import { buildMonthSummary } from "../src/domain/monthSummary.js";
import { reportMonthRange } from "../src/domain/reportMonth.js";
const base = { franchiseIds: ["aguascalientes", "cancun", "merida"], desde: "2026-09-01", hasta: "2026-09-30", isCurrent: false };

test("acepta tres meses CDMX y rechaza ausente, malformado, futuro y cuarto mes", () => {
  const now = new Date("2026-10-15T18:00:00Z");
  for (const month of ["2026-10", "2026-09", "2026-08"]) assert.equal(reportMonthRange(month, now).month, month);
  for (const month of [undefined, "", "2026-7", "2026-07", "2026-11", "2026-13", ["2026-10"]]) assert.throws(() => reportMonthRange(month, now), { statusCode: 400 });
  assert.equal(reportMonthRange("2026-10", now).hasta, "2026-10-15");
  assert.equal(reportMonthRange("2026-09", now).hasta, "2026-09-30");
  assert.equal(reportMonthRange("2026-09", new Date("2026-10-01T05:59:00Z")).isCurrent, true);
  assert.equal(reportMonthRange("2025-12", new Date("2026-01-02T12:00:00Z")).hasta, "2025-12-31");
  assert.equal(reportMonthRange("2024-02", new Date("2024-03-02T12:00:00Z")).hasta, "2024-02-29");
});

test("corte ausente, cero denominadores y fila todas como origen histórico", () => {
  const empty = buildMonthSummary(base);
  assert.equal(empty.groups.todas.portfolio, null);
  assert.equal(empty.groups.todas.contactabilidad, 0);
  assert.equal(empty.groups.todas.cumplimiento, 0);
  const summary = buildMonthSummary({ ...base, corte: [
    { franchise_id: "aguascalientes", saldo_total: 0, tramo_60_mas_monto: 0 },
    { franchise_id: "todas", saldo_total: 900, al_corriente_pct: 70, cartera_vencida_pct: 30, tramo_60_mas_monto: 90 },
  ] });
  assert.equal(summary.groups.aguascalientes.portfolio.mas60, 0);
  assert.equal(summary.groups.todas.portfolio.saldo, 900);
  assert.equal(summary.groups.todas.portfolio.mas60, 0.1);
  assert.equal(summary.groups.todas.portfolio.corriente, 0.7);
});

test("distribuye eventos, filtra rango y cartera inactiva; cumplidas independientes de eventos", () => {
  const event = { fecha_iso: "2026-09-03", franchise_id: "aguascalientes", cliente_id: 1, estatus_value: "promesa_pago" };
  const result = buildMonthSummary({ ...base,
    statusCatalog: [{ value: "sin_respuesta", label: "Sin respuesta", sort_order: 2 }, { value: "promesa_pago", label: "Promesa", efectiva: true, sort_order: 1 }],
    gestiones: [event, { ...event, estatus_value: "sin_respuesta" }, { ...event, franchise_id: "cancun", cliente_id: 2 }, { ...event, fecha_iso: "2026-08-31" }, { ...event, portfolio_status: "inactive" }],
    corte: [{ franchise_id: "aguascalientes", available: false, cumplidas: 1 }, { franchise_id: "todas", available: false, cumplidas: 1 }],
    pagos: [{ ...event, monto: "120.50" }, { ...event, fecha_iso: "2026-10-01", monto: 900 }],
  });
  assert.equal(result.groups.todas.total, 3);
  assert.equal(result.groups.todas.clientes, 2);
  assert.equal(result.groups.aguascalientes.contactabilidad, 0.5);
  assert.equal(result.groups.aguascalientes.cumplimiento, 1);
  assert.equal(result.groups.aguascalientes.portfolio, null);
  assert.equal(result.groups.cancun.distribution.promesa_pago, 1);
  assert.equal(result.groups.todas.recuperado, 120.5);
  assert.equal(result.catalog[0].value, "promesa_pago");
});

test("cartera viva usa total de facturas como denominador de los KPIs", () => {
  const result = buildMonthSummary({ ...base, isCurrent: true, corte: [{ franchise_id: "todas", saldo_total: 100, total: 200, al_corriente_monto: 100, vencida_monto: 100, tramo_60_mas_monto: 50 }] });
  assert.equal(result.groups.todas.portfolio.saldo, 100);
  assert.equal(result.groups.todas.portfolio.mas60, 0.25);
  assert.equal(result.groups.todas.portfolio.corriente, 0.5);
});
