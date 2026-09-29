// Contenido de los tres documentos formales. Portado de scripts/generar_documento.js de la
// skill "documentos-purifika": mismos textos por defecto, mismas secciones y mismas reglas
// (monto explícito cerca del inicio, recuadro rojo según el caso, bloque de firma en retiro y
// acuerdo). Recibe los datos ya normalizados por buildDocumentData().
import { CONTACTO_ATENCION_CLIENTES, CONTACTO_DEFAULT } from "./brand.js";

// "Banco Santander México, S.A." ya termina en punto: evita "S.A.." al continuar la frase.
function sinPuntoFinal(texto) {
  return texto.replace(/\.$/, "");
}

function contactoDe(data) {
  return { ...CONTACTO_DEFAULT, ...(data.contacto ?? {}) };
}

export function avisoDeuda(layout, data) {
  const { franquicia } = data;
  layout.destinatario(data.destinatario);
  layout.titulo("Aviso de saldo pendiente");
  layout.subtitulo(
    data.diasMora != null
      ? `${data.diasMora} día${data.diasMora === 1 ? "" : "s"} de atraso`
      : "Saldo pendiente de regularización",
    { after: 8 }
  );
  layout.parrafo(data.saludo || `Estimado(a) ${data.destinatario.nombre || "cliente"}:`, { after: 6, line: 270 });
  layout.parrafo(
    data.parrafoContexto ||
      "Le escribimos para comentarle sobre el estatus de su cuenta, con el propósito de encontrar juntos la mejor forma de resolver la situación.",
    { after: 7, line: 270 }
  );

  // Rojo cuando el saldo supera $5,000.00 MXN (no por días de mora); turquesa en los demás.
  layout.montoDestacado("Saldo total pendiente:", data.montoTotal, { alerta: data.montoTotalNumero > 5000 });
  layout.spacer(7);

  if (data.facturas.length) {
    layout.seccion("Detalle de facturas vencidas", { before: 9, after: 5 });
    layout.tabla(
      [
        { header: "Folio", width: 22 },
        { header: "Fecha factura", width: 19 },
        { header: "Fecha vencimiento", width: 21 },
        { header: "Días de atraso", width: 16, align: "center" },
        { header: "Importe", width: 22, align: "right" },
      ],
      [
        ...data.facturas.map((factura) => [
          factura.folio, factura.fechaFactura, factura.fechaVencimiento, String(factura.diasAtraso), factura.importe,
        ]),
        ["Total vencido", "", "", "", data.montoTotal],
      ],
      { lastRowIsTotal: true, compacto: true }
    );
    layout.spacer(5);
  }

  if (data.notaAdicional) layout.parrafo(data.notaAdicional, { after: 7, line: 270 });

  layout.parrafo(
    data.parrafoCierre ||
      "Entendemos que en ocasiones surgen imprevistos y estamos en la mejor disposición de trabajar junto con usted para encontrar una solución cómoda para ambas partes.",
    { after: 7, line: 270 }
  );

  layout.seccion("Forma de pago", { before: 8, after: 5 });
  layout.cajaDestacada([
    { runs: [{ text: "Transferencia — ", bold: true }, { text: `${franquicia.razonSocial}. ${franquicia.banco}` }], after: 2 },
    {
      runs: [
        { text: "Cuenta: ", bold: true },
        { text: `${franquicia.cuenta}   ·   ` },
        { text: "CLABE: ", bold: true },
        { text: franquicia.clabe },
      ],
    },
  ]);
  layout.spacer(7);

  layout.seccion("Contacto", { before: 8, after: 5 });
  const contacto = contactoDe(data);
  layout.parrafo(`${contacto.nombre} — ${contacto.correo}`, { after: 2 });
  layout.parrafo(`${CONTACTO_ATENCION_CLIENTES.nombre} — ${CONTACTO_ATENCION_CLIENTES.correo}`, { after: 6 });

  layout.parrafo("Agradecemos de antemano su atención.", { italics: true, after: 7 });
  layout.parrafo("Atentamente,", { after: 2 });
  layout.parrafo(`Equipo de Cobranza — ${franquicia.nombreComercial}`, { bold: true });
}

export function avisoRetiro(layout, data) {
  const { franquicia } = data;
  const compacto = { compacto: true };
  layout.destinatario(data.destinatario, compacto);
  layout.titulo("Notificación formal de retiro de equipos");
  layout.subtitulo("Terminación de la prestación del servicio", { after: 8 });

  layout.parrafo(
    data.parrafoAntecedentes ||
      `Por medio de la presente, ${franquicia.nombreComercial} le notifica formalmente la terminación de la prestación del servicio contratado, derivada de la falta de regularización del saldo pendiente dentro del plazo otorgado.`,
    { after: 7, line: 270 }
  );

  // Siempre rojo: es el documento de mayor urgencia de los tres.
  layout.montoDestacado("Saldo adeudado:", data.montoTotal, { alerta: true, compacto: true });
  layout.spacer(6);

  if (data.facturas.length) {
    layout.seccion("Facturas con saldo insoluto", { before: 8, after: 4 });
    layout.tabla(
      [
        { header: "Folio", width: 30 },
        { header: "Fecha factura", width: 25 },
        { header: "Fecha vencimiento", width: 25 },
        { header: "Importe", width: 20, align: "right" },
      ],
      data.facturas.map((factura) => [factura.folio, factura.fechaFactura, factura.fechaVencimiento, factura.importe]),
      compacto
    );
    layout.spacer(7);
  }

  layout.parrafo(
    data.parrafoConsecuencia ||
      "Al no haberse concretado la liquidación de las parcialidades estipuladas, se hace del conocimiento que el personal técnico de nuestra empresa se presentará en sus instalaciones para llevar a cabo la desconexión, desinstalación y retiro de los equipos de nuestra propiedad.",
    { after: 7, line: 270 }
  );

  layout.seccion("Detalles de la diligencia de retiro", { before: 8, after: 4 });
  layout.tabla(
    [
      { header: "Concepto", width: 35 },
      { header: "Especificación", width: 65 },
    ],
    [
      ["Fecha estipulada", data.fechaRetiro || "Por definir"],
      ["Personal técnico autorizado", "Personal identificado con uniforme oficial de la empresa"],
      ["Equipos a retirar", (data.equipos ?? []).join(", ") || "Por definir"],
    ],
    compacto
  );
  layout.spacer(7);

  layout.seccion("Solicitud de confirmación y facilidades de acceso", { before: 8, after: 4 });
  layout.bullet(
    "Autorización de acceso: permitir el ingreso a las instalaciones para el personal y vehículo asignado para realizar la maniobra de retiro.",
    { after: 4, line: 260 }
  );
  layout.bullet(
    "Designación de representante: designar un representante de su parte para supervisar el proceso de desinstalación y firmar las órdenes de retiro.",
    { after: 4, line: 260 }
  );

  layout.spacer(4);
  layout.parrafo(
    "Le recordamos que el retiro de los equipos no exime al cliente de la obligación de liquidar los saldos adeudados acumulados hasta la fecha de suspensión del servicio.",
    { after: 5, line: 260 }
  );
  layout.parrafo("Agradecemos su cooperación para efectuar esta diligencia sin contratiempos.", { after: 6, line: 260 });

  layout.seccion("Acuse de recibo", { before: 6, after: 3 });
  const contacto = contactoDe(data);
  layout.bloqueFirma({
    nombrePurifika: contacto.nombre,
    puestoPurifika: `${contacto.puesto} — ${franquicia.nombreComercial}`,
    nombreCliente: data.destinatario.nombre,
    compacto: true,
  });
}

export function acuerdoPagos(layout, data) {
  const { franquicia } = data;
  // Propuesta por defecto; solo con esBorrador === false pasa a acuerdo ya pactado. El tono de
  // todo el documento (no solo el título) cambia con esto.
  const esBorrador = data.esBorrador !== false;

  layout.destinatario(data.destinatario);
  layout.titulo(esBorrador ? "Propuesta para regularización de adeudo" : "Acuerdo de pago");
  layout.subtitulo(franquicia.nombreComercial);

  layout.parrafo(data.saludo || `Estimado(a) ${data.destinatario.nombre || "cliente"}:`);
  layout.parrafo(
    data.parrafoContexto ||
      (esBorrador
        ? "Con el firme compromiso de mantener una relación comercial beneficiosa para ambas partes, ponemos a su consideración la siguiente propuesta de reestructuración de pagos, diseñada para facilitar la regularización de su cuenta garantizando al mismo tiempo la continuidad de los servicios."
        : "Confirmamos por medio del presente el acuerdo de pago pactado con usted, con el firme compromiso de mantener una relación comercial beneficiosa para ambas partes y garantizar la continuidad de los servicios.")
  );

  if (data.montoTotal) {
    layout.montoDestacado("Adeudo total a regularizar:", data.montoTotal);
    layout.spacer(4);
    if (data.bonificacion) {
      layout.parrafoMixto([
        { text: "Adeudo original de las facturas: " },
        { text: data.bonificacion.original, bold: true },
        { text: "   ·   Bonificación otorgada: " },
        { text: `−${data.bonificacion.monto}`, bold: true },
      ], { after: 4, line: 260 });
    }
    layout.spacer(3);
  }

  layout.seccion(esBorrador ? "Esquema de pagos propuesto" : "Esquema de pagos acordado", { before: 9, after: 5 });
  layout.tabla(
    [
      { header: "Fecha compromiso de pago", width: 28 },
      { header: "Facturas a liquidar", width: 47 },
      { header: "Importe", width: 25, align: "right" },
    ],
    data.parcialidades.map((parcialidad) => [parcialidad.fecha, parcialidad.facturas, parcialidad.importe])
  );
  layout.spacer(8);

  layout.seccion("Forma de pago", { before: 9, after: 5 });
  layout.parrafoMixto([
    { text: "Transferencia — ", bold: true },
    { text: `${franquicia.razonSocial}. ${sinPuntoFinal(franquicia.banco)}. Cuenta: ${franquicia.cuenta} · CLABE: ${franquicia.clabe}` },
  ]);
  layout.spacer(6);

  if (data.condiciones?.length) {
    layout.seccion("Modalidades y condiciones particulares", { before: 9, after: 5 });
    data.condiciones.forEach((condicion) => layout.bullet(condicion));
    layout.spacer(6);
  }

  layout.seccion("Términos y condiciones del convenio", { before: 9, after: 5 });
  const terminos = data.terminos?.length ? data.terminos : [
    "Una vez aceptado el convenio, los importes y las fechas pactadas deberán cumplirse puntualmente. Esto permite dar continuidad al servicio y evitar afectaciones operativas para ambas partes.",
    "De conformidad con nuestras políticas, el incumplimiento de cualquiera de las parcialidades acordadas dará por terminado el convenio de manera inmediata. De ser así, procederemos con el retiro de los equipos instalados, sin requerir un aviso previo.",
  ];
  terminos.forEach((termino) => layout.bullet(termino));

  layout.spacer(6);
  layout.parrafo(
    data.parrafoCierre ||
      (esBorrador
        ? "Quedamos a su entera disposición para resolver cualquier duda. De estar de acuerdo con las condiciones planteadas, le solicitamos firmar de conformidad el presente documento para formalizar el acuerdo."
        : "Quedamos a su entera disposición para resolver cualquier duda sobre los términos ya pactados. Le solicitamos conservar una copia firmada del presente documento como constancia del compromiso adquirido.")
  );

  layout.seccion("Firma de conformidad", { before: 7, after: 4 });
  const contacto = contactoDe(data);
  layout.bloqueFirma({
    nombrePurifika: contacto.nombre,
    puestoPurifika: `${contacto.puesto} — ${franquicia.nombreComercial}`,
    nombreCliente: data.destinatario.nombre,
  });
}

export const TEMPLATES = Object.freeze({
  aviso_deuda: avisoDeuda,
  aviso_retiro: avisoRetiro,
  acuerdo_pagos: acuerdoPagos,
});
