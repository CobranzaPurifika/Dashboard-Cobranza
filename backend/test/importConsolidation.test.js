import test from "node:test";
import assert from "node:assert/strict";

import {
  anomalyThresholdForDate,
  buildBddSnapshot,
  buildPayments,
  clientIdFor,
  evaluateSnapshotDrop,
  segmentFromRfc,
} from "../src/imports/consolidation.js";

function rawBddRow(overrides = {}) {
  const payload = Array(28).fill("");
  payload[1] = overrides.name ?? "Cliente Demo";
  payload[2] = overrides.rfc ?? "ABC010203AB1";
  payload[5] = overrides.folio ?? "AGS-100";
  payload[8] = overrides.date ?? "04/09/2026";
  payload[11] = overrides.days ?? "45";
  payload[21] = overrides.balance ?? "$1,250.50";
  payload[23] = overrides.status ?? "Facturada";
  return { payload };
}

test("BDD agrupa por Grupo De Facturación y suma el saldo de sus facturas", () => {
  const result = buildBddSnapshot("aguascalientes", [
    rawBddRow(),
    rawBddRow({ name: "  cliente demo ", folio: "AGS-101", balance: "249.50", days: "70" }),
  ]);
  assert.equal(result.clientCount, 1);
  assert.equal(result.invoiceCount, 2);
  assert.equal(result.balance, 1500);
  assert.equal(result.clients[0].tramo, "critical");
});

test("BDD ignora estatus ajenos a Facturada y Pago Parcial", () => {
  const result = buildBddSnapshot("cancun", [rawBddRow({ status: "Pagada" })]);
  assert.equal(result.clientCount, 0);
});

test("RFC de 12 posiciones es comercial; 13 y genérico son residencial", () => {
  assert.equal(segmentFromRfc("ABC010203AB1").value, "comercial");
  assert.equal(segmentFromRfc("ABCD010203AB1").value, "residencial");
  assert.equal(segmentFromRfc("XAXX010101000").value, "residencial");
});

test("ClienteId conserva prefijo y limita el slug a 40 caracteres", () => {
  const id = clientIdFor("merida", "Árboles y Servicios Extraordinariamente Largos del Sureste");
  assert.ok(id.startsWith("mid-arboles-y-servicios"));
  assert.equal(id.slice(4).length, 40);
});

test("Pagos toma la fecha más reciente, excluye ceros y deduplica", () => {
  const first = {
    payload: {
      "Grupo De Facturación": "Cliente Demo",
      "Serie/Folio": "AGS-100",
      "Fecha Pago": "02/09/2026, 04/09/2026",
      "Importe Pagado": "$100.00",
      Factura: "F-20",
    },
  };
  const result = buildPayments([first, first, {
    payload: { ...first.payload, "Importe Pagado": "$0.00", Factura: "F-21" },
  }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].paymentDate, "2026-09-04");
  assert.equal(result[0].franchiseId, "aguascalientes");
});

test("El umbral es 10% del día 1 al 5 y 2% después", () => {
  assert.equal(anomalyThresholdForDate(new Date("2026-09-03T18:00:00Z")), 0.1);
  assert.equal(anomalyThresholdForDate(new Date("2026-09-06T18:00:00Z")), 0.02);
  assert.equal(evaluateSnapshotDrop({
    previousCount: 100, previousBalance: 1000, nextCount: 95, nextBalance: 950,
    date: new Date("2026-09-03T18:00:00Z"),
  }).anomalous, false);
  assert.equal(evaluateSnapshotDrop({
    previousCount: 100, previousBalance: 1000, nextCount: 95, nextBalance: 950,
    date: new Date("2026-09-06T18:00:00Z"),
  }).anomalous, true);
});

test("Clientes liquidados comprobados se descuentan antes del umbral", () => {
  const result = evaluateSnapshotDrop({
    previousCount: 100, previousBalance: 1000, nextCount: 90, nextBalance: 900,
    confirmedSettledCount: 10, confirmedSettledBalance: 100,
    date: new Date("2026-09-06T18:00:00Z"),
  });
  assert.equal(result.clientDrop, 0);
  assert.equal(result.balanceDrop, 0);
  assert.equal(result.anomalous, false);
});
