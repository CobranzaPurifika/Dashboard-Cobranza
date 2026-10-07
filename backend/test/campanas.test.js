import test from "node:test";
import assert from "node:assert/strict";

import { agruparClientes, extraerFacturas } from "../src/campanas/bdd.js";
import ExcelJS from "exceljs";
import { leerArchivoContactos, normalizarCorreos, normalizarTelefono, parseContactosCsv, properCase, telefonoLegible } from "../src/campanas/contactos.js";
import { correoDeItem } from "../src/campanas/reglas.js";
import {
  calendarioCorrectivo,
  calendarioFactura,
  construirLote,
  llaveEnvio,
  primerDiaHabilDesde,
  sumarDiasHabiles,
  ventanas,
} from "../src/campanas/reglas.js";
import { puedeUsarCampanas } from "../src/campanas/permisos.js";
import { PLANTILLAS, correoHtmlDesdeTexto, plantillasVigentes, validarPlantilla } from "../src/campanas/plantillas.js";

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

test("correctivo semanal: días 7, 15, 21 y fin de mes, recorridos al siguiente día hábil", () => {
  // Noviembre 2026: el 7 es sábado, el 15 domingo, el 21 sábado y el 30 lunes.
  assert.equal(primerDiaHabilDesde("2026-11-07"), "2026-11-09");
  assert.deepEqual(calendarioCorrectivo("2026-11").map((ventana) => [ventana.periodo, ventana.desdeISO]), [
    ["2026-11-R1", "2026-11-09"],
    ["2026-11-R2", "2026-11-16"],
    ["2026-11-R3", "2026-11-23"],
    ["2026-11-R4", "2026-11-30"],
  ]);
  assert.equal(ventanas("2026-11-06").correctivo, null);
  assert.equal(ventanas("2026-11-06").proximoCorrectivoISO, "2026-11-09");
  assert.equal(ventanas("2026-11-08").correctivo, null);
  assert.equal(ventanas("2026-11-09").correctivo.periodo, "2026-11-R1");
  assert.equal(ventanas("2026-11-15").correctivo.periodo, "2026-11-R1");
  assert.equal(ventanas("2026-11-16").correctivo.periodo, "2026-11-R2");
  assert.equal(ventanas("2026-11-22").correctivo.periodo, "2026-11-R2");
  assert.equal(ventanas("2026-11-23").correctivo.periodo, "2026-11-R3");
  assert.equal(ventanas("2026-11-29").correctivo.periodo, "2026-11-R3");
  assert.equal(ventanas("2026-11-30").correctivo.periodo, "2026-11-R4");
  assert.equal(ventanas("2026-11-30").proximoCorrectivoISO, "2026-12-07");
  // Octubre 2026: el 7 es miércoles.
  assert.equal(ventanas("2026-10-07").correctivo.periodo, "2026-10-R1");
  // Del día 1 al 6 no hay correctivo: el de fin de mes no se arrastra al mes siguiente.
  assert.equal(ventanas("2026-12-01").correctivo, null);
});

test("fin de mes en fin de semana se adelanta al viernes, sin salirse del mes", () => {
  // Octubre 2026: el 31 es sábado; el 21, miércoles.
  assert.deepEqual(calendarioCorrectivo("2026-10").map((ventana) => ventana.desdeISO), ["2026-10-07", "2026-10-15", "2026-10-21", "2026-10-30"]);
  assert.equal(calendarioCorrectivo("2026-10").at(-1).finDeMes, true);
  assert.equal(ventanas("2026-10-31").correctivo.periodo, "2026-10-R4");
  // Febrero 2027: el 21 es domingo (pasa al 22) y el 28, domingo (se adelanta al 26).
  assert.deepEqual(calendarioCorrectivo("2027-02").map((ventana) => ventana.desdeISO), ["2027-02-08", "2027-02-15", "2027-02-22", "2027-02-26"]);
  // Abril 2027: fin de mes es el 30 (viernes).
  assert.equal(calendarioCorrectivo("2027-04").at(-1).desdeISO, "2027-04-30");
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
  // Para el 21 la factura anterior ya pasó a escalamiento: se usa una más reciente.
  const recientes = [filaBdd({ grupo: "Taller Ruiz", folio: "AGS2-21", fecha: "15/09/2026", credito: "15", saldo: "850" })];
  const tercero = construirLote({ hoyISO: "2026-10-21", franchiseId: "aguascalientes", clientes: clientesDe(recientes), enviados });
  assert.deepEqual(tercero.pendientes[0].periodos, ["2026-10-R3"]);
});

test("correctivo personalizado: nombre, franquicia, detalle de facturas y datos de transferencia", () => {
  const filas = [
    filaBdd({ grupo: "TALLER RUIZ", folio: "AGS2-20", fecha: "01/09/2026", credito: "15", saldo: "1200" }),
    filaBdd({ grupo: "TALLER RUIZ", folio: "AGS2-21", fecha: "15/09/2026", credito: "15", saldo: "850.5" }),
  ];
  const lote = construirLote({
    hoyISO: "2026-10-07",
    franchiseId: "aguascalientes",
    clientes: clientesDe(filas),
    contactos: new Map([["taller ruiz", { telefono: "524491234567" }]]),
  });
  const texto = lote.pendientes[0].whatsappTexto;
  assert.match(texto, /^Hola, Taller Ruiz\. Te saludamos de Purifika Aguascalientes\./);
  assert.match(texto, /saldo pendiente de \$2,050\.50 MXN/);
  assert.match(texto, /• AGS2-20 — \$1,200\.00 MXN — venció el 16 de septiembre de 2026/);
  assert.match(texto, /• AGS2-21 — \$850\.50 MXN — venció el 30 de septiembre de 2026/);
  assert.match(texto, /a más tardar el 14 de octubre de 2026/);
  assert.match(texto, /Beneficiario: Stream Ingeniería Sustentable\nBanco: Banco Santander México, S\.A\.\nCuenta: 65509223777\nCLABE: 014010655092237775/);
  assert.doesNotMatch(texto, /\{[a-z_]+\}/);
});

test("usa la plantilla editada por el administrador", () => {
  const filas = [filaBdd({ grupo: "Ana Ruiz", folio: "MID-1", fecha: "01/09/2026", saldo: "300" })];
  const plantillas = plantillasVigentes({ correctivo_r1_whatsapp: "Hola {nombre}, debes {monto} ({folios}) a {franquicia}. CLABE {clabe}" });
  const lote = construirLote({
    hoyISO: "2026-10-07",
    franchiseId: "merida",
    clientes: clientesDe(filas, "merida"),
    contactos: new Map([["ana ruiz", { telefono: "529991234567" }]]),
    plantillas,
  });
  assert.equal(lote.pendientes[0].whatsappTexto, "Hola Ana Ruiz, debes $300.00 MXN (MID-1) a Purifika Mérida. CLABE 014010655094078589");
  assert.match(lote.pendientes[0].whatsappUrl, /Hola%20Ana%20Ruiz/);
});

test("cada recordatorio correctivo usa su propio mensaje", () => {
  const filas = [filaBdd({ grupo: "Ana Ruiz", folio: "AGS2-60", fecha: "05/10/2026", credito: "1", saldo: "300" })];
  const contactos = new Map([["ana ruiz", { telefono: "524491234567", correo: "ana@ruiz.mx", recibe_correo: true }]]);
  // Octubre 2026: R1 el 7, R2 el 15, R3 el 21 y R4 el 30.
  const esperado = { "2026-10-07": "R1", "2026-10-15": "R2", "2026-10-21": "R3", "2026-10-30": "R4" };
  const textos = new Set();
  for (const [hoyISO, recordatorio] of Object.entries(esperado)) {
    const [item] = construirLote({ hoyISO, franchiseId: "aguascalientes", clientes: clientesDe(filas), contactos }).pendientes;
    assert.equal(item.recordatorio, recordatorio);
    const clave = `correctivo_${recordatorio.toLowerCase()}`;
    assert.equal(item.correoAsunto, PLANTILLAS[`${clave}_correo_asunto`].predeterminada.replace("{referencia}", "Factura AGS2-60").replace("{franquicia}", "Purifika Aguascalientes"));
    assert.match(item.whatsappTexto, /CLABE: 014010655092237775/);
    assert.doesNotMatch(item.whatsappTexto, /suspend|interrump|corte|retiro/i);
    textos.add(item.whatsappTexto.split("\n")[0]);
  }
  assert.equal(textos.size, 4);
});

test("valida las plantillas antes de guardarlas", () => {
  assert.equal(validarPlantilla("correctivo_r1_whatsapp", "  Hola {nombre}\r\n\r\n{detalle_facturas}  "), "Hola {nombre}\n\n{detalle_facturas}");
  assert.equal(validarPlantilla("correctivo_r2_correo_asunto", "Saldo\n  {referencia}"), "Saldo {referencia}");
  assert.throws(() => validarPlantilla("correctivo_r3_whatsapp", "Hola {cliente} {saldo}"), /Variables desconocidas: \{cliente\}, \{saldo\}/);
  assert.throws(() => validarPlantilla("correctivo_r4_whatsapp", "   "), /vacía/);
  assert.throws(() => validarPlantilla("correctivo_whatsapp", "Hola"), /desconocida/);
  assert.throws(() => validarPlantilla("otra", "Hola"), /desconocida/);
  assert.throws(() => validarPlantilla("preventivo_correo_asunto", "x".repeat(201)), /200 caracteres/);
});

test("correo editado a mano: HTML escapado con el eslogan con estilo", () => {
  const html = correoHtmlDesdeTexto("Hola, <Ana>:\nLínea dos\n\nMenos plástico, más futuro.");
  assert.match(html, /Hola, &lt;Ana&gt;:<br>Línea dos/);
  assert.match(html, /font-weight:bold[^>]*>Menos plástico, más futuro\.<\/p>/);
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
  assert.match(correo.html, /<th[^>]*>Factura<\/th>/);
  assert.match(correo.html, /<strong>CLABE:<\/strong> 014010655092237775/);
  assert.doesNotMatch(correo.html, /\{[a-z_]+\}/);
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

test("normaliza teléfonos con código de país (México y extranjeros) para wa.me", () => {
  // México: con o sin código de país, y el formato antiguo de celular (+52 1).
  assert.equal(normalizarTelefono("449 123 4567"), "524491234567");
  assert.equal(normalizarTelefono("+52 449 123 4567"), "524491234567");
  assert.equal(normalizarTelefono("52 449 123 4567"), "524491234567");
  assert.equal(normalizarTelefono("+52 1 449 123 4567"), "524491234567");
  // Extranjeros: con "+", con "00" o con el código de país sin "+".
  assert.equal(normalizarTelefono("+1 (415) 555-2671"), "14155552671");
  assert.equal(normalizarTelefono("1 415 555 2671"), "14155552671");
  assert.equal(normalizarTelefono("+34 612 345 678"), "34612345678");
  assert.equal(normalizarTelefono("0034 612 345 678"), "34612345678");
  assert.equal(normalizarTelefono("+57 300 123 4567"), "573001234567");
  assert.equal(normalizarTelefono("+44 7911 123456"), "447911123456");
  // Varios en una celda: toma el primero válido.
  assert.equal(normalizarTelefono("(449) 12-345 / 449 765 4321"), "524497654321");
  assert.equal(normalizarTelefono("4491234567 / 4497654321"), "524491234567");
  // Inválidos: muy corto, longitud imposible para el país o demasiados dígitos.
  assert.equal(normalizarTelefono("123"), null);
  assert.equal(normalizarTelefono("+52 449 123"), null);
  assert.equal(normalizarTelefono("+52 449 123 45678"), null);
  assert.equal(normalizarTelefono("+1234567890123456"), null);
});

test("muestra el teléfono en formato internacional", () => {
  assert.equal(telefonoLegible("524491234567"), "+52 449 123 4567");
  assert.equal(telefonoLegible("14155552671"), "+1 415 555 2671");
  assert.equal(telefonoLegible("34612345678"), "+34 612 34 56 78");
  assert.equal(telefonoLegible(null), "");
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
    "AGS,Tel Malo,123,ok@correo.mx,",
    "CUN,Cliente Extranjero,+1 415 555 2671,,",
    "AGS,Todo Malo,123,no-es-correo,",
  ].join("\n");
  const { contactos, omitidas, advertencias, sinDatos } = parseContactosCsv(csv);
  assert.equal(contactos.length, 4);
  assert.equal(contactos.find((c) => c.groupKey === "cliente extranjero").telefono, "14155552671");
  assert.equal(sinDatos, 1);
  assert.deepEqual(advertencias.map((fila) => fila.motivo), ['Teléfono inválido "123"; se guardó el resto']);
  assert.deepEqual(contactos[0], { franchiseId: "aguascalientes", groupKey: "juan perez", nombre: "Juan Pérez", telefono: "524491234567", correo: null, recibeCorreo: false });
  assert.equal(contactos[1].recibeCorreo, true);
  assert.deepEqual(omitidas.map((fila) => fila.motivo), ["Franquicia no reconocida (usa AGS, CUN o MID)", 'Teléfono inválido "123" y correo inválido "no-es-correo"']);
});

test("el archivo exige las columnas mínimas y lo dice con su nombre", () => {
  assert.throws(() => parseContactosCsv("Franquicia,Grupo De Facturación,Correo\nAGS,X,a@b.mx"), /Faltan columnas en la primera fila: Teléfono/);
});

test("CSV de Excel en español: punto y coma, acentos en ANSI y filas vacías", async () => {
  const texto = "Franquicia;Grupo De Facturación;Teléfono;Correo;Recibe Correo\r\nAGS;Juan Pérez;449 123 4567;;\r\n;;;;\r\nMID;Peña SA de CV;;pagos@pena.mx;Sí\r\n";
  const ansi = Buffer.from(texto, "latin1");
  const { contactos, omitidas } = await leerArchivoContactos(ansi, "contactos.csv");
  assert.deepEqual(contactos.map((c) => [c.franchiseId, c.nombre, c.telefono, c.correo, c.recibeCorreo]), [
    ["aguascalientes", "Juan Pérez", "524491234567", null, false],
    ["merida", "Peña SA de CV", null, "pagos@pena.mx", true],
  ]);
  assert.equal(omitidas.length, 0);
});

test("XLSX: teléfono numérico, correo como hipervínculo y columnas en otro orden", async () => {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Hoja1");
  hoja.addRow(["Correo", "Teléfono", "Grupo De Facturación", "Franquicia", "Notas"]);
  hoja.addRow([{ text: "admin@hotel.mx", hyperlink: "mailto:admin@hotel.mx" }, 9981234567, "HOTEL SOL SA DE CV", "Cancún", "x"]);
  hoja.addRow([]);
  hoja.addRow(["", "", "Sin Datos", "AGS", ""]);
  const buffer = Buffer.from(await libro.xlsx.writeBuffer());
  const { contactos, omitidas, sinDatos } = await leerArchivoContactos(buffer, "contactos.xlsx");
  assert.deepEqual(contactos, [{
    franchiseId: "cancun", groupKey: "hotel sol sa de cv", nombre: "HOTEL SOL SA DE CV",
    telefono: "529981234567", correo: "admin@hotel.mx", recibeCorreo: null,
  }]);
  assert.equal(omitidas.length, 0);
  assert.equal(sinDatos, 1);
});

test("rechaza .xls antiguo y otros formatos con mensaje claro", async () => {
  await assert.rejects(leerArchivoContactos(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), "viejo.xls"), /\.xls/);
  await assert.rejects(leerArchivoContactos(Buffer.from("hola"), "notas.pdf"), /\.csv o \.xlsx/);
  await assert.rejects(leerArchivoContactos(Buffer.alloc(0), "vacio.csv"), /Selecciona un archivo/);
});

test("supervisor: solo consulta Historial y Plantillas (con vista previa)", () => {
  for (const [metodo, ruta] of [["GET", "/envios"], ["GET", "/plantillas"], ["POST", "/plantillas/vista-previa"], ["GET", "/plantillas/"]]) {
    assert.equal(puedeUsarCampanas("supervisor", metodo, ruta), true, `${metodo} ${ruta}`);
  }
  for (const [metodo, ruta] of [
    ["GET", "/lote"], ["POST", "/envios"], ["DELETE", "/envios"], ["POST", "/correo/enviar"], ["GET", "/correo/vista-previa"],
    ["PUT", "/plantillas/correctivo_r1_whatsapp"], ["DELETE", "/plantillas/correctivo_r1_whatsapp"],
    ["GET", "/contactos"], ["PUT", "/contactos"], ["POST", "/contactos/importar"], ["GET", "/contactos/plantilla"],
  ]) {
    assert.equal(puedeUsarCampanas("supervisor", metodo, ruta), false, `${metodo} ${ruta}`);
  }
  assert.equal(puedeUsarCampanas("admin", "GET", "/lote"), true);
  assert.equal(puedeUsarCampanas("admin", "POST", "/correo/enviar"), true);
  assert.equal(puedeUsarCampanas("lector", "GET", "/envios"), false);
  assert.equal(puedeUsarCampanas(undefined, "GET", "/plantillas"), false);
});

test("gestor: WhatsApp, Directorio e Historial; sin correo ni plantillas", () => {
  for (const [metodo, ruta] of [["GET", "/lote"], ["POST", "/envios"], ["DELETE", "/envios"], ["GET", "/envios"],
    ["GET", "/contactos"], ["PUT", "/contactos"], ["GET", "/contactos/plantilla"]]) {
    assert.equal(puedeUsarCampanas("gestor", metodo, ruta), true, `${metodo} ${ruta}`);
  }
  for (const [metodo, ruta] of [["POST", "/correo/enviar"], ["GET", "/correo/vista-previa"], ["GET", "/plantillas"],
    ["POST", "/plantillas/vista-previa"], ["PUT", "/plantillas/correctivo_r1_whatsapp"], ["POST", "/contactos/importar"]]) {
    assert.equal(puedeUsarCampanas("gestor", metodo, ruta), false, `${metodo} ${ruta}`);
  }
});
