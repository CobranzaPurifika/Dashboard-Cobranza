// Normalización de datos de contacto y lectura del archivo del portal.
import { parse } from "csv-parse/sync";
import { normalizeBusinessKey } from "../imports/consolidation.js";

// Teléfono de México a formato internacional para wa.me (52 + 10 dígitos). Acepta 10
// dígitos, 52 + 10, el antiguo 521 + 10 de celulares y celdas con varios números separados
// por "/", "," o ";" (se toma el primero válido). Devuelve null si no hay uno válido.
export function normalizarTelefono(value) {
  const candidatos = String(value ?? "").split(/[\/,;|]|\s{2,}|\by\b/i);
  for (const candidato of candidatos) {
    const digitos = candidato.replace(/\D/g, "");
    if (digitos.length === 10) return `52${digitos}`;
    if (digitos.length === 12 && digitos.startsWith("52")) return digitos;
    if (digitos.length === 13 && digitos.startsWith("521")) return `52${digitos.slice(3)}`;
  }
  return null;
}

// "52 449 123 4567" para mostrar en pantalla.
export function telefonoLegible(normalizado) {
  if (!normalizado) return "";
  const local = normalizado.slice(2);
  return `+52 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

const CORREO = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

// Uno o varios correos separados por coma, punto y coma o espacios. Devuelve la lista
// válida, en minúsculas y sin duplicados.
export function normalizarCorreos(value) {
  const vistos = new Set();
  for (const parte of String(value ?? "").split(/[\s,;]+/)) {
    const correo = parte.trim().toLowerCase();
    if (CORREO.test(correo)) vistos.add(correo);
  }
  return [...vistos];
}

const CONECTORES = new Set(["de", "del", "y", "e", "en"]);
const ARTICULOS = new Set(["la", "las", "los", "el"]);
const SIGLAS = new Set(["ags", "sa", "cv", "rl", "sc", "sapi", "sab", "ac", "spr", "srl", "bc", "ii", "iii", "iv"]);

// Presentación en Proper Case: "RESTAURANTE EL MIRADOR SA DE CV" -> "Restaurante El Mirador
// SA de CV" y "JUAN DE LA ROSA" -> "Juan de la Rosa". Los conectores van en minúscula salvo
// al inicio, los artículos solo después de "de"/"del", y las siglas societarias en mayúscula.
export function properCase(value) {
  const palabras = String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase().split(" ");
  return palabras.map((palabra, index) => {
    const base = palabra.replace(/[^a-záéíóúüñ]/gi, "");
    if (SIGLAS.has(base)) return palabra.toUpperCase();
    if (index > 0 && CONECTORES.has(palabra)) return palabra;
    if (index > 0 && ARTICULOS.has(palabra) && ["de", "del"].includes(palabras[index - 1])) return palabra;
    return palabra.replace(/(^|[-/(."'])([a-záéíóúüñ])/g, (_, prefijo, letra) => prefijo + letra.toUpperCase());
  }).join(" ");
}

const FRANQUICIA_POR_TEXTO = new Map([
  ["aguascalientes", "aguascalientes"], ["ags", "aguascalientes"],
  ["cancun", "cancun"], ["cun", "cancun"],
  ["merida", "merida"], ["mid", "merida"],
]);

const ALIAS = Object.freeze({
  franquicia: ["franquicia", "sucursal", "plaza"],
  grupo: ["grupo de facturacion", "grupo facturacion", "grupo"],
  telefono: ["telefono", "telefono whatsapp", "whatsapp", "celular", "tel"],
  correo: ["correo", "correo electronico", "email", "e-mail"],
  recibeCorreo: ["recibe correo", "enviar correo", "autoriza correo"],
});

function indiceColumna(encabezados, alias) {
  return encabezados.findIndex((encabezado) => alias.includes(encabezado));
}

function verdadero(value) {
  return ["si", "sí", "s", "x", "1", "true", "verdadero"].includes(String(value ?? "").trim().toLowerCase());
}

// Archivo del portal (Google Sheet exportada a CSV). Columnas requeridas: Franquicia,
// Grupo De Facturación, Teléfono y Correo; "Recibe Correo" es opcional. Devuelve los
// contactos válidos y la lista de filas omitidas con su motivo.
export function parseContactosCsv(csvText) {
  const filas = parse(csvText, { bom: true, skip_empty_lines: true, relax_column_count: true });
  if (filas.length === 0) throw new Error("El archivo de contactos está vacío");
  const [encabezado, ...datos] = filas;
  const encabezados = encabezado.map((valor) => normalizeBusinessKey(valor));
  const columnas = Object.fromEntries(
    Object.entries(ALIAS).map(([campo, alias]) => [campo, indiceColumna(encabezados, alias)])
  );
  for (const requerido of ["franquicia", "grupo", "telefono", "correo"]) {
    if (columnas[requerido] < 0) {
      throw new Error(`El archivo de contactos no contiene la columna requerida: ${ALIAS[requerido][0]}`);
    }
  }

  const contactos = new Map();
  const omitidas = [];
  datos.forEach((fila, index) => {
    const numeroFila = index + 2;
    const franchiseId = FRANQUICIA_POR_TEXTO.get(normalizeBusinessKey(fila[columnas.franquicia]));
    const grupo = String(fila[columnas.grupo] ?? "").trim();
    if (!franchiseId) return omitidas.push({ fila: numeroFila, motivo: "Franquicia no reconocida" });
    if (!grupo) return omitidas.push({ fila: numeroFila, motivo: "Sin Grupo De Facturación" });
    const telefono = normalizarTelefono(fila[columnas.telefono]);
    const correos = normalizarCorreos(fila[columnas.correo]);
    if (!telefono && correos.length === 0) {
      return omitidas.push({ fila: numeroFila, motivo: "Sin teléfono ni correo válidos" });
    }
    const groupKey = normalizeBusinessKey(grupo);
    contactos.set(`${franchiseId}|${groupKey}`, {
      franchiseId,
      groupKey,
      nombre: grupo,
      telefono,
      correo: correos.join(", ") || null,
      recibeCorreo: columnas.recibeCorreo >= 0 ? verdadero(fila[columnas.recibeCorreo]) : null,
    });
  });
  return { contactos: [...contactos.values()], omitidas };
}
