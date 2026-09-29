// Genera el PDF final de un documento formal. Sustituye a generar_documento_final.py de la
// skill: en vez de .docx + LibreOffice + Python, dibuja el PDF directo y va subiendo el nivel
// de densidad hasta que el documento cabe en una sola página (o se agotan los niveles).
import { NIVELES_DENSIDAD, PAGE_SIZES, TIPOS_DOCUMENTO } from "./brand.js";
import { DocumentLayout } from "./layout.js";
import { TEMPLATES } from "./templates.js";

// Márgenes laterales más angostos en los avisos para ayudar a que quepan en una página.
const MARGENES = {
  aviso_retiro: { side: 50 },
  aviso_deuda: { side: 55 },
  acuerdo_pagos: { side: 55 },
};

function render(tipo, data, density) {
  const scale = NIVELES_DENSIDAD[density].escalaEspaciado;
  const layout = new DocumentLayout({
    // Papel fijo por tipo: aviso de deuda en carta; retiro y acuerdo en oficio.
    pageSize: PAGE_SIZES[TIPOS_DOCUMENTO[tipo].papel],
    margins: { side: Math.max(35, MARGENES[tipo].side * scale), top: 0, bottom: 0 },
    density,
    header: { franquicia: data.franquicia, fecha: data.fecha },
    signatureField: TIPOS_DOCUMENTO[tipo].firma,
  });
  TEMPLATES[tipo](layout, data);
  return layout;
}

export async function generateDocumentPdf(tipo, data) {
  if (!TEMPLATES[tipo]) throw new Error(`Tipo de documento desconocido: ${tipo}`);
  let layout;
  let density = 0;
  for (; density < NIVELES_DENSIDAD.length; density += 1) {
    layout = render(tipo, data, density);
    if (layout.pageCount() <= 1) break;
  }
  density = Math.min(density, NIVELES_DENSIDAD.length - 1);
  const pages = layout.pageCount();
  return { buffer: await layout.toBuffer(), pages, density, fitsOnePage: pages <= 1 };
}
