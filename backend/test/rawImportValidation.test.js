import test from "node:test";
import assert from "node:assert/strict";

import { validateCompleteBddBatch, validateCompleteBddAndPagosBatch } from "../src/imports/rawImport.js";
import { hasCompletePagosBatch } from "../src/imports/consolidation.js";

function rawBddRow(overrides = {}) {
  const payload = Array(29).fill("");
  payload[1] = overrides.name ?? "Cliente Demo";
  payload[2] = overrides.rfc ?? "ABC010203AB1";
  payload[5] = overrides.folio ?? "AGS-100";
  payload[8] = overrides.date ?? "04/09/2026";
  payload[11] = overrides.days ?? "45";
  payload[21] = overrides.balance ?? "$1,250.50";
  payload[23] = overrides.status ?? "Facturada";
  payload[28] = overrides.salesExecutive ?? "Ejecutivo Demo";
  return { payload };
}

function pagosRow(overrides = {}) {
  return {
    payload: {
      "Grupo De Facturación": overrides.name ?? "Cliente Demo",
      "Serie/Folio": overrides.folio ?? "AGS-100",
      "Fecha Pago": overrides.date ?? "04/09/2026",
      "Importe Pagado": overrides.amount ?? "$500.00",
      Factura: overrides.invoice ?? overrides.folio ?? "AGS-100",
    },
  };
}

function completeBddDownload() {
  return [
    { source: { franchiseId: "aguascalientes", label: "Antigüedad — Aguascalientes" }, rows: [rawBddRow()] },
    { source: { franchiseId: "cancun", label: "Antigüedad — Cancún" }, rows: [rawBddRow({ folio: "CUN-1" })] },
    { source: { franchiseId: "merida", label: "Antigüedad — Mérida" }, rows: [rawBddRow({ folio: "MID-1" })] },
  ];
}

test("validateCompleteBddBatch no lanza con las 3 franquicias y cartera válida", () => {
  assert.doesNotThrow(() => validateCompleteBddBatch(completeBddDownload()));
});

test("validateCompleteBddBatch rechaza un lote con menos de 3 franquicias", () => {
  assert.throws(
    () => validateCompleteBddBatch(completeBddDownload().slice(0, 2)),
    /422|exactamente 3 franquicias/
  );
});

test("validateCompleteBddBatch rechaza una franquicia sin cartera válida", () => {
  const download = completeBddDownload();
  download[0].rows = [];
  assert.throws(() => validateCompleteBddBatch(download), /solo encabezados/);
});

test("hasCompletePagosBatch requiere al menos un pago válido tras el filtrado de negocio", () => {
  assert.equal(hasCompletePagosBatch([]), false);
  assert.equal(hasCompletePagosBatch([pagosRow({ amount: "$0.00" })]), false);
  assert.equal(hasCompletePagosBatch([pagosRow()]), true);
});

test("validateCompleteBddAndPagosBatch exige BDD completa Y Pagos con datos antes de aplicar nada", () => {
  const bdd = completeBddDownload();
  const pagosConDatos = [{ source: { label: "Pagos mes en curso" }, rows: [pagosRow()] }];
  const pagosVacio = [{ source: { label: "Pagos mes en curso" }, rows: [] }];

  assert.doesNotThrow(() => validateCompleteBddAndPagosBatch(bdd, pagosConDatos));

  assert.throws(
    () => validateCompleteBddAndPagosBatch(bdd, pagosVacio),
    /sin pagos válidos/
  );
  assert.throws(
    () => validateCompleteBddAndPagosBatch(bdd.slice(0, 2), pagosConDatos),
    /exactamente 3 franquicias/
  );
});

test("validateCompleteBddAndPagosBatch marca statusCode 422 para que la corrida no aplique nada", () => {
  try {
    validateCompleteBddAndPagosBatch(completeBddDownload(), [{ source: { label: "Pagos" }, rows: [] }]);
    assert.fail("debía lanzar");
  } catch (error) {
    assert.equal(error.statusCode, 422);
  }
});
