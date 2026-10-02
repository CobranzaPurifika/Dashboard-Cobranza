// Normalización de datos de contacto y lectura del archivo de contactos (.csv o .xlsx).
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { normalizeBusinessKey } from "../imports/consolidation.js";

// Teléfono en formato internacional (código de país + número, solo dígitos y sin "+"), que es
// lo que usa wa.me. Acepta:
//   - Con código de país: "+52 449 123 4567", "+1 (415) 555-2671", "0034 612 345 678" o los
//     mismos dígitos sin "+" ("524491234567", "14155552671").
//   - 10 dígitos sin código de país: se asume México (+52).
//   - El formato antiguo de celulares de México (+52 1 + 10 dígitos).
// Valida longitud y código de país con libphonenumber. Si la celda trae varios números
// separados por "/", "," o ";", toma el primero válido. Devuelve null si no hay uno válido.
export function normalizarTelefono(value) {
  const candidatos = String(value ?? "").split(/[\/,;|]|\s{2,}|\by\b/i);
  for (const candidato of candidatos) {
    const normalizado = normalizarUnTelefono(candidato);
    if (normalizado) return normalizado;
  }
  return null;
}

function normalizarUnTelefono(texto) {
  const limpio = String(texto ?? "").trim();
  let digitos = limpio.replace(/\D/g, "");
  if (digitos.length < 8) return null;
  const conPrefijo = limpio.startsWith("+") || limpio.startsWith("00");
  if (limpio.startsWith("00")) digitos = digitos.slice(2);
  if (!conPrefijo && digitos.length === 10) digitos = `52${digitos}`;
  if (digitos.length === 13 && digitos.startsWith("521")) digitos = `52${digitos.slice(3)}`;
  if (digitos.length > 15) return null;
  const numero = parsePhoneNumberFromString(`+${digitos}`);
  return numero?.isPossible() ? numero.number.slice(1) : null;
}

// "+52 449 123 4567", "+1 415 555 2671" para mostrar en pantalla y en la plantilla.
export function telefonoLegible(normalizado) {
  if (!normalizado) return "";
  return parsePhoneNumberFromString(`+${normalizado}`)?.formatInternational() ?? `+${normalizado}`;
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

// Encabezado oficial de cada columna (lo que se muestra en la pantalla y en la plantilla) y
// los alias aceptados. Se comparan sin acentos ni mayúsculas, en cualquier orden.
export const COLUMNAS_CONTACTOS = Object.freeze([
  { campo: "franquicia", encabezado: "Franquicia", requerida: true, alias: ["franquicia", "sucursal", "plaza"] },
  { campo: "grupo", encabezado: "Grupo De Facturación", requerida: true, alias: ["grupo de facturacion", "grupo facturacion", "grupo"] },
  { campo: "telefono", encabezado: "Teléfono", requerida: true, alias: ["telefono", "telefono whatsapp", "whatsapp", "celular", "tel"] },
  { campo: "correo", encabezado: "Correo", requerida: true, alias: ["correo", "correo electronico", "email", "e-mail"] },
  { campo: "recibeCorreo", encabezado: "Recibe Correo", requerida: false, alias: ["recibe correo", "enviar correo", "autoriza correo"] },
]);

function verdadero(value) {
  return ["si", "sí", "s", "x", "1", "true", "verdadero"].includes(String(value ?? "").trim().toLowerCase());
}

function errorDeArchivo(mensaje) {
  const error = new Error(mensaje);
  error.statusCode = 400;
  return error;
}

// filas: arreglo de arreglos de texto; la primera fila son los encabezados. Devuelve los
// contactos válidos y la lista de filas omitidas con su motivo. Las filas vacías se ignoran.
export function parseContactosFilas(filas) {
  const [encabezado, ...datos] = filas;
  if (!encabezado || !datos.length) throw errorDeArchivo("El archivo de contactos está vacío o solo tiene encabezados");
  const encabezados = encabezado.map((valor) => normalizeBusinessKey(valor));
  const columnas = Object.fromEntries(COLUMNAS_CONTACTOS.map(({ campo, alias }) =>
    [campo, encabezados.findIndex((encabezadoActual) => alias.includes(encabezadoActual))]));
  const faltantes = COLUMNAS_CONTACTOS.filter(({ campo, requerida }) => requerida && columnas[campo] < 0);
  if (faltantes.length) {
    throw errorDeArchivo(`Faltan columnas en la primera fila: ${faltantes.map(({ encabezado: nombre }) => nombre).join(", ")}`);
  }

  const contactos = new Map();
  const omitidas = [];
  const advertencias = [];
  let sinDatos = 0;
  datos.forEach((fila, index) => {
    const numeroFila = index + 2;
    if (fila.every((valor) => !String(valor ?? "").trim())) return;
    const franchiseId = FRANQUICIA_POR_TEXTO.get(normalizeBusinessKey(fila[columnas.franquicia]));
    const grupo = String(fila[columnas.grupo] ?? "").trim().replace(/\s+/g, " ");
    const telefonoTexto = String(fila[columnas.telefono] ?? "").trim();
    const correoTexto = String(fila[columnas.correo] ?? "").trim();
    // Fila de la plantilla todavía sin llenar: se ignora sin reportarla como error.
    if (!telefonoTexto && !correoTexto) {
      sinDatos += 1;
      return;
    }
    if (!franchiseId) return omitidas.push({ fila: numeroFila, motivo: "Franquicia no reconocida (usa AGS, CUN o MID)", nombre: grupo || null });
    if (!grupo) return omitidas.push({ fila: numeroFila, motivo: "Sin Grupo De Facturación" });
    const telefono = telefonoTexto ? normalizarTelefono(telefonoTexto) : null;
    const correos = normalizarCorreos(correoTexto);
    const problemas = [];
    if (telefonoTexto && !telefono) problemas.push(`teléfono inválido "${telefonoTexto}"`);
    if (correoTexto && !correos.length) problemas.push(`correo inválido "${correoTexto}"`);
    if (!telefono && correos.length === 0) {
      const motivo = problemas.join(" y ");
      return omitidas.push({ fila: numeroFila, motivo: motivo[0].toUpperCase() + motivo.slice(1), nombre: grupo });
    }
    if (problemas.length) {
      const motivo = `${problemas.join(" y ")}; se guardó el resto`;
      advertencias.push({ fila: numeroFila, motivo: motivo[0].toUpperCase() + motivo.slice(1), nombre: grupo });
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
  return { contactos: [...contactos.values()], omitidas, advertencias, sinDatos };
}

// CSV con coma o punto y coma (Excel en español guarda con ";").
export function parseContactosCsv(csvText) {
  const texto = String(csvText ?? "").replace(/^﻿/, "");
  const primeraLinea = texto.split(/\r?\n/, 1)[0] ?? "";
  const cuenta = (caracter) => primeraLinea.split(caracter).length - 1;
  const delimiter = [";", "\t", ","].reduce((mejor, caracter) => (cuenta(caracter) > cuenta(mejor) ? caracter : mejor), ",");
  let filas;
  try {
    filas = parse(texto, { delimiter, skip_empty_lines: true, relax_column_count: true, relax_quotes: true });
  } catch (error) {
    throw errorDeArchivo(`No se pudo leer el CSV: ${error.message}`);
  }
  return parseContactosFilas(filas);
}

function textoCelda(valor) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") return Number.isInteger(valor) ? String(valor) : String(valor);
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === "object") {
    if (Array.isArray(valor.richText)) return valor.richText.map((parte) => parte.text).join("");
    if ("text" in valor) return textoCelda(valor.text);
    if ("result" in valor) return textoCelda(valor.result);
    if ("error" in valor) return "";
  }
  return String(valor);
}

// Primera hoja del libro de Excel (.xlsx).
export async function parseContactosXlsx(buffer) {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer);
  } catch {
    throw errorDeArchivo("No se pudo abrir el archivo de Excel; verifica que sea .xlsx");
  }
  const hoja = libro.worksheets[0];
  if (!hoja) throw errorDeArchivo("El archivo de Excel no tiene hojas");
  const filas = [];
  hoja.eachRow({ includeEmpty: false }, (fila) => {
    const valores = [];
    for (let columna = 1; columna <= fila.cellCount; columna += 1) valores.push(textoCelda(fila.getCell(columna).value).trim());
    filas.push(valores);
  });
  return parseContactosFilas(filas);
}

function decodificarTexto(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // CSV guardado por Excel en Windows (ANSI): conserva acentos y ñ.
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

// Archivo subido desde la pantalla: .xlsx o .csv (se detecta por contenido y extensión).
export async function leerArchivoContactos(buffer, nombreArchivo = "") {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw errorDeArchivo("Selecciona un archivo");
  const extension = String(nombreArchivo).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return parseContactosXlsx(buffer);
  if (extension === "xls" || (buffer[0] === 0xd0 && buffer[1] === 0xcf)) {
    throw errorDeArchivo("El formato .xls (Excel 97-2003) no es compatible: guárdalo como .xlsx o .csv");
  }
  if (extension && !["csv", "txt"].includes(extension)) throw errorDeArchivo("Sube un archivo .csv o .xlsx");
  return parseContactosCsv(decodificarTexto(buffer));
}
