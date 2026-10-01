// Lectura de la BDD (Antigüedad de Saldos) para el módulo Campañas.
//
// Usa las mismas posiciones de columna y los mismos criterios de la importación oficial
// (consolidation.js): solo filas "Facturada" / "Pago parcial" con saldo positivo, el
// Grupo De Facturación identifica al cliente y el RFC define el segmento. A diferencia de la
// importación, conserva cada factura con sus días de crédito (columna K) para calcular el
// vencimiento real: los "Días Vencida" de la BDD llegan en 0 en facturas con pago parcial
// aunque ya estén vencidas.
import {
  normalizeBusinessKey,
  parseDate,
  parseMoney,
  segmentFromRfc,
} from "../imports/consolidation.js";

const COL = Object.freeze({
  clientName: 0,
  group: 1,
  rfc: 2,
  folio: 5,
  invoiceDate: 8,
  creditDays: 10,
  overdueDays: 11,
  balance: 21,
  status: 23,
  collectionExecutive: 29,
});

const ESTATUS_VIGENTES = new Set(["facturada", "pago parcial"]);

function texto(value) {
  return String(value ?? "").trim();
}

function entero(value) {
  const limpio = texto(value);
  if (!/^-?\d{1,5}$/.test(limpio)) return null;
  return Number.parseInt(limpio, 10);
}

// rawRows: salida de parseBddCsv (cada fila con `payload` = arreglo de columnas).
export function extraerFacturas(franchiseId, rawRows) {
  const facturas = [];
  for (const { payload: row } of rawRows) {
    if (!ESTATUS_VIGENTES.has(normalizeBusinessKey(row[COL.status]))) continue;
    const grupo = texto(row[COL.group]);
    const folio = texto(row[COL.folio]);
    const saldo = parseMoney(row[COL.balance]);
    if (!grupo || !folio || !Number.isFinite(saldo) || saldo <= 0) continue;

    const credito = entero(row[COL.creditDays]);
    facturas.push({
      franchiseId,
      groupKey: normalizeBusinessKey(grupo),
      grupo,
      rfc: texto(row[COL.rfc]).toUpperCase(),
      folio,
      saldo: Math.round(saldo * 100) / 100,
      fechaFacturacionISO: parseDate(row[COL.invoiceDate]),
      diasCredito: credito !== null && credito >= 0 ? credito : null,
      diasVencidaBdd: entero(row[COL.overdueDays]) ?? 0,
      ejecutivoCobranza: texto(row[COL.collectionExecutive]) || null,
    });
  }
  return facturas;
}

// Agrupa las facturas por cliente (Grupo De Facturación). El segmento sale del primer RFC
// disponible del grupo, igual que en la importación oficial.
export function agruparClientes(facturas) {
  const porGrupo = new Map();
  for (const factura of facturas) {
    const actual = porGrupo.get(factura.groupKey);
    if (actual) {
      actual.facturas.push(factura);
      if (!actual.rfc && factura.rfc) actual.rfc = factura.rfc;
      if (factura.ejecutivoCobranza) actual.ejecutivos.add(factura.ejecutivoCobranza);
    } else {
      porGrupo.set(factura.groupKey, {
        franchiseId: factura.franchiseId,
        groupKey: factura.groupKey,
        grupo: factura.grupo,
        rfc: factura.rfc,
        ejecutivos: new Set(factura.ejecutivoCobranza ? [factura.ejecutivoCobranza] : []),
        facturas: [factura],
      });
    }
  }
  return [...porGrupo.values()].map((cliente) => ({
    ...cliente,
    segment: segmentFromRfc(cliente.rfc).value,
    ejecutivos: [...cliente.ejecutivos].sort(),
  }));
}
