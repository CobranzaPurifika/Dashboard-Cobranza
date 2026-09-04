import test from "node:test";
import assert from "node:assert/strict";

import { parseBddCsv, parsePaymentsCsv } from "../src/imports/parsers.js";

test("BDD conserva las 28 columnas por posición, incluso con Serie/Folio duplicado", () => {
  const header = Array.from({ length: 28 }, (_, index) => `Columna ${index}`);
  header[1] = "Grupo De Facturación";
  header[5] = "Serie/Folio";
  header[11] = "Días Vencida";
  header[21] = "Saldo Neto";
  header[23] = "Estatus";
  header[24] = "Serie/Folio Complem";
  const row = Array.from({ length: 28 }, (_, index) => `valor ${index}`);

  const parsed = parseBddCsv(`${header.join(",")}\n${row.join(",")}`);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].payload[5], "valor 5");
  assert.equal(parsed[0].payload[24], "valor 24");
});

test("Pagos exige las columnas de negocio antes de aceptar RAW", () => {
  const csv = [
    "Grupo De Facturación,Serie/Folio,Fecha Pago,Importe Pagado",
    "Cliente Demo,AGS-100,04/09/2026,$100.00",
  ].join("\n");
  assert.equal(parsePaymentsCsv(csv).length, 1);
});
