// Mensajes de cada recordatorio a partir de las plantillas (predeterminadas o editadas por un
// administrador en la pestaña Plantillas), personalizados con los datos del cliente y de su
// franquicia: nombre, facturas pendientes, monto, fecha límite y datos de transferencia.
import { correoHtmlDesdePlantilla, mensajeDeItem, plantillasVigentes, sustituir, variablesDeItem } from "./plantillas.js";

const PREDETERMINADAS = plantillasVigentes();

// item: { regla, recordatorio, franchiseId, nombre, facturas: [{ folio, saldo, vencimientoISO, diasAtraso }],
// monto, fechaLimiteISO, atrasoMaximo }. plantillas: salida de plantillasVigentes().
export function mensajeWhatsApp(item, plantillas = PREDETERMINADAS) {
  return sustituir(plantillas[`${mensajeDeItem(item)}_whatsapp`], variablesDeItem(item));
}

export function asuntoCorreo(item, plantillas = PREDETERMINADAS) {
  return sustituir(plantillas[`${mensajeDeItem(item)}_correo_asunto`], variablesDeItem(item)).replace(/\s+/g, " ").trim();
}

export function correoTexto(item, plantillas = PREDETERMINADAS) {
  return sustituir(plantillas[`${mensajeDeItem(item)}_correo`], variablesDeItem(item));
}

export function correoHtml(item, plantillas = PREDETERMINADAS) {
  return correoHtmlDesdePlantilla(plantillas[`${mensajeDeItem(item)}_correo`], item);
}

export function enlaceWhatsApp(telefono, texto) {
  return `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`;
}
