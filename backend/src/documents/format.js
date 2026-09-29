// Formatos de texto de los documentos: fechas en español, montos y nombre de archivo
// estandarizado (<Prefijo>_<Tipo>_<Cliente>_<AAAA-MM-DD>.pdf).
import { FRANQUICIAS, TIPOS_DOCUMENTO } from "./brand.js";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function partes(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

// "2026-08-18" -> "18 de agosto de 2026"
export function fechaLarga(iso) {
  const { year, month, day } = partes(iso);
  return `${day} de ${MESES[month - 1]} de ${year}`;
}

// "2026-07-28" -> "Martes 28 de julio de 2026"
export function fechaConDia(iso) {
  return `${DIAS[partes(iso).weekday]} ${fechaLarga(iso)}`;
}

// "2026-07-28" -> "28/07/2026"
export function fechaCorta(iso) {
  const { year, month, day } = partes(iso);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

const moneyFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function montoTexto(value) {
  return `$${moneyFormatter.format(Number(value) || 0)}`;
}

export function montoTotalTexto(value) {
  return `${montoTexto(value)} MXN`;
}

// "AGS2-2441, AGS2-3373 y AGS2-5165"
export function listaFolios(folios) {
  if (folios.length <= 1) return folios.join("");
  return `${folios.slice(0, -1).join(", ")} y ${folios[folios.length - 1]}`;
}

function sinAcentos(texto) {
  return texto.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

// Primer segmento del nombre (antes de un guion largo), sin acentos, signos ni espacios:
// "MEIKERGRUP — Sr. Rodolfo Reynoso" -> "Meikergrup".
export function slugCliente(nombre, maxLength = 40) {
  const primerSegmento = String(nombre ?? "").split(/\s+[—-]\s+/)[0];
  const palabras = sinAcentos(primerSegmento).replace(/[^A-Za-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  if (!palabras.length) return "Cliente";
  const token = palabras.map((palabra) => palabra[0].toUpperCase() + palabra.slice(1).toLowerCase()).join("");
  return token.slice(0, maxLength);
}

export function nombreArchivo(tipo, franquicia, destinatario, fechaIso) {
  return `${FRANQUICIAS[franquicia].prefijoFactura}_${TIPOS_DOCUMENTO[tipo].label}_${slugCliente(destinatario)}_${fechaIso}.pdf`;
}
