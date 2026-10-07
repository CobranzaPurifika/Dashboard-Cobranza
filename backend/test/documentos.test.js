import test from "node:test";
import assert from "node:assert/strict";

import { buildDocumentData, documentosPermitidos, invoiceSchedule } from "../src/domain/documentos.js";
import { generateDocumentPdf } from "../src/documents/generate.js";
import { fechaConDia, fechaLarga, listaFolios, slugCliente } from "../src/documents/format.js";

const cliente = { id: "ags-quevedo", name: "JORGE QUEVEDO", franchise_id: "aguascalientes" };
const invoices = [
  { id: 1, folio: "AGS2 2758", monto: 240, dias_vencida: 414, fecha_facturacion_iso: "2025-06-01", dias_credito: 30 },
  { id: 2, folio: "AGS2 2801", monto: 5460, dias_vencida: 0, fecha_facturacion_iso: "2025-07-01", dias_credito: 30 },
];
const base = { facturaIds: [2, 1], fechaISO: "2026-08-18", destinatario: { nombre: "Sr. Jorge Quevedo" } };

test("formatea fechas y listas de folios en español", () => {
  assert.equal(fechaLarga("2026-08-18"), "18 de agosto de 2026");
  assert.equal(fechaConDia("2026-07-28"), "Martes 28 de julio de 2026");
  assert.equal(listaFolios(["A", "B", "C"]), "A, B y C");
  assert.equal(slugCliente("MEIKERGRUP — Sr. Rodolfo Reynoso"), "Meikergrup");
  assert.equal(slugCliente("Grupo Ferretero del Bajío"), "GrupoFerreteroDelBajio");
});

test("el aviso de deuda toma montos y folios de la base, no del formulario", () => {
  const { data, warnings, fileName } = buildDocumentData("aviso_deuda", cliente, invoices, { ...base, montoTotal: "$1.00" });
  assert.equal(data.montoTotal, "$5,700.00 MXN");
  assert.equal(data.diasMora, 413);
  assert.deepEqual(data.facturas[0], { folio: "AGS2 2758", fechaFactura: "01/06/2025", fechaVencimiento: "01/07/2025", diasAtraso: 413, importe: "$240.00" });
  // Pago parcial: la BDD trae 0 días, pero con crédito de 30 días sí está vencida.
  assert.equal(data.facturas[1].diasAtraso, 383);
  assert.deepEqual(data.facturas.map((factura) => factura.folio), ["AGS2 2758", "AGS2 2801"]);
  assert.equal(data.fecha, "18 de agosto de 2026");
  assert.equal(data.franquicia.razonSocial, "Stream Ingeniería Sustentable");
  assert.equal(fileName, "AGS2_AvisoDeuda_SrJorgeQuevedo_2026-08-18.pdf");
  assert.deepEqual(warnings, []);
});

test("vencimiento = fecha de factura + días de crédito, atraso a la fecha del documento", () => {
  assert.deepEqual(invoiceSchedule({ fecha_facturacion_iso: "2026-06-01", dias_credito: 30, dias_vencida: 0 }, "2026-09-29"), { vencimientoISO: "2026-07-01", diasAtraso: 90 });
  assert.deepEqual(invoiceSchedule({ fecha_facturacion_iso: "2026-09-01", dias_credito: 60, dias_vencida: 0 }, "2026-09-29"), { vencimientoISO: "2026-10-31", diasAtraso: 0 });
  assert.deepEqual(invoiceSchedule({ fecha_facturacion_iso: "2026-09-01", dias_credito: 0, dias_vencida: 0 }, "2026-09-29"), { vencimientoISO: "2026-09-01", diasAtraso: 28 });
  // Sin días de crédito (histórico): se conservan los días de la BDD y no se inventa vencimiento.
  assert.deepEqual(invoiceSchedule({ fecha_facturacion_iso: "2026-06-01", dias_credito: null, dias_vencida: 12 }, "2026-09-29"), { vencimientoISO: null, diasAtraso: 12 });

  const { data, warnings } = buildDocumentData("aviso_deuda", cliente, [{ ...invoices[0], dias_credito: null }], { ...base, facturaIds: [1] });
  assert.equal(data.facturas[0].fechaVencimiento, "—");
  assert.equal(warnings.length, 1);
});

test("rechaza facturas ajenas al cliente y datos obligatorios faltantes", () => {
  assert.throws(() => buildDocumentData("aviso_deuda", cliente, invoices, { ...base, facturaIds: [99] }), /no pertenece/);
  assert.throws(() => buildDocumentData("aviso_deuda", cliente, invoices, { ...base, facturaIds: [] }), /al menos una factura/);
  assert.throws(() => buildDocumentData("aviso_deuda", cliente, invoices, { ...base, destinatario: { nombre: " " } }), /destinatario/);
  assert.throws(() => buildDocumentData("aviso_deuda", cliente, invoices, { ...base, fechaISO: "2026-02-30" }), /fecha del documento/);
  assert.throws(() => buildDocumentData("otro", cliente, invoices, base), /desconocido/);
});

test("el prefijo de los folios corrige una franquicia mal registrada", () => {
  const { data, warnings, fileName } = buildDocumentData("aviso_deuda", { ...cliente, franchise_id: "merida" }, invoices, base);
  assert.equal(data.franquicia.nombreComercial, "Purifika Aguascalientes");
  assert.equal(warnings.length, 1);
  assert.match(fileName, /^AGS2_/);
});

test("el aviso de retiro nunca inventa una fecha sin definir y no lleva horario", () => {
  const { data } = buildDocumentData("aviso_retiro", cliente, invoices, { ...base, retiro: { equipos: "AGS2-99, AGS2-93" } });
  assert.equal(data.fechaRetiro, "Por definir");
  assert.equal(data.horarioRetiro, undefined);
  assert.deepEqual(data.equipos, ["AGS2-99", "AGS2-93"]);

  const agendado = buildDocumentData("aviso_retiro", cliente, invoices, { ...base, retiro: { fechaISO: "2026-08-12" } }).data;
  assert.equal(agendado.fechaRetiro, "Miércoles 12 de agosto de 2026");
  assert.throws(() => buildDocumentData("aviso_retiro", cliente, invoices, { ...base, retiro: { fechaISO: "2026-13-01" } }), /fecha de retiro/);
});

test("el papel es fijo por tipo aunque el navegador pida otro", async () => {
  const deuda = buildDocumentData("aviso_deuda", cliente, invoices, { ...base, tamanoPapel: "oficio" }).data;
  assert.equal(deuda.tamanoPapel, undefined);
  const pdf = await generateDocumentPdf("aviso_deuda", deuda);
  assert.match(pdf.buffer.toString("latin1"), /\/MediaBox \[0 0 612 792\]/);
});

test("el acuerdo valida parcialidades y avisa si no suman el adeudo", () => {
  const acuerdo = {
    esBorrador: false,
    parcialidades: [
      { fechaISO: "2026-07-28", facturaIds: [1, 2], importe: 3000 },
      { fechaISO: "2026-08-11", facturaIds: [2], importe: 2700 },
    ],
    condiciones: ["Se acepta mobiliario como parte de pago.", " "],
  };
  const { data, warnings } = buildDocumentData("acuerdo_pagos", cliente, invoices, { ...base, acuerdo });
  assert.equal(data.esBorrador, false);
  assert.equal(data.parcialidades[0].facturas, "AGS2 2758 y AGS2 2801");
  assert.equal(data.parcialidades[0].fecha, "Martes 28 de julio de 2026");
  assert.deepEqual(data.condiciones, ["Se acepta mobiliario como parte de pago."]);
  assert.deepEqual(warnings, []);

  const corto = { ...acuerdo, parcialidades: [acuerdo.parcialidades[0]] };
  assert.equal(buildDocumentData("acuerdo_pagos", cliente, invoices, { ...base, acuerdo: corto }).warnings.length, 1);
  assert.throws(() => buildDocumentData("acuerdo_pagos", cliente, invoices, { ...base, acuerdo: { parcialidades: [] } }), /al menos una parcialidad/);
  assert.throws(() => buildDocumentData("acuerdo_pagos", cliente, invoices, {
    ...base, facturaIds: [1], acuerdo: { parcialidades: [{ fechaISO: "2026-07-28", facturaIds: [2], importe: 10 }] },
  }), /no está seleccionada/);
});

test("la bonificación reduce el adeudo del acuerdo y las parcialidades cubren el neto", () => {
  const acuerdo = {
    bonificacion: 700,
    parcialidades: [
      { fechaISO: "2026-07-28", facturaIds: [1, 2], importe: 2500 },
      { fechaISO: "2026-08-11", facturaIds: [2], importe: 2500 },
    ],
  };
  const { data, warnings } = buildDocumentData("acuerdo_pagos", cliente, invoices, { ...base, acuerdo });
  assert.equal(data.montoTotal, "$5,000.00 MXN");
  assert.deepEqual(data.bonificacion, { original: "$5,700.00 MXN", monto: "$700.00 MXN" });
  assert.equal(data.parcialidades[1].facturas, "AGS2 2801");
  assert.deepEqual(warnings, []);
  assert.throws(() => buildDocumentData("acuerdo_pagos", cliente, invoices, { ...base, acuerdo: { ...acuerdo, bonificacion: 5700 } }), /bonificación/);
  assert.throws(() => buildDocumentData("acuerdo_pagos", cliente, invoices, { ...base, acuerdo: { ...acuerdo, bonificacion: -1 } }), /bonificación/);
  assert.equal(buildDocumentData("aviso_deuda", cliente, invoices, { ...base, acuerdo }).data.bonificacion, undefined);
});

test("los tres documentos salen en una sola página y solo retiro/acuerdo llevan campo de firma", async () => {
  const acuerdo = { parcialidades: [{ fechaISO: "2026-07-28", facturaIds: [1, 2], importe: 5700 }] };
  for (const tipo of ["aviso_deuda", "aviso_retiro", "acuerdo_pagos"]) {
    const { data } = buildDocumentData(tipo, cliente, invoices, { ...base, acuerdo });
    const pdf = await generateDocumentPdf(tipo, data);
    assert.equal(pdf.fitsOnePage, true, tipo);
    assert.equal(pdf.buffer.subarray(0, 5).toString(), "%PDF-");
    assert.equal(pdf.buffer.includes("(firma_cliente_p1)"), tipo !== "aviso_deuda", tipo);
  }
});

test("un documento con muchas facturas se compacta antes de pasar a otra página", async () => {
  const many = Array.from({ length: 22 }, (_, index) => ({
    ...invoices[0], id: index + 1, folio: `AGS2 ${3000 + index}`,
  }));
  const { data } = buildDocumentData("aviso_deuda", cliente, many, { ...base, facturaIds: many.map((invoice) => invoice.id) });
  const pdf = await generateDocumentPdf("aviso_deuda", data);
  assert.equal(pdf.fitsOnePage, true);
  assert.ok(pdf.density > 0);
});

test("el gestor solo genera el aviso de deuda; admin y supervisor, los tres", () => {
  assert.deepEqual(documentosPermitidos("gestor"), ["aviso_deuda"]);
  for (const role of ["admin", "supervisor"]) {
    assert.deepEqual(documentosPermitidos(role).sort(), ["acuerdo_pagos", "aviso_deuda", "aviso_retiro"]);
  }
});
