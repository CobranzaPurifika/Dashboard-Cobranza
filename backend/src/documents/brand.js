// Constantes de marca de los documentos formales de cobranza (aviso de deuda, aviso de
// retiro y acuerdo/propuesta de pagos). Portado de la skill "documentos-purifika": los
// colores se muestrearon del logo oficial y los datos de franquicia son los mismos que usa
// la skill "cobranza-purifika" -- nunca mezclar cuenta/razón social entre franquicias.
import { fileURLToPath } from "node:url";

const assetsDirectory = fileURLToPath(new URL("./assets/", import.meta.url));

export const ASSETS = Object.freeze({
  logo: `${assetsDirectory}logo-purifika.png`,
  footer: `${assetsDirectory}footer-certs-slogan.png`,
  // Firma de Jonathan De Santiago; si el archivo no existe, el bloque de firma de Purifika
  // cae de vuelta a una línea en blanco.
  firma: `${assetsDirectory}firma-jonathan.png`,
  // Carlito es métricamente compatible con Calibri (la fuente de las plantillas originales).
  fonts: {
    regular: `${assetsDirectory}fonts/Carlito-Regular.woff`,
    bold: `${assetsDirectory}fonts/Carlito-Bold.woff`,
    italic: `${assetsDirectory}fonts/Carlito-Italic.woff`,
  },
});

export const COLORS = Object.freeze({
  turquesa: "#25CAD2",
  grisOscuro: "#55565A",
  grisTexto: "#3A3A3C",
  grisClaro: "#8A8A8E",
  blanco: "#FFFFFF",
  rojoAlerta: "#C0392B",
  fondoDestacado: "#EAFAFB",
  filaAlterna: "#F7F7F8",
  bordeTabla: "#D8D8DA",
});

export const FRANQUICIAS = Object.freeze({
  aguascalientes: {
    nombreComercial: "Purifika Aguascalientes",
    razonSocial: "Stream Ingeniería Sustentable",
    ciudadEstado: "Aguascalientes, Ags.",
    banco: "Banco Santander México, S.A.",
    cuenta: "65509223777",
    clabe: "014010655092237775",
    prefijoFactura: "AGS2",
  },
  cancun: {
    nombreComercial: "Purifika Cancún",
    razonSocial: "Purestream",
    ciudadEstado: "Cancún, Q.R.",
    banco: "Banco Santander México, S.A.",
    cuenta: "65508109387",
    clabe: "014691655081093873",
    prefijoFactura: "CUN",
  },
  merida: {
    nombreComercial: "Purifika Mérida",
    razonSocial: "Águila Maya",
    ciudadEstado: "Mérida, Yuc.",
    banco: "Banco Santander México, S.A.",
    cuenta: "65509407858",
    clabe: "014010655094078589",
    prefijoFactura: "MID",
  },
});

export const CONTACTO_DEFAULT = Object.freeze({
  nombre: "Jonathan De Santiago",
  puesto: "Cobranza",
  correo: "cobranza.ags@purifika.com",
});

// Contacto adicional fijo del aviso de deuda (sin puesto) -- decisión explícita de negocio.
export const CONTACTO_ATENCION_CLIENTES = Object.freeze({
  nombre: "Vane Ortega",
  correo: "atencionaclientes.ags@purifika.com",
});

// Tamaños en puntos PDF (72 por pulgada). Oficio México = 216 x 340 mm.
export const PAGE_SIZES = Object.freeze({
  oficio: [612.28, 963.78],
  carta: [612, 792],
});

export const TIPOS_DOCUMENTO = Object.freeze({
  aviso_deuda: { label: "AvisoDeuda", papel: "carta", firma: false },
  aviso_retiro: { label: "AvisoRetiro", papel: "oficio", firma: true },
  acuerdo_pagos: { label: "AcuerdoPagos", papel: "oficio", firma: true },
});

// Todos los documentos deben caber en una sola página: cada nivel compacta el espaciado y,
// en los niveles altos, la letra (con piso legible). El generador sube de nivel hasta que el
// resultado cabe o se agotan los niveles.
export const NIVELES_DENSIDAD = Object.freeze([
  { escalaEspaciado: 1, escalaLinea: 1, deltaFuente: 0 },
  { escalaEspaciado: 0.8, escalaLinea: 0.93, deltaFuente: 0 },
  { escalaEspaciado: 0.62, escalaLinea: 0.86, deltaFuente: -1 },
  { escalaEspaciado: 0.48, escalaLinea: 0.8, deltaFuente: -2 },
]);

// Detecta la franquicia por el prefijo de folio ("AGS2 2758" -> aguascalientes). Devuelve
// null si no hay folios reconocibles o si mezclan franquicias (caso ambiguo).
export function franquiciaPorFacturas(folios) {
  const claves = Object.keys(FRANQUICIAS);
  const detectadas = (folios ?? [])
    .map((folio) => String(folio ?? "").trim().match(/^[A-Za-z]+\d*/)?.[0]?.toUpperCase())
    .filter(Boolean)
    .map((prefijo) => claves.find((clave) => FRANQUICIAS[clave].prefijoFactura === prefijo))
    .filter(Boolean);
  const unicas = [...new Set(detectadas)];
  return unicas.length === 1 ? unicas[0] : null;
}
