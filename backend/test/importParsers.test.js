import test from "node:test";
import assert from "node:assert/strict";

import { parseBddCsv, parsePaymentsCsv } from "../src/imports/parsers.js";

test("BDD conserva todas las columnas por posición, incluido Ejecutivo de Ventas en AC", () => {
  const header = Array.from({ length: 29 }, (_, index) => `Columna ${index}`);
  header[1] = "Grupo De Facturación";
  header[5] = "Serie/Folio";
  header[11] = "Días Vencida";
  header[21] = "Saldo Neto";
  header[23] = "Estatus";
  header[24] = "Serie/Folio Complem";
  header[28] = "Ejecutivo de Ventas";
  const row = Array.from({ length: 29 }, (_, index) => `valor ${index}`);

  const parsed = parseBddCsv(`${header.join(",")}\n${row.join(",")}`);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].payload[5], "valor 5");
  assert.equal(parsed[0].payload[24], "valor 24");
  assert.equal(parsed[0].payload[28], "valor 28");
});

test("BDD sigue aceptando temporalmente los 28 encabezados anteriores", () => {
  const header = Array.from({ length: 28 }, (_, index) => `Columna ${index}`);
  header[1] = "Grupo De Facturación";
  header[5] = "Serie/Folio";
  header[11] = "Días Vencida";
  header[21] = "Saldo Neto";
  header[23] = "Estatus";
  const row = Array.from({ length: 28 }, (_, index) => `valor ${index}`);

  assert.equal(parseBddCsv(`${header.join(",")}\n${row.join(",")}`).length, 1);
});

test("Pagos exige las columnas de negocio antes de aceptar RAW", () => {
  const csv = [
    "Grupo De Facturación,Serie/Folio,Fecha Pago,Importe Pagado",
    "Cliente Demo,AGS-100,04/09/2026,$100.00",
  ].join("\n");
  assert.equal(parsePaymentsCsv(csv).length, 1);
});
