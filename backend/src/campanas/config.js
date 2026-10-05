// Parámetros del módulo Campañas (cobranza preventiva y correctiva).
//
// Las reglas y los datos de pago siguen la skill "cobranza-purifika": tono por etapa,
// datos bancarios por franquicia (nunca se mezclan cuentas), contacto de escalamiento y el
// eslogan, que solo va en correo.

export const REGLAS = Object.freeze({
  // Preventivo: clientes al corriente cuya factura vence dentro de esta ventana (en días
  // naturales, incluido el día del vencimiento).
  preventivoDiasAntes: 5,
  // Correctivo (1-30 días): un recordatorio por semana, a partir de estos días del mes. Un
  // día mayor al último del mes (31) se toma como fin de mes. Si el día cae en fin de
  // semana, la ventana empieza el siguiente día hábil; si eso ya sería el mes siguiente, el
  // día hábil anterior. Cada recordatorio queda pendiente hasta que abre el siguiente; el de
  // fin de mes, hasta que termina el mes.
  correctivoDias: [7, 15, 21, 31],
  // Fecha límite que se le da al cliente en el recordatorio correctivo.
  correctivoPlazoDiasHabiles: 5,
  // A partir de estos días de atraso el cliente no recibe mensaje masivo: pasa a la lista de
  // escalamiento para gestión puntual (con sugerencia de emitir documento).
  escalamientoDesde: 31,
  // Un pago registrado en estos días previos (o después de la última modificación de la
  // BDD) excluye la factura: es preferible omitir un recordatorio a cobrarle a quien ya pagó.
  pagoRecienteDias: 3,
  // La BDD de Drive se considera desactualizada si su última modificación supera este
  // número de días; el lote se muestra con aviso.
  bddVigenciaDias: 1,
});

export const FRANQUICIAS = Object.freeze({
  aguascalientes: {
    label: "Aguascalientes",
    razonSocial: "Stream Ingeniería Sustentable",
    banco: "Banco Santander México, S.A.",
    cuenta: "65509223777",
    clabe: "014010655092237775",
  },
  cancun: {
    label: "Cancún",
    razonSocial: "Purestream",
    banco: "Banco Santander México, S.A.",
    cuenta: "65508109387",
    clabe: "014691655081093873",
  },
  merida: {
    label: "Mérida",
    razonSocial: "Águila Maya",
    banco: "Banco Santander México, S.A.",
    cuenta: "65509407858",
    clabe: "014010655094078589",
  },
});

export const CONTACTO_ESCALAMIENTO = Object.freeze({
  nombre: "Jonathan De Santiago",
  correo: "cobranza.ags@purifika.com",
});

export const ESLOGAN = "Menos plástico, más futuro.";
