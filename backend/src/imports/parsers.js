import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";

const BDD_COLUMNS = 28;
const BDD_POSITION_CHECKS = new Map([
  [1, "grupo de facturacion"],
  [5, "serie/folio"],
  [11, "dias vencida"],
  [21, "saldo neto"],
  [23, "estatus"],
]);
const PAYMENT_REQUIRED_COLUMNS = [
  "grupo de facturacion",
  "serie/folio",
  "fecha pago",
  "importe pagado",
];

export function parseBddCsv(csvText) {
  const rows = parse(csvText, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: false,
  });

  if (rows.length === 0) throw new Error("El archivo BDD está vacío");
  const [header, ...dataRows] = rows;
  if (header.length !== BDD_COLUMNS) {
    throw new Error(`BDD debe tener 28 columnas; se recibieron ${header.length}`);
  }

  for (const [index, expected] of BDD_POSITION_CHECKS) {
    if (normalizeHeader(header[index]) !== expected) {
      throw new Error(`Encabezado BDD inesperado en columna ${index + 1}: ${header[index]}`);
    }
  }

  return dataRows.map((columns, index) => rawRow(index + 2, columns));
}

export function parsePaymentsCsv(csvText) {
  const rows = parse(csvText, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: false,
  });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : firstCsvHeader(csvText);
  const normalized = new Set(headers.map(normalizeHeader));

  for (const required of PAYMENT_REQUIRED_COLUMNS) {
    if (!normalized.has(required)) {
      throw new Error(`El archivo de Pagos no contiene la columna requerida: ${required}`);
    }
  }

  return rows.map((payload, index) => rawRow(index + 2, payload));
}

function firstCsvHeader(csvText) {
  const [header = []] = parse(csvText, { bom: true, to_line: 1 });
  return header;
}

function rawRow(sourceRow, payload) {
  const canonical = JSON.stringify(payload);
  return {
    source_row: sourceRow,
    row_hash: createHash("sha256").update(canonical).digest("hex"),
    payload,
  };
}

function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
