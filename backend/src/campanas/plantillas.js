// Plantillas editables de los recordatorios. Cada plantilla es texto con variables entre
// llaves ({nombre}, {detalle_facturas}…) que se sustituyen con los datos de cada cliente y
// de su franquicia. Las predeterminadas siguen la skill "cobranza-purifika": tono amable
// (mora temprana), datos bancarios de la franquicia correcta, contacto de escalamiento y,
// en correo, el eslogan como última línea.
//
// Los administradores pueden reemplazarlas desde la pestaña Plantillas (tabla
// campana_plantillas); si no hay una guardada, se usa la predeterminada.
import { fechaLarga, listaFolios, montoTotalTexto } from "../documents/format.js";
import { CONTACTO_ESCALAMIENTO, ESLOGAN, FRANQUICIAS } from "./config.js";

export const PLANTILLAS = Object.freeze({
  preventivo_whatsapp: {
    titulo: "Preventivo · WhatsApp",
    regla: "preventivo",
    canal: "whatsapp",
    tipo: "cuerpo",
    predeterminada: [
      "Hola, {nombre}. Te saludamos de {franquicia} 💧",
      "Te recordamos que el pago de {facturas} por {monto} vence el {fecha_limite}.",
      "Datos para transferencia:\n{datos_transferencia}",
      "Si ya realizaste tu pago, te agradeceremos compartirnos tu comprobante por este medio para aplicarlo a tu cuenta.",
      "¡Gracias por tu preferencia!",
    ].join("\n\n"),
  },
  correctivo_whatsapp: {
    titulo: "Correctivo · WhatsApp",
    regla: "correctivo",
    canal: "whatsapp",
    tipo: "cuerpo",
    predeterminada: [
      "Hola, {nombre}. Te saludamos de {franquicia}.",
      "Tu cuenta presenta un saldo pendiente de {monto}:\n{detalle_facturas}",
      "Te pedimos tu apoyo para ponerte al corriente a más tardar el {fecha_limite} y así mantener el mantenimiento continuo de tu servicio de purificación.",
      "Datos para transferencia:\n{datos_transferencia}",
      "Si ya realizaste tu pago, compártenos tu comprobante por este medio para aplicarlo a tu cuenta.",
    ].join("\n\n"),
  },
  preventivo_correo_asunto: {
    titulo: "Preventivo · Asunto del correo",
    regla: "preventivo",
    canal: "correo",
    tipo: "asunto",
    predeterminada: "Recordatorio de pago — {referencia} {franquicia}",
  },
  preventivo_correo: {
    titulo: "Preventivo · Correo",
    regla: "preventivo",
    canal: "correo",
    tipo: "cuerpo",
    predeterminada: [
      "Hola, {nombre}:",
      "Te recordamos que el pago de {facturas}, por concepto de renta y mantenimiento de tu equipo purificador, vence el {fecha_limite}:",
      "{detalle_facturas}",
      "Monto pendiente: {monto}\nFecha de vencimiento: {fecha_limite}",
      "Si ya realizaste el pago, te agradeceremos responder a este correo con tu comprobante para aplicarlo a tu cuenta.",
      "Datos para transferencia:\n{datos_transferencia}",
      "Si prefieres domiciliar el pago en tarjeta, con gusto te hacemos llegar el formato de alta.",
      "Para cualquier duda o aclaración:\n{contacto}",
      "Gracias por tu confianza en {franquicia}.",
      "{eslogan}",
    ].join("\n\n"),
  },
  correctivo_correo_asunto: {
    titulo: "Correctivo · Asunto del correo",
    regla: "correctivo",
    canal: "correo",
    tipo: "asunto",
    predeterminada: "Saldo pendiente — {referencia} {franquicia}",
  },
  correctivo_correo: {
    titulo: "Correctivo · Correo",
    regla: "correctivo",
    canal: "correo",
    tipo: "cuerpo",
    predeterminada: [
      "Hola, {nombre}:",
      "Te informamos que tu cuenta presenta un saldo pendiente de {monto}, correspondiente a {facturas}, por concepto de renta y mantenimiento de tu equipo purificador:",
      "{detalle_facturas}",
      "Monto pendiente: {monto}\nFecha límite de regularización: {fecha_limite}",
      "Para mantener la continuidad operativa de tu servicio de purificación y su mantenimiento preventivo, te pedimos regularizar tu cuenta antes de la fecha indicada. Si ya realizaste el pago, responde a este correo con tu comprobante para registrarlo.",
      "Datos para transferencia:\n{datos_transferencia}",
      "Si prefieres domiciliar el pago en tarjeta, con gusto te hacemos llegar el formato de alta.",
      "Para cualquier duda o aclaración:\n{contacto}",
      "Gracias por tu confianza en {franquicia}.",
      "{eslogan}",
    ].join("\n\n"),
  },
});

export const VARIABLES = Object.freeze([
  { clave: "nombre", descripcion: "Nombre del cliente (Grupo De Facturación)", ejemplo: "María López" },
  { clave: "franquicia", descripcion: "Purifika y la ciudad de la franquicia", ejemplo: "Purifika Aguascalientes" },
  { clave: "ciudad", descripcion: "Ciudad de la franquicia", ejemplo: "Aguascalientes" },
  { clave: "facturas", descripcion: "“tu factura X” o “tus facturas X y Y”", ejemplo: "tus facturas AGS2-20 y AGS2-21" },
  { clave: "folios", descripcion: "Solo los folios", ejemplo: "AGS2-20 y AGS2-21" },
  { clave: "referencia", descripcion: "“Factura X” o “Facturas X y Y” (para el asunto)", ejemplo: "Facturas AGS2-20 y AGS2-21" },
  { clave: "detalle_facturas", descripcion: "Una línea por factura con su saldo y vencimiento (en correo, tabla)", ejemplo: "• AGS2-20 — $1,200.00 MXN — venció el 16 de septiembre de 2026" },
  { clave: "monto", descripcion: "Total de las facturas del recordatorio", ejemplo: "$2,050.00 MXN" },
  { clave: "fecha_limite", descripcion: "Fecha de vencimiento (preventivo) o límite para pagar (correctivo)", ejemplo: "14 de octubre de 2026" },
  { clave: "dias_atraso", descripcion: "Días de atraso de la factura más antigua", ejemplo: "21" },
  { clave: "datos_transferencia", descripcion: "Beneficiario, banco, cuenta y CLABE de la franquicia", ejemplo: "Beneficiario: Stream Ingeniería Sustentable…" },
  { clave: "razon_social", descripcion: "Razón social de la franquicia", ejemplo: "Stream Ingeniería Sustentable" },
  { clave: "banco", descripcion: "Banco de la franquicia", ejemplo: "Banco Santander México, S.A." },
  { clave: "cuenta", descripcion: "Número de cuenta de la franquicia", ejemplo: "65509223777" },
  { clave: "clabe", descripcion: "CLABE de la franquicia", ejemplo: "014010655092237775" },
  { clave: "contacto", descripcion: "Contacto de cobranza para dudas", ejemplo: "Jonathan De Santiago — cobranza.ags@purifika.com" },
  { clave: "eslogan", descripcion: "Eslogan de Purifika", ejemplo: ESLOGAN },
]);

const CLAVES_VARIABLES = new Set(VARIABLES.map((variable) => variable.clave));
const PATRON_VARIABLE = /\{([a-z_]+)\}/g;
export const LIMITE_ASUNTO = 200;
export const LIMITE_CUERPO = 4000;

export function esClavePlantilla(clave) {
  return Object.hasOwn(PLANTILLAS, clave);
}

// Plantillas vigentes: las guardadas por el administrador sobre las predeterminadas.
// guardadas: { [clave]: contenido }
export function plantillasVigentes(guardadas = {}) {
  return Object.fromEntries(Object.entries(PLANTILLAS).map(([clave, plantilla]) => [clave, guardadas[clave] ?? plantilla.predeterminada]));
}

// Revisa una plantilla antes de guardarla. Devuelve el contenido limpio o lanza un error
// con statusCode 400 y un mensaje para el usuario.
export function validarPlantilla(clave, contenido) {
  const fallar = (mensaje) => {
    const error = new Error(mensaje);
    error.statusCode = 400;
    throw error;
  };
  if (!esClavePlantilla(clave)) fallar("Plantilla desconocida");
  const esAsunto = PLANTILLAS[clave].tipo === "asunto";
  let texto = String(contenido ?? "").replace(/\r\n?/g, "\n").trim();
  if (esAsunto) texto = texto.replace(/\s+/g, " ");
  if (!texto) fallar("La plantilla no puede quedar vacía");
  const limite = esAsunto ? LIMITE_ASUNTO : LIMITE_CUERPO;
  if (texto.length > limite) fallar(`La plantilla supera ${limite} caracteres`);
  const desconocidas = [...new Set([...texto.matchAll(PATRON_VARIABLE)].map((match) => match[1]))]
    .filter((variable) => !CLAVES_VARIABLES.has(variable));
  if (desconocidas.length) {
    fallar(`Variable${desconocidas.length === 1 ? "" : "s"} desconocida${desconocidas.length === 1 ? "" : "s"}: ${desconocidas.map((variable) => `{${variable}}`).join(", ")}`);
  }
  return texto;
}

function lineaFactura(factura) {
  const vencimiento = factura.vencimientoISO
    ? ` — ${factura.diasAtraso >= 1 ? "venció" : "vence"} el ${fechaLarga(factura.vencimientoISO)}`
    : "";
  return `• ${factura.folio} — ${montoTotalTexto(factura.saldo)}${vencimiento}`;
}

// Valores de las variables para un item del lote.
// item: { regla, franchiseId, nombre, facturas: [{ folio, saldo, vencimientoISO, diasAtraso }],
// monto, fechaLimiteISO, atrasoMaximo }
export function variablesDeItem(item) {
  const franquicia = FRANQUICIAS[item.franchiseId];
  const folios = item.facturas.map((factura) => factura.folio);
  const lista = listaFolios(folios);
  return {
    nombre: item.nombre,
    franquicia: `Purifika ${franquicia.label}`,
    ciudad: franquicia.label,
    facturas: folios.length === 1 ? `tu factura ${lista}` : `tus facturas ${lista}`,
    folios: lista,
    referencia: folios.length === 1 ? `Factura ${lista}` : `Facturas ${lista}`,
    detalle_facturas: item.facturas.map(lineaFactura).join("\n"),
    monto: montoTotalTexto(item.monto),
    fecha_limite: item.fechaLimiteISO ? fechaLarga(item.fechaLimiteISO) : "",
    dias_atraso: String(Math.max(0, item.atrasoMaximo ?? 0)),
    datos_transferencia: [
      `Beneficiario: ${franquicia.razonSocial}`,
      `Banco: ${franquicia.banco}`,
      `Cuenta: ${franquicia.cuenta}`,
      `CLABE: ${franquicia.clabe}`,
    ].join("\n"),
    razon_social: franquicia.razonSocial,
    banco: franquicia.banco,
    cuenta: franquicia.cuenta,
    clabe: franquicia.clabe,
    contacto: `${CONTACTO_ESCALAMIENTO.nombre} — ${CONTACTO_ESCALAMIENTO.correo}`,
    eslogan: ESLOGAN,
  };
}

export function sustituir(plantilla, variables) {
  return plantilla.replace(PATRON_VARIABLE, (completo, clave) => (Object.hasOwn(variables, clave) ? variables[clave] : completo));
}

// ---- HTML del correo ----

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ESTILO_ESLOGAN = "color:#0e7490;font-weight:bold;margin-top:24px";

function tablaFacturasHtml(item) {
  const celda = "padding:6px 12px;border-bottom:1px solid #e5e7eb";
  const filas = item.facturas.map((factura) => `
        <tr>
          <td style="${celda}">${escapeHtml(factura.folio)}</td>
          <td style="${celda}">${factura.vencimientoISO ? escapeHtml(fechaLarga(factura.vencimientoISO)) : "—"}</td>
          <td style="${celda};text-align:right">${escapeHtml(montoTotalTexto(factura.saldo))}</td>
        </tr>`).join("");
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;font-size:14px;margin:4px 0">
      <thead><tr>
        <th style="padding:6px 12px;text-align:left;background:#eef4f9">Factura</th>
        <th style="padding:6px 12px;text-align:left;background:#eef4f9">Vencimiento</th>
        <th style="padding:6px 12px;text-align:right;background:#eef4f9">Saldo</th>
      </tr></thead>
      <tbody>${filas}
      </tbody>
    </table>`;
}

function datosTransferenciaHtml(variables) {
  const lineas = variables.datos_transferencia.split("\n").map((linea) => {
    const [etiqueta, ...resto] = linea.split(": ");
    return `<strong>${escapeHtml(etiqueta)}:</strong> ${escapeHtml(resto.join(": "))}`;
  });
  return `<div style="background:#eafafb;border-left:4px solid #25cad2;padding:10px 14px;margin:4px 0">${lineas.join("<br>")}</div>`;
}

function documentoHtml(cuerpo) {
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f4f7fa;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:28px 28px 20px;font-size:14px;line-height:1.5">
${cuerpo}
  </div>
</body></html>`;
}

// Arma el HTML a partir de la plantilla (no del texto ya sustituido) para que
// {detalle_facturas} y {datos_transferencia}, cuando ocupan su propia línea, salgan como
// tabla y recuadro; un párrafo que solo tiene {eslogan} sale con el estilo de marca.
export function correoHtmlDesdePlantilla(plantilla, item) {
  const variables = variablesDeItem(item);
  const bloques = {
    "{detalle_facturas}": tablaFacturasHtml(item),
    "{datos_transferencia}": datosTransferenciaHtml(variables),
  };
  const parrafos = plantilla.split(/\n{2,}/).map((parrafo) => parrafo.trim()).filter(Boolean).map((parrafo) => {
    if (parrafo === "{eslogan}") return `    <p style="${ESTILO_ESLOGAN}">${escapeHtml(variables.eslogan)}</p>`;
    const partes = [];
    let lineas = [];
    const cerrarLineas = () => {
      if (lineas.length) partes.push(`<p style="margin:0 0 4px">${lineas.join("<br>")}</p>`);
      lineas = [];
    };
    for (const linea of parrafo.split("\n")) {
      const bloque = bloques[linea.trim()];
      if (bloque) {
        cerrarLineas();
        partes.push(bloque);
      } else {
        lineas.push(escapeHtml(sustituir(linea, variables)).replace(/\n/g, "<br>"));
      }
    }
    cerrarLineas();
    return `    <div style="margin:0 0 14px">${partes.join("\n")}</div>`;
  });
  return documentoHtml(parrafos.join("\n"));
}

// HTML de un correo cuyo texto se editó a mano para un envío: párrafos y saltos de línea;
// el eslogan conserva su estilo si quedó como párrafo propio.
export function correoHtmlDesdeTexto(texto) {
  const parrafos = String(texto ?? "").replace(/\r\n?/g, "\n").split(/\n{2,}/).map((parrafo) => parrafo.trim()).filter(Boolean)
    .map((parrafo) => (parrafo === ESLOGAN
      ? `    <p style="${ESTILO_ESLOGAN}">${escapeHtml(parrafo)}</p>`
      : `    <p style="margin:0 0 14px">${escapeHtml(parrafo).replace(/\n/g, "<br>")}</p>`));
  return documentoHtml(parrafos.join("\n"));
}
