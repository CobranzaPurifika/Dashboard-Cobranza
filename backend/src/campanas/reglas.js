// Motor de reglas del módulo Campañas. Código puro (sin base de datos ni Drive) para poder
// probarlo con fechas fijas.
//
// Reglas:
// - Preventivo: cliente al corriente con una factura que vence dentro de los próximos
//   `preventivoDiasAntes` días (incluido el día del vencimiento). Un recordatorio por factura.
// - Correctivo: cliente con atraso máximo de 1 a 30 días. Dos recordatorios al mes, a partir
//   de los días 7 y 15 (o el siguiente día hábil); cada uno queda pendiente hasta que abre la
//   siguiente ventana, para no perderlo si nadie entra justo ese día.
// - Escalamiento: atraso máximo de 31 días o más. Sin mensaje masivo: lista para gestión
//   puntual del gestor o administrador, con sugerencia de emitir documento.
//
// El vencimiento es la fecha de facturación + días de crédito de la BDD. Si una factura no
// trae días de crédito, se usan sus "Días Vencida" de la BDD y no entra al preventivo.
import { addCalendarDays } from "../domain/dates.js";
import { normalizeInvoiceKey } from "../imports/consolidation.js";
import { REGLAS } from "./config.js";
import { normalizarCorreos, properCase } from "./contactos.js";
import { asuntoCorreo, correoHtml, correoTexto, enlaceWhatsApp, mensajeWhatsApp } from "./mensajes.js";

function diaSemana(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function esDiaHabil(iso) {
  const dia = diaSemana(iso);
  return dia !== 0 && dia !== 6;
}

export function primerDiaHabilDesde(iso) {
  let fecha = iso;
  while (!esDiaHabil(fecha)) fecha = addCalendarDays(fecha, 1);
  return fecha;
}

export function sumarDiasHabiles(iso, dias) {
  let fecha = iso;
  let restantes = dias;
  while (restantes > 0) {
    fecha = addCalendarDays(fecha, 1);
    if (esDiaHabil(fecha)) restantes -= 1;
  }
  return fecha;
}

export function diasEntre(desdeISO, hastaISO) {
  return Math.round((Date.parse(`${hastaISO}T00:00:00Z`) - Date.parse(`${desdeISO}T00:00:00Z`)) / 86_400_000);
}

// Ventanas activas para la fecha dada. El correctivo devuelve el recordatorio vigente
// ("R1" o "R2") y su periodo, que es la llave de deduplicación del mes.
export function ventanas(hoyISO) {
  const mes = hoyISO.slice(0, 7);
  const [dia1, dia2] = REGLAS.correctivoDias;
  const inicioR1 = primerDiaHabilDesde(`${mes}-${String(dia1).padStart(2, "0")}`);
  const inicioR2 = primerDiaHabilDesde(`${mes}-${String(dia2).padStart(2, "0")}`);
  let correctivo = null;
  if (hoyISO >= inicioR2) correctivo = { recordatorio: "R2", periodo: `${mes}-R2`, desdeISO: inicioR2 };
  else if (hoyISO >= inicioR1) correctivo = { recordatorio: "R1", periodo: `${mes}-R1`, desdeISO: inicioR1 };
  return {
    preventivo: { diasAntes: REGLAS.preventivoDiasAntes },
    correctivo,
    proximoCorrectivoISO: hoyISO < inicioR1 ? inicioR1 : hoyISO < inicioR2 ? inicioR2 : null,
  };
}

export function calendarioFactura(factura, hoyISO) {
  if (factura.fechaFacturacionISO && Number.isInteger(factura.diasCredito)) {
    const vencimientoISO = addCalendarDays(factura.fechaFacturacionISO, factura.diasCredito);
    const diasAtraso = diasEntre(vencimientoISO, hoyISO);
    return { vencimientoISO, diasAtraso, diasParaVencer: -diasAtraso };
  }
  return { vencimientoISO: null, diasAtraso: Math.max(0, factura.diasVencidaBdd), diasParaVencer: null };
}

export function tramoDeAtraso(dias) {
  if (dias <= 0) return { tramo: "good", label: "Al corriente" };
  if (dias <= 30) return { tramo: "warning", label: "1-30 días" };
  if (dias <= 60) return { tramo: "serious", label: "31-60 días" };
  return { tramo: "critical", label: "+60 días" };
}

const redondear = (valor) => Math.round(valor * 100) / 100;

export function llaveEnvio(groupKey, regla, periodo) {
  return `${groupKey}|${regla}|${periodo}`;
}

// Canal según el segmento: residencial por WhatsApp (asistido), comercial por correo solo si
// está marcado en el directorio. Si no hay canal, se explica el motivo.
function asignarCanal(segment, contacto) {
  const telefono = contacto?.telefono || null;
  if (segment === "comercial") {
    const correos = normalizarCorreos(contacto?.correo);
    if (contacto?.recibe_correo && correos.length) return { canal: "correo", destino: correos.join(", "), telefono };
    const motivo = !correos.length ? "Comercial sin correo registrado" : "Comercial sin autorización de correo";
    return { canal: null, motivo, telefono };
  }
  if (telefono) return { canal: "whatsapp", destino: telefono, telefono };
  return { canal: null, motivo: "Residencial sin teléfono registrado", telefono: null };
}

function construirMensajes(item, telefono) {
  const texto = mensajeWhatsApp(item);
  return {
    whatsappTexto: texto,
    whatsappUrl: telefono ? enlaceWhatsApp(telefono, texto) : null,
    correoAsunto: asuntoCorreo(item),
    correoTexto: correoTexto(item),
  };
}

/**
 * Arma el lote del día de una franquicia.
 * @param {object} input
 * @param {string} input.hoyISO fecha de Ciudad de México (YYYY-MM-DD)
 * @param {string} input.franchiseId
 * @param {Array} input.clientes salida de agruparClientes()
 * @param {Map<string, {id, nombre, enListaNegra, promesaVigente}>} input.estadoApp por groupKey
 * @param {Set<string>} input.foliosPagados folios (normalizeInvoiceKey) con pago reciente
 * @param {Set<string>} input.enviados llaves llaveEnvio() ya registradas
 * @param {Map<string, object>} input.contactos fila de campana_contactos por groupKey
 */
export function construirLote({ hoyISO, franchiseId, clientes, estadoApp = new Map(), foliosPagados = new Set(), enviados = new Set(), contactos = new Map() }) {
  const activas = ventanas(hoyISO);
  const pendientes = [];
  const escalamiento = [];
  const excluidos = [];
  const resumen = { clientes: clientes.length, sinVencimiento: 0, yaEnviados: 0 };

  for (const cliente of clientes) {
    const app = estadoApp.get(cliente.groupKey) ?? null;
    const nombre = properCase(cliente.grupo);
    const facturas = cliente.facturas
      .filter((factura) => !foliosPagados.has(normalizeInvoiceKey(factura.folio)))
      .map((factura) => ({ ...factura, ...calendarioFactura(factura, hoyISO) }))
      .sort((a, b) => b.diasAtraso - a.diasAtraso || a.folio.localeCompare(b.folio));
    resumen.sinVencimiento += facturas.filter((factura) => !factura.vencimientoISO).length;

    const base = {
      franchiseId,
      groupKey: cliente.groupKey,
      clienteId: app?.id ?? null,
      nombre,
      segment: cliente.segment,
      ejecutivos: cliente.ejecutivos,
    };

    if (facturas.length === 0) {
      excluidos.push({ ...base, motivo: "Pago registrado recientemente" });
      continue;
    }

    const atrasoMaximo = Math.max(...facturas.map((factura) => factura.diasAtraso));
    const tramo = tramoDeAtraso(atrasoMaximo);
    const saldo = redondear(facturas.reduce((suma, factura) => suma + factura.saldo, 0));

    if (atrasoMaximo >= REGLAS.escalamientoDesde) {
      escalamiento.push({
        ...base,
        ...tramo,
        atrasoMaximo,
        monto: saldo,
        enListaNegra: Boolean(app?.enListaNegra),
        promesaVigente: Boolean(app?.promesaVigente),
        contacto: contactos.get(cliente.groupKey) ?? null,
        facturas: facturas.map(publicarFactura),
      });
      continue;
    }

    if (app?.enListaNegra) {
      excluidos.push({ ...base, motivo: "Cliente en lista negra" });
      continue;
    }
    if (app?.promesaVigente) {
      excluidos.push({ ...base, motivo: "Promesa de pago vigente" });
      continue;
    }

    let regla;
    let periodos;
    let seleccion;
    let fechaLimiteISO;
    if (atrasoMaximo >= 1) {
      if (!activas.correctivo) continue;
      regla = "correctivo";
      if (enviados.has(llaveEnvio(cliente.groupKey, regla, activas.correctivo.periodo))) {
        resumen.yaEnviados += 1;
        continue;
      }
      seleccion = facturas.filter((factura) => factura.diasAtraso >= 1);
      periodos = [activas.correctivo.periodo];
      fechaLimiteISO = sumarDiasHabiles(hoyISO, REGLAS.correctivoPlazoDiasHabiles);
    } else {
      regla = "preventivo";
      const enVentana = facturas.filter((factura) =>
        factura.vencimientoISO && factura.diasParaVencer >= 0 && factura.diasParaVencer <= REGLAS.preventivoDiasAntes);
      seleccion = enVentana.filter((factura) => !enviados.has(llaveEnvio(cliente.groupKey, regla, factura.folio)));
      resumen.yaEnviados += enVentana.length - seleccion.length;
      if (seleccion.length === 0) continue;
      periodos = seleccion.map((factura) => factura.folio);
      fechaLimiteISO = seleccion.map((factura) => factura.vencimientoISO).sort()[0];
    }

    const monto = redondear(seleccion.reduce((suma, factura) => suma + factura.saldo, 0));
    const canal = asignarCanal(cliente.segment, contactos.get(cliente.groupKey));
    const item = {
      ...base,
      ...tramo,
      regla,
      periodos,
      atrasoMaximo,
      monto,
      fechaLimiteISO,
      facturas: seleccion.map(publicarFactura),
      canal: canal.canal,
      destino: canal.destino ?? null,
      telefono: canal.telefono,
      motivoSinCanal: canal.motivo ?? null,
    };
    pendientes.push({ ...item, ...construirMensajes(item, canal.telefono) });
  }

  const porMonto = (a, b) => b.monto - a.monto || a.nombre.localeCompare(b.nombre, "es");
  pendientes.sort(porMonto);
  escalamiento.sort((a, b) => b.atrasoMaximo - a.atrasoMaximo || porMonto(a, b));
  return { hoyISO, franchiseId, ventanas: activas, pendientes, escalamiento, excluidos, resumen };
}

function publicarFactura(factura) {
  return {
    folio: factura.folio,
    saldo: factura.saldo,
    fechaFacturacionISO: factura.fechaFacturacionISO,
    diasCredito: factura.diasCredito,
    vencimientoISO: factura.vencimientoISO,
    diasAtraso: factura.diasAtraso,
  };
}

// Para el correo: el HTML se arma al enviar (no viaja en el lote).
export function correoDeItem(item) {
  return { asunto: asuntoCorreo(item), texto: correoTexto(item), html: correoHtml(item) };
}
