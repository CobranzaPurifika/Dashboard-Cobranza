import test from "node:test";
import assert from "node:assert/strict";

import { agruparClientes, extraerFacturas } from "../src/campanas/bdd.js";
import { normalizarCorreos, normalizarTelefono, parseContactosCsv, properCase } from "../src/campanas/contactos.js";
import { correoDeItem } from "../src/campanas/reglas.js";
import {
  calendarioFactura,
  construirLote,
  llaveEnvio,
  primerDiaHabilDesde,
  sumarDiasHabiles,
  ventanas,
} from "../src/campanas/reglas.js";

// Fila de BDD con las posiciones de columna que usa la importación oficial.
function filaBdd({ grupo, rfc = "XAXX010101000", folio, fecha, credito = "15", diasBdd = "0", saldo, estatus = "Facturada", ejecutivo = "" }) {
  const row = Array(30).fill("");
  row[0] = grupo; row[1] = grupo; row[2] = rfc; row[5] = folio; row[8] = fecha;
  row[10] = credito; row[11] = diasBdd; row[21] = saldo; row[23] = estatus; row[29] = ejecutivo;
  return { payload: row };
}

function clientesDe(filas, franchiseId = "aguascalientes") {
  return agruparClientes(extraerFacturas(franchiseId, filas));
}

test("calcula el vencimiento con fecha de facturación + días de crédito, no con los días de la BDD", () => {
  const [factura] = extraerFacturas("aguascalientes", [
    filaBdd({ grupo: "Juan Pérez", folio: "AGS2-1", fecha: "01/09/2026", credito: "15", diasBdd: "0", saldo: "500", estatus: "Pago parcial" }),
  ]);
  assert.deepEqual(calendarioFactura(factura, "2026-10-01"), { vencimientoISO: "2026-09-16", diasAtraso: 15, diasParaVencer: -15 });
});

test("sin días de crédito usa los días de la BDD y no hay vencimiento", () => {
  const [factura] = extraerFacturas("aguascalientes", [
    filaBdd({ grupo: "Juan Pérez", folio: "AGS2-1", fecha: "01/09/2026", credito: "", diasBdd: "12", saldo: "500" }),
  ]);
  assert.deepEqual(calendarioFactura(factura, "2026-10-01"), { vencimientoISO: null, diasAtraso: 12, diasParaVencer: null });
});

test("omite filas que no son Facturada / Pago parcial o con saldo cero", () => {
  const facturas = extraerFacturas("aguascalientes", [
    filaBdd({ grupo: "A", folio: "AGS2-1", fecha: "01/09/2026", saldo: "100", estatus: "Cancelada" }),
    filaBdd({ grupo: "A", folio: "AGS2-2", fecha: "01/09/2026", saldo: "0" }),
    filaBdd({ grupo: "A", folio: "AGS2-3", fecha: "01/09/2026", saldo: "100" }),
  ]);
  assert.deepEqual(facturas.map((factura) => factura.folio), ["AGS2-3"]);
});

test("ventanas del correctivo: día 7 y 15, recorridas al siguiente día hábil", () => {
  // Noviembre 2026: el 7 es sábado y el 15 domingo.
  assert.equal(primerDiaHabilDesde("2026-11-07"), "2026-11-09");
  assert.equal(ventanas("2026-11-06").correctivo, null);
  assert.equal(ventanas("2026-11-06").proximoCorrectivoISO, "2026-11-09");
  assert.equal(ventanas("2026-11-08").correctivo, null);
  assert.equal(ventanas("2026-11-09").correctivo.periodo, "2026-11-R1");
  assert.equal(ventanas("2026-11-15").correctivo.periodo, "2026-11-R1");
  assert.equal(ventanas("2026-11-16").correctivo.periodo, "2026-11-R2");
  assert.equal(ventanas("2026-11-30").correctivo.periodo, "2026-11-R2");
  // Octubre 2026: el 7 es miércoles.
  assert.equal(ventanas("2026-10-07").correctivo.periodo, "2026-10-R1");
});

test("suma días hábiles saltando fines de semana", () => {
  assert.equal(sumarDiasHabiles("2026-10-01", 5), "2026-10-08");
});

test("preventivo: al corriente con vencimiento dentro de 5 días, un recordatorio por factura", () => {
  const clientes = clientesDe([
    // Vence el 2026-10-06: entra (faltan 5 días).
    filaBdd({ grupo: "María López", folio: "AGS2-10", fecha: "21/09/2026", credito: "15", saldo: "850" }),
    // Vence el 2026-10-10: todavía no (faltan 9 días).
    filaBdd({ grupo: "María López", folio: "AGS2-11", fecha: "25/09/2026", credito: "15", saldo: "850" }),
  ]);
  const contactos = new Map([["maria lopez", { telefono: "524491234567", correo: null, recibe_correo: false }]]);
  const lote = construirLote({ hoyISO: "2026-10-01", franchiseId: "aguascalientes", clientes, contactos });
  assert.equal(lote.pendientes.length, 1);
  const [item] = lote.pendientes;
  assert.equal(item.regla, "preventivo");
  assert.deepEqual(item.periodos, ["AGS2-10"]);
  assert.equal(item.fechaLimiteISO, "2026-10-06");
  assert.equal(item.canal, "whatsapp");
  assert.equal(item.nombre, "María López");
  assert.match(item.whatsappTexto, /AGS2-10/);
  assert.match(item.whatsappTexto, /6 de octubre de 2026/);
  assert.match(item.whatsappUrl, /^https:\/\/wa\.me\/524491234567\?text=/);
});

test("preventivo ya enviado para esa factura no vuelve a salir", () => {
  const clientes = clientesDe([
    filaBdd({ grupo: "María López", folio: "AGS2-10", fecha: "21/09/2026", credito: "15", saldo: "850" }),
  ]);
  const enviados = new Set([llaveEnvio("maria lopez", "preventivo", "AGS2-10")]);
  const lote = construirLote({ hoyISO: "2026-10-03", franchiseId: "aguascalientes", clientes, enviados });
  assert.equal(lote.pendientes.length, 0);
  assert.equal(lote.resumen.yaEnviados, 1);
});

test("correctivo 1-30: solo dentro de su ventana y una vez por recordatorio del mes", () => {
  const filas = [
    filaBdd({ grupo: "Taller Ruiz", folio: "AGS2-20", fecha: "01/09/2026", credito: "15", saldo: "1200" }),
  ];
  const fuera = construirLote({ hoyISO: "2026-10-05", franchiseId: "aguascalientes", clientes: clientesDe(filas) });
  assert.equal(fuera.pendientes.length, 0);

  const dentro = construirLote({ hoyISO: "2026-10-07", franchiseId: "aguascalientes", clientes: clientesDe(filas) });
  assert.equal(dentro.pendientes.length, 1);
  assert.equal(dentro.pendientes[0].regla, "correctivo");
  assert.deepEqual(dentro.pendientes[0].periodos, ["2026-10-R1"]);
  assert.equal(dentro.pendientes[0].fechaLimiteISO, "2026-10-14");
  assert.equal(dentro.pendientes[0].tramo, "warning");

  const enviados = new Set([llaveEnvio("taller ruiz", "correctivo", "2026-10-R1")]);
  const repetido = construirLote({ hoyISO: "2026-10-09", franchiseId: "aguascalientes", clientes: clientesDe(filas), enviados });
  assert.equal(repetido.pendientes.length, 0);
  const segundo = construirLote({ hoyISO: "2026-10-15", franchiseId: "aguascalientes", clientes: clientesDe(filas), enviados });
  assert.deepEqual(segundo.pendientes[0].periodos, ["2026-10-R2"]);
});

test("31 días o más pasa a escalamiento, sin mensaje masivo", () => {
  const clientes = clientesDe([
    filaBdd({ grupo: "Hotel Sol", folio: "AGS2-30", fecha: "01/08/2026", credito: "15", saldo: "5000" }),
    filaBdd({ grupo: "Hotel Sol", folio: "AGS2-31", fecha: "28/09/2026", credito: "15", saldo: "900" }),
  ]);
  const lote = construirLote({ hoyISO: "2026-10-07", franchiseId: "aguascalientes", clientes });
  assert.equal(lote.pendientes.length, 0);
  assert.equal(lote.escalamiento.length, 1);
  assert.equal(lote.escalamiento[0].tramo, "serious");
  assert.equal(lote.escalamiento[0].monto, 5900);
});

test("excluye lista negra, promesa vigente y facturas con pago reciente", () => {
  const filas = [
    filaBdd({ grupo: "Cliente Uno", folio: "AGS2-40", fecha: "01/09/2026", saldo: "100" }),
    filaBdd({ grupo: "Cliente Dos", folio: "AGS2-41", fecha: "01/09/2026", saldo: "100" }),
    filaBdd({ grupo: "Cliente Tres", folio: "AGS2-42", fecha: "01/09/2026", saldo: "100" }),
  ];
  const lote = construirLote({
    hoyISO: "2026-10-07",
    franchiseId: "aguascalientes",
    clientes: clientesDe(filas),
    estadoApp: new Map([
      ["cliente uno", { id: "ags-cliente-uno", enListaNegra: true }],
      ["cliente dos", { id: "ags-cliente-dos", promesaVigente: true }],
    ]),
    foliosPagados: new Set(["ags2-42"]),
  });
  assert.equal(lote.pendientes.length, 0);
  assert.deepEqual(lote.excluidos.map((item) => item.motivo).sort(), [
    "Cliente en lista negra",
    "Pago registrado recientemente",
    "Promesa de pago vigente",
  ]);
});

test("comercial: correo solo si está autorizado; si no, queda sin canal con motivo", () => {
  const filas = [filaBdd({ grupo: "RESTAURANTE EL MIRADOR SA DE CV", rfc: "REM010101AB1", folio: "AGS2-50", fecha: "21/09/2026", saldo: "4850" })];
  const sinAutorizar = construirLote({
    hoyISO: "2026-10-01",
    franchiseId: "aguascalientes",
    clientes: clientesDe(filas),
    contactos: new Map([["restaurante el mirador sa de cv", { correo: "pagos@mirador.mx", recibe_correo: false }]]),
  });
  assert.equal(sinAutorizar.pendientes[0].canal, null);
  assert.equal(sinAutorizar.pendientes[0].motivoSinCanal, "Comercial sin autorización de correo");

  const autorizado = construirLote({
    hoyISO: "2026-10-01",
    franchiseId: "aguascalientes",
    clientes: clientesDe(filas),
    contactos: new Map([["restaurante el mirador sa de cv", { correo: "Pagos@Mirador.mx; admin@mirador.mx", recibe_correo: true }]]),
  });
  const [item] = autorizado.pendientes;
  assert.equal(item.canal, "correo");
  assert.equal(item.destino, "pagos@mirador.mx, admin@mirador.mx");
  assert.equal(item.nombre, "Restaurante El Mirador SA de CV");
  const correo = correoDeItem(item);
  assert.equal(correo.asunto, "Recordatorio de pago — Factura AGS2-50 Purifika Aguascalientes");
  assert.match(correo.texto, /CLABE: 014010655092237775/);
  assert.match(correo.texto, /Menos plástico, más futuro\.$/);
  assert.match(correo.html, /Monto pendiente: \$4,850\.00 MXN/);
});

test("usa los datos bancarios de la franquicia correcta", () => {
  const filas = [filaBdd({ grupo: "Ana Ruiz", folio: "MID-1", fecha: "01/09/2026", saldo: "300" })];
  const lote = construirLote({
    hoyISO: "2026-10-07",
    franchiseId: "merida",
    clientes: clientesDe(filas, "merida"),
    contactos: new Map([["ana ruiz", { telefono: "529991234567" }]]),
  });
  assert.match(lote.pendientes[0].whatsappTexto, /014010655094078589/);
  assert.match(lote.pendientes[0].whatsappTexto, /Águila Maya/);
});

test("normaliza teléfonos de México para wa.me", () => {
  assert.equal(normalizarTelefono("449 123 4567"), "524491234567");
  assert.equal(normalizarTelefono("+52 1 449 123 4567"), "524491234567");
  assert.equal(normalizarTelefono("(449) 12-345 / 449 765 4321"), "524497654321");
  assert.equal(normalizarTelefono("4491234567 / 4497654321"), "524491234567");
  assert.equal(normalizarTelefono("123"), null);
});

test("normaliza correos y Proper Case", () => {
  assert.deepEqual(normalizarCorreos("A@B.mx; a@b.mx, malo@, c@d.com"), ["a@b.mx", "c@d.com"]);
  assert.equal(properCase("JUAN DE LA ROSA"), "Juan de la Rosa");
  assert.equal(properCase("consultorio dental sc"), "Consultorio Dental SC");
});

test("lee el archivo del portal y reporta filas omitidas", () => {
  const csv = [
    "Franquicia,Grupo De Facturación,Teléfono,Correo,Recibe Correo",
    "AGS,Juan Pérez,449 123 4567,,",
    "Cancún,HOTEL SOL SA DE CV,,pagos@hotelsol.mx,Sí",
    "Monterrey,Otro,4491234567,,",
    "MID,Sin Datos,,,",
  ].join("\n");
  const { contactos, omitidas } = parseContactosCsv(csv);
  assert.equal(contactos.length, 2);
  assert.deepEqual(contactos[0], { franchiseId: "aguascalientes", groupKey: "juan perez", nombre: "Juan Pérez", telefono: "524491234567", correo: null, recibeCorreo: false });
  assert.equal(contactos[1].recibeCorreo, true);
  assert.deepEqual(omitidas.map((fila) => fila.motivo), ["Franquicia no reconocida", "Sin teléfono ni correo válidos"]);
});

test("el archivo del portal exige las columnas mínimas", () => {
  assert.throws(() => parseContactosCsv("Franquicia,Grupo De Facturación,Correo\nAGS,X,a@b.mx"), /teléfono|telefono/i);
});
