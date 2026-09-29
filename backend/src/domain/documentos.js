// Arma los datos de un documento formal (aviso de deuda, aviso de retiro, acuerdo/propuesta
// de pagos) a partir de la ficha del cliente y de lo capturado en el formulario. Los montos,
// folios y fechas de factura salen siempre de la base -- nunca del navegador -- para no
// inventar cifras en un documento con peso legal.
import { FRANQUICIAS, TIPOS_DOCUMENTO, franquiciaPorFacturas } from "../documents/brand.js";
import {
  fechaConDia, fechaLarga, isIsoDate, listaFolios,
  montoTexto, montoTotalTexto, nombreArchivo,
} from "../documents/format.js";

export const DOCUMENT_TYPES = Object.freeze(Object.keys(TIPOS_DOCUMENTO));

const MAX_TEXT = 400;
const MAX_PARCIALIDADES = 36;
const MAX_CONDICIONES = 10;

class DocumentValidationError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

function fail(message) {
  throw new DocumentValidationError(message);
}

function cleanText(value, max = MAX_TEXT) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function toCents(value) {
  return Math.round(Number(value) * 100);
}

function idList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id)))];
}

// invoices: filas de la BDD del cliente con { id, folio, monto, dias_vencida,
// fecha_facturacion_texto, fecha_vencimiento_texto }.
export function buildDocumentData(tipo, cliente, invoices, body = {}) {
  if (!DOCUMENT_TYPES.includes(tipo)) fail("Tipo de documento desconocido");

  const invoicesById = new Map(invoices.map((invoice) => [String(invoice.id), invoice]));
  const selectedIds = idList(body.facturaIds);
  if (!selectedIds.length) fail("Selecciona al menos una factura");
  const selected = selectedIds.map((id) => invoicesById.get(id) ?? fail("Una de las facturas seleccionadas no pertenece a este cliente"));
  selected.sort((a, b) => String(a.fecha_facturacion_iso ?? "").localeCompare(String(b.fecha_facturacion_iso ?? ""))
    || String(a.folio).localeCompare(String(b.folio)));

  const fechaISO = body.fechaISO ?? null;
  if (!isIsoDate(fechaISO)) fail("La fecha del documento no es válida");

  const nombre = cleanText(body.destinatario?.nombre, 160);
  if (!nombre) fail("El nombre del destinatario es obligatorio");
  const direccion = cleanText(body.destinatario?.direccion, 240);


  const warnings = [];
  // Los folios mandan sobre la franquicia registrada: ante una discrepancia se usan la razón
  // social y la cuenta que corresponden a las facturas, y se avisa de la corrección.
  let franquiciaId = cliente.franchise_id;
  const porFolios = franquiciaPorFacturas(selected.map((invoice) => invoice.folio));
  if (porFolios && porFolios !== franquiciaId) {
    warnings.push(`La franquicia del cliente (${franquiciaId}) no coincide con el prefijo de sus facturas; se usaron los datos de ${FRANQUICIAS[porFolios].nombreComercial}.`);
    franquiciaId = porFolios;
  }
  const franquicia = FRANQUICIAS[franquiciaId] ?? fail("La franquicia del cliente no es válida");

  const totalCents = selected.reduce((sum, invoice) => sum + toCents(invoice.monto), 0);
  const total = totalCents / 100;
  const sinVencimiento = selected.filter((invoice) => !invoice.fecha_vencimiento_texto);
  if (sinVencimiento.length && tipo !== "acuerdo_pagos") {
    warnings.push(`No se encontró la fecha de vencimiento de ${listaFolios(sinVencimiento.map((invoice) => invoice.folio))}; se muestra "—".`);
  }

  const data = {
    franquicia,
    franquiciaId,
    fecha: fechaLarga(fechaISO),
    destinatario: { nombre, direccion },
    montoTotal: montoTotalTexto(total),
    montoTotalNumero: total,
    diasMora: Math.max(0, ...selected.map((invoice) => Number(invoice.dias_vencida) || 0)),
    facturas: selected.map((invoice) => ({
      folio: invoice.folio,
      fechaFactura: invoice.fecha_facturacion_texto || "—",
      fechaVencimiento: invoice.fecha_vencimiento_texto || "—",
      diasAtraso: Math.max(0, Number(invoice.dias_vencida) || 0),
      importe: montoTexto(invoice.monto),
    })),
  };

  if (tipo === "aviso_deuda") {
    const nota = cleanText(body.notaAdicional);
    if (nota) data.notaAdicional = nota;
  }

  if (tipo === "aviso_retiro") {
    const retiro = body.retiro ?? {};
    if (retiro.fechaISO && !isIsoDate(retiro.fechaISO)) fail("La fecha de retiro no es válida");
    // Sin fecha definida el documento dice literalmente "Por definir" -- nunca se inventa una
    // fecha de retiro que aún no está agendada.
    data.fechaRetiro = retiro.fechaISO ? fechaConDia(retiro.fechaISO) : "Por definir";
    data.equipos = String(retiro.equipos ?? "").split(/[,\n]/).map((equipo) => cleanText(equipo, 60)).filter(Boolean).slice(0, 40);
  }

  if (tipo === "acuerdo_pagos") {
    const acuerdo = body.acuerdo ?? {};
    const parcialidades = Array.isArray(acuerdo.parcialidades) ? acuerdo.parcialidades : [];
    if (!parcialidades.length) fail("Agrega al menos una parcialidad");
    if (parcialidades.length > MAX_PARCIALIDADES) fail(`El acuerdo admite hasta ${MAX_PARCIALIDADES} parcialidades`);
    const selectedSet = new Set(selected.map((invoice) => String(invoice.id)));
    let parcialidadesCents = 0;
    data.parcialidades = parcialidades.map((parcialidad, index) => {
      const fila = index + 1;
      if (!isIsoDate(parcialidad?.fechaISO)) fail(`La parcialidad ${fila} no tiene una fecha válida`);
      const importe = Number(parcialidad.importe);
      if (!Number.isFinite(importe) || importe <= 0) fail(`La parcialidad ${fila} necesita un importe mayor a cero`);
      const ids = idList(parcialidad.facturaIds);
      if (!ids.length) fail(`Indica qué facturas cubre la parcialidad ${fila}`);
      if (ids.some((id) => !selectedSet.has(id))) fail(`La parcialidad ${fila} incluye una factura que no está seleccionada`);
      parcialidadesCents += toCents(importe);
      const folios = selected.filter((invoice) => ids.includes(String(invoice.id))).map((invoice) => invoice.folio);
      return { fecha: fechaConDia(parcialidad.fechaISO), facturas: listaFolios(folios), importe: montoTexto(importe) };
    });
    if (parcialidadesCents !== totalCents) {
      warnings.push(`Las parcialidades suman ${montoTotalTexto(parcialidadesCents / 100)} y el adeudo de las facturas seleccionadas es ${data.montoTotal}.`);
    }
    data.esBorrador = acuerdo.esBorrador !== false;
    data.condiciones = (Array.isArray(acuerdo.condiciones) ? acuerdo.condiciones : [])
      .map((condicion) => cleanText(condicion))
      .filter(Boolean)
      .slice(0, MAX_CONDICIONES);
  }

  return { data, warnings, fileName: nombreArchivo(tipo, franquiciaId, nombre, fechaISO) };
}
