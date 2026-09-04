import test from "node:test";
import assert from "node:assert/strict";

import {
  DATA_OWNERSHIP,
  paymentDedupeKey,
  recoveryWeekStart,
} from "../src/domain/dataOwnership.js";

test("BDD es la única fuente del saldo y de las facturas pendientes", () => {
  assert.equal(DATA_OWNERSHIP.carteraVigente, "bdd");
  assert.equal(DATA_OWNERSHIP.facturasPendientes, "bdd");
  assert.equal(DATA_OWNERSHIP.recuperacion, "pagos");
});

test("un pago se identifica por factura, fecha y monto", () => {
  assert.equal(
    paymentDedupeKey({ factura: "FAC-100", fechaISO: "2026-09-04T16:12:32.142Z", monto: "1200.5" }),
    "FAC-100|2026-09-04|1200.50"
  );
});

test("el corte semanal no incluye pagos del mes anterior", () => {
  assert.equal(recoveryWeekStart("2026-09-04"), "2026-09-01");
  assert.equal(recoveryWeekStart("2026-09-11"), "2026-09-07");
});
