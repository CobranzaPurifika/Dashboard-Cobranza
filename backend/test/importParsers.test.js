import test from "node:test";
import assert from "node:assert/strict";

import { parseBddCsv, parsePaymentsCsv } from "../src/imports/parsers.js";

test("BDD conserva todas las columnas por posición, incluidos Ejecutivo Ventas (AC) y Ejecutivo Cobranza (AD)", () => {
  const header = Array.from({ length: 30 }, (_, index) => `Columna ${index}`);
  header[1] = "Grupo De Facturación";
  header[5] = "Serie/Folio";
  header[11] = "Días Vencida";
  header[21] = "Saldo Neto";
  header[23] = "Estatus";
  header[24] = "Serie/Folio Complem";
  header[28] = "Ejecutivo Ventas";
  header[29] = "Ejecutivo Cobranza";
  const row = Array.from({ length: 30 }, (_, index) => `valor ${index}`);

  const parsed = parseBddCsv(`${header.join(",")}\n${row.join(",")}`);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].payload[5], "valor 5");
  assert.equal(parsed[0].payload[24], "valor 24");
  assert.equal(parsed[0].payload[28], "valor 28");
  assert.equal(parsed[0].payload[29], "valor 29");
});

test("BDD sigue aceptando un lote con Ejecutivo Ventas pero sin Ejecutivo Cobranza todavía", () => {
  const header = Array.from({ length: 29 }, (_, index) => `Columna ${index}`);
  header[1] = "Grupo De Facturación";
  header[5] = "Serie/Folio";
  header[11] = "Días Vencida";
  header[21] = "Saldo Neto";
  header[23] = "Estatus";
  header[28] = "Ejecutivo Ventas";
  const row = Array.from({ length: 29 }, (_, index) => `valor ${index}`);

  assert.equal(parseBddCsv(`${header.join(",")}\n${row.join(",")}`).length, 1);
});

test("BDD rechaza un encabezado inesperado en la columna AD", () => {
  const header = Array.from({ length: 30 }, (_, index) => `Columna ${index}`);
  header[1] = "Grupo De Facturación";
  header[5] = "Serie/Folio";
  header[11] = "Días Vencida";
  header[21] = "Saldo Neto";
  header[23] = "Estatus";
  header[28] = "Ejecutivo Ventas";
  header[29] = "Otra Cosa";
  const row = Array.from({ length: 30 }, (_, index) => `valor ${index}`);

  assert.throws(() => parseBddCsv(`${header.join(",")}\n${row.join(",")}`), /columna AD/);
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
