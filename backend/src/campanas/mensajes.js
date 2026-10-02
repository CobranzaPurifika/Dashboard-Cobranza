// Plantillas de los recordatorios, alineadas con la skill "cobranza-purifika":
// - Preventivo (al corriente) y correctivo (1-30 días = mora temprana): tono amable, sin
//   mencionar consecuencias.
// - WhatsApp breve (dato por línea, sin firma extensa, a lo más un emoji en tono amable).
// - Correo con asunto por etapa, monto y fecha límite destacados, formas de pago de la
//   franquicia correcta, contacto de escalamiento y el eslogan como última línea.
import { fechaLarga, listaFolios, montoTotalTexto } from "../documents/format.js";
import { CONTACTO_ESCALAMIENTO, ESLOGAN, FRANQUICIAS } from "./config.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function datosPago(franchiseId) {
  const franquicia = FRANQUICIAS[franchiseId];
  return [
    `Transferencia — ${franquicia.razonSocial}`,
    franquicia.banco,
    `Cuenta: ${franquicia.cuenta} | CLABE: ${franquicia.clabe}`,
  ];
}

function etiquetaFacturas(folios) {
  return folios.length === 1 ? `tu factura ${folios[0]}` : `tus facturas ${listaFolios(folios)}`;
}

// item: { regla, franchiseId, nombre, facturas: [{ folio, saldo, vencimientoISO }], monto,
// fechaLimiteISO }
export function mensajeWhatsApp(item) {
  const folios = item.facturas.map((factura) => factura.folio);
  const ciudad = FRANQUICIAS[item.franchiseId].label;
  if (item.regla === "preventivo") {
    return [
      `Hola, ${item.nombre}. Te saludamos de Purifika ${ciudad} 💧`,
      `Te recordamos que ${etiquetaFacturas(folios)} por ${montoTotalTexto(item.monto)} vence el ${fechaLarga(item.fechaLimiteISO)}.`,
      "Si ya realizaste tu pago, te agradeceremos compartirnos tu comprobante por este medio para aplicarlo a tu cuenta.",
      "¡Gracias por tu preferencia!",
    ].join("\n\n");
  }
  return [
    `Hola, ${item.nombre}. Te saludamos de Purifika ${ciudad}.`,
    `Tu cuenta presenta un saldo pendiente de ${montoTotalTexto(item.monto)} correspondiente a ${etiquetaFacturas(folios)}.`,
    `Te pedimos tu apoyo para ponerla al corriente a más tardar el ${fechaLarga(item.fechaLimiteISO)} y así mantener el mantenimiento continuo de tu servicio de purificación.`,
    `Si ya realizaste tu pago, compártenos tu comprobante por este medio. Datos para transferencia: ${FRANQUICIAS[item.franchiseId].banco}, CLABE ${FRANQUICIAS[item.franchiseId].clabe} (${FRANQUICIAS[item.franchiseId].razonSocial}).`,
  ].join("\n\n");
}

export function asuntoCorreo(item) {
  const ciudad = FRANQUICIAS[item.franchiseId].label;
  const folios = item.facturas.map((factura) => factura.folio);
  const referencia = folios.length === 1 ? `Factura ${folios[0]}` : `Facturas ${listaFolios(folios)}`;
  return item.regla === "preventivo"
    ? `Recordatorio de pago — ${referencia} Purifika ${ciudad}`
    : `Saldo pendiente — ${referencia} Purifika ${ciudad}`;
}

function parrafosCorreo(item) {
  const folios = item.facturas.map((factura) => factura.folio);
  if (item.regla === "preventivo") {
    return {
      intro: `Te recordamos que ${etiquetaFacturas(folios)}, por concepto de renta y mantenimiento de tu equipo purificador, está próxima a vencer:`,
      cierre: "Si ya realizaste el pago, te agradeceremos responder a este correo con tu comprobante para aplicarlo a tu cuenta.",
      etiquetaFecha: "Fecha de vencimiento",
    };
  }
  return {
    intro: `Notamos que ${etiquetaFacturas(folios)}, por concepto de renta y mantenimiento de tu equipo purificador, ${folios.length === 1 ? "sigue pendiente" : "siguen pendientes"} de pago:`,
    cierre: "Para mantener la continuidad operativa de tu servicio de purificación y su mantenimiento preventivo, te pedimos regularizar tu cuenta antes de la fecha indicada. Si ya realizaste el pago, responde a este correo con tu comprobante para registrarlo.",
    etiquetaFecha: "Fecha límite de regularización",
  };
}

export function correoTexto(item) {
  const { intro, cierre, etiquetaFecha } = parrafosCorreo(item);
  const detalle = item.facturas.map((factura) =>
    `  ${factura.folio} — ${montoTotalTexto(factura.saldo)}${factura.vencimientoISO ? ` — vence ${fechaLarga(factura.vencimientoISO)}` : ""}`);
  return [
    `Hola, ${item.nombre}:`,
    "",
    intro,
    "",
    ...detalle,
    "",
    `  Monto pendiente: ${montoTotalTexto(item.monto)}`,
    `  ${etiquetaFecha}: ${fechaLarga(item.fechaLimiteISO)}`,
    "",
    cierre,
    "",
    "Formas de pago:",
    ...datosPago(item.franchiseId).map((linea) => `  ${linea}`),
    "  Cobro domiciliado — si prefieres domiciliar el pago en tarjeta, con gusto te hacemos llegar el formato de alta.",
    "",
    "Para cualquier duda o aclaración:",
    `  ${CONTACTO_ESCALAMIENTO.nombre} — ${CONTACTO_ESCALAMIENTO.correo}`,
    "",
    `Gracias por tu confianza en Purifika ${FRANQUICIAS[item.franchiseId].label}.`,
    "",
    ESLOGAN,
  ].join("\n");
}

export function correoHtml(item) {
  const { intro, cierre, etiquetaFecha } = parrafosCorreo(item);
  const filas = item.facturas.map((factura) => `
        <tr>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${escapeHtml(factura.folio)}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${factura.vencimientoISO ? escapeHtml(fechaLarga(factura.vencimientoISO)) : "—"}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(montoTotalTexto(factura.saldo))}</td>
        </tr>`).join("");
  const pago = datosPago(item.franchiseId).map(escapeHtml).join("<br>");
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f4f7fa;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:28px 28px 20px">
    <p>Hola, ${escapeHtml(item.nombre)}:</p>
    <p>${escapeHtml(intro)}</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;font-size:14px;margin:8px 0 16px">
      <thead><tr>
        <th style="padding:6px 12px;text-align:left;background:#eef4f9">Factura</th>
        <th style="padding:6px 12px;text-align:left;background:#eef4f9">Vencimiento</th>
        <th style="padding:6px 12px;text-align:right;background:#eef4f9">Saldo</th>
      </tr></thead>
      <tbody>${filas}
      </tbody>
    </table>
    <p style="font-size:16px;margin:4px 0"><strong>Monto pendiente: ${escapeHtml(montoTotalTexto(item.monto))}</strong></p>
    <p style="font-size:16px;margin:4px 0 16px"><strong>${escapeHtml(etiquetaFecha)}: ${escapeHtml(fechaLarga(item.fechaLimiteISO))}</strong></p>
    <p>${escapeHtml(cierre)}</p>
    <p><strong>Formas de pago</strong><br>${pago}<br>Cobro domiciliado: si prefieres domiciliar el pago en tarjeta, con gusto te hacemos llegar el formato de alta.</p>
    <p>Para cualquier duda o aclaración:<br>${escapeHtml(CONTACTO_ESCALAMIENTO.nombre)} — <a href="mailto:${escapeHtml(CONTACTO_ESCALAMIENTO.correo)}">${escapeHtml(CONTACTO_ESCALAMIENTO.correo)}</a></p>
    <p>Gracias por tu confianza en Purifika ${escapeHtml(FRANQUICIAS[item.franchiseId].label)}.</p>
    <p style="color:#0e7490;font-weight:bold;margin-top:24px">${escapeHtml(ESLOGAN)}</p>
  </div>
</body></html>`;
}

export function enlaceWhatsApp(telefono, texto) {
  return `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`;
}
