// Rutas del módulo Campañas (cobranza preventiva y correctiva por envío masivo asistido).
// Montadas en /api/campanas, siempre con sesión. Administradores y gestores; cada gestor
// solo ve y opera las franquicias asignadas.
import express, { Router } from "express";
import ExcelJS from "exceljs";
import { pool } from "../db/pool.js";
import { requireRole } from "../auth/authorization.js";
import { FRANCHISE_IDS, resolveFranchiseScope } from "../auth/franchiseScope.js";
import { normalizeBusinessKey } from "../imports/consolidation.js";
import { addCalendarDays, mexicoTodayISO } from "../domain/dates.js";
import { cargarPlantillas, contactosPorGrupo, leerBdd, obtenerLote, plantillasGuardadas, registrarEnvio } from "../campanas/service.js";
import { calendarioCorrectivo, correoDeItem, sumarDiasHabiles } from "../campanas/reglas.js";
import { FRANQUICIAS, REGLAS } from "../campanas/config.js";
import { asuntoCorreo, correoHtml, correoTexto, mensajeWhatsApp } from "../campanas/mensajes.js";
import {
  LIMITE_ASUNTO,
  LIMITE_CUERPO,
  MENSAJES_RECORDATORIO,
  PLANTILLAS,
  VARIABLES,
  correoHtmlDesdeTexto,
  esClavePlantilla,
  plantillasVigentes,
  validarPlantilla,
} from "../campanas/plantillas.js";
import { correoConfigurado, enviarCorreo, remitente, remitenteVisible } from "../campanas/correo.js";
import { leerArchivoContactos, normalizarCorreos, normalizarTelefono, properCase, telefonoLegible } from "../campanas/contactos.js";

export const campanasRouter = Router();
campanasRouter.use(requireRole("admin", "gestor"));

const MAX_CORREOS_POR_SOLICITUD = 25;
const PREFIJO_FRANQUICIA = Object.freeze({ aguascalientes: "AGS", cancun: "CUN", merida: "MID" });

function franquiciaUnica(user, value) {
  if (!FRANCHISE_IDS.includes(value)) {
    const error = new Error("Indica una franquicia válida");
    error.statusCode = 400;
    throw error;
  }
  return resolveFranchiseScope(user, value)[0];
}

// GET /api/campanas/lote?franchise=todas|<id>&refrescar=1
campanasRouter.get("/lote", async (req, res, next) => {
  try {
    const franquicias = resolveFranchiseScope(req.user, String(req.query.franchise ?? "todas"));
    const refrescar = req.query.refrescar === "1";
    const lotes = await Promise.all(franquicias.map((id) => obtenerLote(pool, id, { refrescar })));
    res.json({
      hoyISO: lotes[0]?.hoyISO ?? null,
      ventanas: lotes[0]?.ventanas ?? null,
      correoConfigurado: correoConfigurado(),
      remitente: correoConfigurado() ? remitente() : null,
      fuentes: lotes.map((lote) => ({ franchiseId: lote.franchiseId, ...lote.fuente })),
      pendientes: lotes.flatMap((lote) => lote.pendientes),
      escalamiento: lotes.flatMap((lote) => lote.escalamiento),
      excluidos: lotes.flatMap((lote) => lote.excluidos),
      resumen: lotes.reduce((total, lote) => ({
        clientes: total.clientes + lote.resumen.clientes,
        sinVencimiento: total.sinVencimiento + lote.resumen.sinVencimiento,
        yaEnviados: total.yaEnviados + lote.resumen.yaEnviados,
      }), { clientes: 0, sinVencimiento: 0, yaEnviados: 0 }),
    });
  } catch (err) {
    next(err);
  }
});

async function buscarPendiente(user, { franchiseId, groupKey, regla }, opciones = {}) {
  const franquicia = franquiciaUnica(user, franchiseId);
  const lote = await obtenerLote(pool, franquicia, opciones);
  return lote.pendientes.find((item) => item.groupKey === groupKey && item.regla === regla) ?? null;
}

// Texto editado a mano para un envío. null si no viene (se usa el de la plantilla).
function textoEditado(valor, limite, etiqueta, { unaLinea = false } = {}) {
  if (valor === undefined || valor === null) return null;
  let texto = String(valor).replace(/\r\n?/g, "\n").trim();
  if (unaLinea) texto = texto.replace(/\s+/g, " ");
  const error = (mensaje) => Object.assign(new Error(mensaje), { statusCode: 400 });
  if (!texto) throw error(`${etiqueta} no puede quedar vacío`);
  if (texto.length > limite) throw error(`${etiqueta} supera ${limite} caracteres`);
  return texto;
}

// POST /api/campanas/envios  body: { franchiseId, groupKey, regla, mensaje? }
// Registra un recordatorio de WhatsApp enviado por el gestor (el texto se abre en WhatsApp
// desde la pantalla, con las ediciones que haya hecho). El item se vuelve a calcular en el
// servidor; el texto se guarda para el Historial.
campanasRouter.post("/envios", async (req, res, next) => {
  try {
    const mensaje = textoEditado(req.body?.mensaje, LIMITE_CUERPO, "El mensaje");
    const item = await buscarPendiente(req.user, req.body ?? {});
    if (!item) return res.status(409).json({ error: "El recordatorio ya no está pendiente" });
    if (!item.telefono) return res.status(400).json({ error: "El cliente no tiene teléfono registrado" });
    const ids = await registrarEnvio(pool, item, "whatsapp", item.telefono, req.user.id, {
      mensaje: mensaje ?? item.whatsappTexto,
      editado: mensaje !== null && mensaje !== item.whatsappTexto.trim(),
    });
    if (ids.length === 0) return res.status(409).json({ error: "Este recordatorio ya se había registrado" });
    res.status(201).json({ ids });
  } catch (err) {
    if (err.statusCode === 400) err.expose = true;
    next(err);
  }
});

// DELETE /api/campanas/envios  body: { ids: [] }
// "Deshacer" de la pantalla: solo envíos de WhatsApp registrados hoy por el mismo usuario.
campanasRouter.delete("/envios", async (req, res, next) => {
  try {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger);
    if (!ids.length) return res.status(400).json({ error: "Sin envíos por deshacer" });
    const { rowCount } = await pool.query(
      `delete from campana_envios
       where id = any($1::bigint[]) and enviado_por = $2 and canal = 'whatsapp'
         and (enviado_at at time zone 'America/Mexico_City')::date = (now() at time zone 'America/Mexico_City')::date`,
      [ids, req.user.id]
    );
    res.json({ eliminados: rowCount });
  } catch (err) {
    next(err);
  }
});

// POST /api/campanas/correo/enviar  body: { items: [{ franchiseId, groupKey, regla, asunto?, texto? }] }
// Envía los correos seleccionados (comerciales autorizados). Primero reserva el envío en la
// bitácora para que dos personas no manden el mismo correo; si el envío falla, se libera.
// asunto / texto: ediciones hechas en la vista previa para ese cliente; sin ellas se usa la
// plantilla.
campanasRouter.post("/correo/enviar", async (req, res, next) => {
  try {
    if (!correoConfigurado()) return res.status(503).json({ error: "El envío de correo no está configurado en el servidor" });
    const solicitados = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!solicitados.length) return res.status(400).json({ error: "Selecciona al menos un correo" });
    if (solicitados.length > MAX_CORREOS_POR_SOLICITUD) {
      return res.status(400).json({ error: `Máximo ${MAX_CORREOS_POR_SOLICITUD} correos por solicitud` });
    }

    const plantillas = await cargarPlantillas(pool);
    const resultados = [];
    for (const solicitado of solicitados) {
      const etiqueta = { groupKey: solicitado.groupKey, franchiseId: solicitado.franchiseId, regla: solicitado.regla };
      try {
        const asuntoEditado = textoEditado(solicitado.asunto, LIMITE_ASUNTO, "El asunto", { unaLinea: true });
        const textoEditadoCorreo = textoEditado(solicitado.texto, LIMITE_CUERPO, "El correo");
        const item = await buscarPendiente(req.user, solicitado, { plantillas });
        if (!item || item.canal !== "correo") {
          resultados.push({ ...etiqueta, ok: false, error: "Ya no está pendiente de correo" });
          continue;
        }
        const correo = correoDeItem(item, plantillas);
        const textoCambio = textoEditadoCorreo !== null && textoEditadoCorreo !== correo.texto.trim();
        const asunto = asuntoEditado ?? correo.asunto;
        const texto = textoCambio ? textoEditadoCorreo : correo.texto;
        const html = textoCambio ? correoHtmlDesdeTexto(texto) : correo.html;
        const ids = await registrarEnvio(pool, item, "correo", item.destino, req.user.id, {
          mensaje: texto,
          asunto,
          editado: textoCambio || asunto !== correo.asunto,
        });
        if (!ids.length) {
          resultados.push({ ...etiqueta, ok: false, error: "Ya se había enviado" });
          continue;
        }
        try {
          await enviarCorreo({ para: item.destino, asunto, texto, html });
          resultados.push({ ...etiqueta, ok: true, destino: item.destino });
        } catch (error) {
          await pool.query("delete from campana_envios where id = any($1::bigint[])", [ids]);
          console.error("[campanas] correo", error);
          resultados.push({ ...etiqueta, ok: false, error: "El servidor de correo rechazó el envío" });
        }
      } catch (error) {
        resultados.push({ ...etiqueta, ok: false, error: error.statusCode ? error.message : "Error al preparar el correo" });
      }
    }
    res.json({ resultados, enviados: resultados.filter((resultado) => resultado.ok).length });
  } catch (err) {
    next(err);
  }
});

// GET /api/campanas/correo/vista-previa?franchiseId=&groupKey=&regla=
campanasRouter.get("/correo/vista-previa", async (req, res, next) => {
  try {
    const plantillas = await cargarPlantillas(pool);
    const item = await buscarPendiente(req.user, req.query, { plantillas });
    if (!item) return res.status(404).json({ error: "El recordatorio ya no está pendiente" });
    res.json({ para: item.destino, ...correoDeItem(item, plantillas) });
  } catch (err) {
    next(err);
  }
});

// ---- Plantillas ----

function describirPlantillas(guardadas) {
  return Object.entries(PLANTILLAS).map(([clave, plantilla]) => ({
    clave,
    titulo: plantilla.titulo,
    mensaje: plantilla.mensaje,
    regla: plantilla.regla,
    canal: plantilla.canal,
    tipo: plantilla.tipo,
    limite: plantilla.tipo === "asunto" ? LIMITE_ASUNTO : LIMITE_CUERPO,
    contenido: guardadas[clave]?.contenido ?? plantilla.predeterminada,
    predeterminada: plantilla.predeterminada,
    personalizada: Boolean(guardadas[clave]),
    actualizado: guardadas[clave]?.updated_at ?? null,
    actualizadoPor: guardadas[clave]?.actualizado_por ?? null,
  }));
}

// GET /api/campanas/plantillas -> mensajes (preventivo y R1-R4), sus plantillas y las variables
campanasRouter.get("/plantillas", async (_req, res, next) => {
  try {
    const hoyISO = mexicoTodayISO();
    const calendario = calendarioCorrectivo(hoyISO.slice(0, 7));
    const mensajes = MENSAJES_RECORDATORIO.map((mensaje) => ({
      ...mensaje,
      desdeISO: calendario.find((ventana) => ventana.recordatorio === mensaje.recordatorio)?.desdeISO ?? null,
    }));
    res.json({ mensajes, plantillas: describirPlantillas(await plantillasGuardadas(pool)), variables: VARIABLES });
  } catch (err) {
    next(err);
  }
});

// PUT /api/campanas/plantillas/:clave  body: { contenido }  (solo admin)
// Guardar la predeterminada tal cual equivale a restablecerla.
campanasRouter.put("/plantillas/:clave", requireRole("admin"), async (req, res, next) => {
  try {
    const { clave } = req.params;
    if (!esClavePlantilla(clave)) return res.status(404).json({ error: "Plantilla desconocida" });
    const contenido = validarPlantilla(clave, req.body?.contenido);
    if (contenido === PLANTILLAS[clave].predeterminada) {
      await pool.query("delete from campana_plantillas where clave = $1", [clave]);
    } else {
      await pool.query(
        `insert into campana_plantillas (clave, contenido, updated_by, updated_at)
         values ($1, $2, $3, now())
         on conflict (clave) do update set contenido = excluded.contenido, updated_by = excluded.updated_by, updated_at = now()`,
        [clave, contenido, req.user.id]
      );
    }
    res.json(describirPlantillas(await plantillasGuardadas(pool)).find((plantilla) => plantilla.clave === clave));
  } catch (err) {
    if (err.statusCode === 400) err.expose = true;
    next(err);
  }
});

// DELETE /api/campanas/plantillas/:clave  (solo admin) -> vuelve a la predeterminada
campanasRouter.delete("/plantillas/:clave", requireRole("admin"), async (req, res, next) => {
  try {
    const { clave } = req.params;
    if (!esClavePlantilla(clave)) return res.status(404).json({ error: "Plantilla desconocida" });
    await pool.query("delete from campana_plantillas where clave = $1", [clave]);
    res.json(describirPlantillas(await plantillasGuardadas(pool)).find((plantilla) => plantilla.clave === clave));
  } catch (err) {
    next(err);
  }
});

// Cliente de ejemplo para la vista previa de una plantilla, con las fechas reales del mes: el
// correctivo se "envía" el día de su recordatorio y su fecha límite se calcula igual que en el
// lote (+5 días hábiles); el preventivo, con una factura que vence en 3 días.
function itemDeEjemplo(plantilla, franchiseId) {
  const hoyISO = mexicoTodayISO();
  const prefijo = PREFIJO_FRANQUICIA[franchiseId];
  if (plantilla.regla === "preventivo") {
    const vencimientoISO = addCalendarDays(hoyISO, 3);
    return {
      regla: "preventivo",
      recordatorio: null,
      franchiseId,
      nombre: "María López",
      facturas: [{ folio: `${prefijo}-1101`, saldo: 850, vencimientoISO, diasAtraso: -3 }],
      monto: 850,
      fechaLimiteISO: vencimientoISO,
      atrasoMaximo: 0,
    };
  }
  const recordatorio = plantilla.mensaje.slice(-2).toUpperCase();
  const envioISO = calendarioCorrectivo(hoyISO.slice(0, 7)).find((ventana) => ventana.recordatorio === recordatorio)?.desdeISO ?? hoyISO;
  const facturas = [
    { folio: `${prefijo}-1024`, saldo: 1250, vencimientoISO: addCalendarDays(envioISO, -20), diasAtraso: 20 },
    { folio: `${prefijo}-1101`, saldo: 850, vencimientoISO: addCalendarDays(envioISO, -5), diasAtraso: 5 },
  ];
  return {
    regla: "correctivo",
    recordatorio,
    franchiseId,
    nombre: "María López",
    facturas,
    monto: 2100,
    fechaLimiteISO: sumarDiasHabiles(envioISO, REGLAS.correctivoPlazoDiasHabiles),
    atrasoMaximo: 20,
  };
}

// POST /api/campanas/plantillas/vista-previa  body: { clave, contenido, franchiseId? }
// Muestra cómo queda una plantilla (guardada o no) con un cliente de ejemplo. Incluye los
// datos para simular la pantalla: franquicia (contacto de WhatsApp), cliente y remitente.
campanasRouter.post("/plantillas/vista-previa", async (req, res, next) => {
  try {
    const { clave, contenido } = req.body ?? {};
    const texto = validarPlantilla(clave, contenido);
    const franchiseId = FRANCHISE_IDS.includes(req.body?.franchiseId)
      ? franquiciaUnica(req.user, req.body.franchiseId)
      : resolveFranchiseScope(req.user, "todas")[0];
    const plantilla = PLANTILLAS[clave];
    const plantillas = { ...plantillasVigentes(), [clave]: texto };
    const item = itemDeEjemplo(plantilla, franchiseId);
    const contexto = { franquicia: `Purifika ${FRANQUICIAS[franchiseId].label}`, cliente: item.nombre, remitente: remitenteVisible() };
    if (plantilla.canal === "whatsapp") return res.json({ ...contexto, texto: mensajeWhatsApp(item, plantillas) });
    if (plantilla.tipo === "asunto") return res.json({ ...contexto, texto: asuntoCorreo(item, plantillas) });
    res.json({ ...contexto, texto: correoTexto(item, plantillas), html: correoHtml(item, plantillas) });
  } catch (err) {
    if (err.statusCode === 400) err.expose = true;
    next(err);
  }
});

// GET /api/campanas/envios?franchise=&dias=30 -> historial de recordatorios
campanasRouter.get("/envios", async (req, res, next) => {
  try {
    const franquicias = resolveFranchiseScope(req.user, String(req.query.franchise ?? "todas"));
    const dias = Math.min(Math.max(Number.parseInt(req.query.dias, 10) || 30, 1), 180);
    const { rows } = await pool.query(
      `select e.id, e.franchise_id, e.group_key, e.cliente_nombre, e.cliente_id, e.regla, e.periodo,
              e.canal, e.destino, e.folios, e.monto::float as monto, e.enviado_at,
              e.mensaje, e.asunto, e.editado,
              u.display_name as enviado_por
       from campana_envios e left join app_users u on u.id = e.enviado_por
       where e.franchise_id = any($1::text[]) and e.enviado_at >= now() - make_interval(days => $2)
       order by e.enviado_at desc
       limit 1000`,
      [franquicias, dias]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/campanas/contactos?franchise=<id>&refrescar=1
// Directorio: todos los clientes vigentes de la BDD con su contacto (si existe).
campanasRouter.get("/contactos", async (req, res, next) => {
  try {
    const franquicias = resolveFranchiseScope(req.user, String(req.query.franchise ?? "todas"));
    const listas = await Promise.all(franquicias.map(async (franchiseId) => {
      const [bdd, contactos] = await Promise.all([
        leerBdd(franchiseId, { refrescar: req.query.refrescar === "1" }),
        contactosPorGrupo(pool, franchiseId),
      ]);
      return bdd.clientes.map((cliente) => {
        const contacto = contactos.get(cliente.groupKey);
        return {
          franchiseId,
          groupKey: cliente.groupKey,
          nombre: properCase(cliente.grupo),
          segment: cliente.segment,
          saldo: Math.round(cliente.facturas.reduce((suma, factura) => suma + factura.saldo, 0) * 100) / 100,
          telefono: contacto?.telefono ?? null,
          telefonoLegible: telefonoLegible(contacto?.telefono),
          correo: contacto?.correo ?? null,
          recibeCorreo: contacto?.recibe_correo ?? false,
          origen: contacto?.origen ?? null,
          editadoManual: contacto?.editado_manual ?? false,
          actualizado: contacto?.updated_at ?? null,
        };
      });
    }));
    res.json(listas.flat().sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
  } catch (err) {
    next(err);
  }
});

// PUT /api/campanas/contactos  body: { franchiseId, groupKey, nombre, telefono, correo, recibeCorreo }
// Edición desde el módulo. Marca el contacto como editado a mano para que la carga del
// archivo del portal ya no lo sobrescriba.
campanasRouter.put("/contactos", async (req, res, next) => {
  try {
    const { franchiseId, groupKey, nombre, telefono, correo, recibeCorreo } = req.body ?? {};
    const franquicia = franquiciaUnica(req.user, franchiseId);
    const llave = normalizeBusinessKey(groupKey);
    if (!llave) return res.status(400).json({ error: "Cliente inválido" });

    const telefonoTexto = String(telefono ?? "").trim();
    const telefonoNormalizado = telefonoTexto ? normalizarTelefono(telefonoTexto) : null;
    if (telefonoTexto && !telefonoNormalizado) {
      return res.status(400).json({ error: "Teléfono inválido: incluye el código de país, por ejemplo +52 449 123 4567 o +1 415 555 2671" });
    }
    const correoTexto = String(correo ?? "").trim();
    const correos = normalizarCorreos(correoTexto);
    const partes = new Set(correoTexto ? correoTexto.toLowerCase().split(/[\s,;]+/).filter(Boolean) : []);
    if (partes.size !== correos.length) {
      return res.status(400).json({ error: "Revisa el correo: hay una dirección inválida" });
    }
    if (recibeCorreo === true && !correos.length) {
      return res.status(400).json({ error: "Para autorizar correo captura al menos una dirección" });
    }

    const { rows } = await pool.query(
      `insert into campana_contactos
         (franchise_id, group_key, nombre, telefono, correo, recibe_correo, origen, editado_manual, updated_by, updated_at)
       values ($1, $2, $3, $4, $5, $6, 'manual', true, $7, now())
       on conflict (franchise_id, group_key) do update set
         nombre = excluded.nombre, telefono = excluded.telefono, correo = excluded.correo,
         recibe_correo = excluded.recibe_correo, editado_manual = true,
         updated_by = excluded.updated_by, updated_at = now()
       returning *`,
      [franquicia, llave, String(nombre ?? groupKey).trim() || llave, telefonoNormalizado,
        correos.join(", ") || null, recibeCorreo === true, req.user.id]
    );
    res.json({ ...rows[0], telefono_legible: telefonoLegible(rows[0].telefono) });
  } catch (err) {
    next(err);
  }
});

// POST /api/campanas/contactos/importar  (solo admin)
// Body: el archivo tal cual (application/octet-stream), .csv o .xlsx; nombre en el
// encabezado X-Archivo-Nombre. Agrega clientes nuevos y actualiza los que vinieron de un
// archivo; nunca sobrescribe un contacto editado a mano en el Directorio, y una celda vacía
// no borra un dato ya guardado (para borrar se usa el Directorio).
campanasRouter.post(
  "/contactos/importar",
  requireRole("admin"),
  express.raw({ type: "application/octet-stream", limit: "5mb" }),
  async (req, res, next) => {
    let client;
    try {
      let nombreArchivo = "";
      try { nombreArchivo = decodeURIComponent(req.get("x-archivo-nombre") ?? ""); } catch { nombreArchivo = ""; }
      const { contactos, omitidas, advertencias, sinDatos } = await leerArchivoContactos(req.body, nombreArchivo);
      if (!contactos.length) {
        return res.status(400).json({ error: "El archivo no tiene filas con teléfono o correo válidos", omitidas });
      }

      client = await pool.connect();
      await client.query("begin");
      const existentes = await client.query("select franchise_id, group_key, editado_manual from campana_contactos");
      const estado = new Map(existentes.rows.map((row) => [`${row.franchise_id}|${row.group_key}`, row.editado_manual]));
      const resumen = { leidos: contactos.length, insertados: 0, actualizados: 0, protegidos: 0, sinDatos, omitidas, advertencias, sinCoincidencia: null };
      for (const contacto of contactos) {
        const llave = `${contacto.franchiseId}|${contacto.groupKey}`;
        if (estado.get(llave) === true) {
          resumen.protegidos += 1;
          continue;
        }
        await client.query(
          `insert into campana_contactos (franchise_id, group_key, nombre, telefono, correo, recibe_correo, origen, editado_manual)
           values ($1, $2, $3, $4, $5, coalesce($6, false), 'portal', false)
           on conflict (franchise_id, group_key) do update set
             nombre = excluded.nombre,
             telefono = coalesce(excluded.telefono, campana_contactos.telefono),
             correo = coalesce(excluded.correo, campana_contactos.correo),
             recibe_correo = coalesce($6, campana_contactos.recibe_correo), updated_at = now()
           where campana_contactos.editado_manual = false`,
          [contacto.franchiseId, contacto.groupKey, contacto.nombre, contacto.telefono, contacto.correo, contacto.recibeCorreo]
        );
        if (estado.has(llave)) resumen.actualizados += 1;
        else resumen.insertados += 1;
      }
      await client.query("commit");

      // Aviso (no bloquea): nombres que no coinciden con ningún Grupo De Facturación vigente
      // de la BDD, normalmente por un error de captura. Si Drive no responde, se omite.
      try {
        const franquicias = [...new Set(contactos.map((contacto) => contacto.franchiseId))];
        const vigentes = new Set();
        for (const franchiseId of franquicias) {
          const bdd = await leerBdd(franchiseId);
          for (const cliente of bdd.clientes) vigentes.add(`${franchiseId}|${cliente.groupKey}`);
        }
        resumen.sinCoincidencia = contactos
          .filter((contacto) => !vigentes.has(`${contacto.franchiseId}|${contacto.groupKey}`))
          .map((contacto) => ({ franchiseId: contacto.franchiseId, nombre: contacto.nombre }));
      } catch (error) {
        console.error("[campanas] coincidencias", error.message);
      }
      res.json(resumen);
    } catch (err) {
      if (client) await client.query("rollback").catch(() => {});
      if (err.statusCode === 400) err.expose = true;
      next(err);
    } finally {
      client?.release();
    }
  }
);

// GET /api/campanas/contactos/plantilla?franchise=  -> plantilla .xlsx
// Los encabezados exactos, una fila por cliente vigente de la BDD (con su contacto actual si
// ya existe) y una columna de referencia con el segmento, que la carga ignora.
campanasRouter.get("/contactos/plantilla", async (req, res, next) => {
  try {
    const franquicias = resolveFranchiseScope(req.user, String(req.query.franchise ?? "todas"));
    const filas = [];
    for (const franchiseId of franquicias) {
      let clientes = [];
      try {
        clientes = (await leerBdd(franchiseId)).clientes;
      } catch (error) {
        console.error("[campanas] plantilla", error.message);
      }
      const contactos = await contactosPorGrupo(pool, franchiseId);
      for (const cliente of clientes) {
        const contacto = contactos.get(cliente.groupKey);
        filas.push({
          franquicia: PREFIJO_FRANQUICIA[franchiseId],
          grupo: cliente.grupo,
          telefono: telefonoLegible(contacto?.telefono),
          correo: contacto?.correo ? contacto.correo.replace(/, /g, "; ") : "",
          recibeCorreo: cliente.segment === "comercial" ? (contacto?.recibe_correo ? "Sí" : "No") : "",
          segmento: cliente.segment === "comercial" ? "Comercial" : "Residencial",
        });
      }
    }
    filas.sort((a, b) => a.franquicia.localeCompare(b.franquicia) || a.grupo.localeCompare(b.grupo, "es"));

    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet("Contactos", { views: [{ state: "frozen", ySplit: 1 }] });
    hoja.columns = [
      { header: "Franquicia", key: "franquicia", width: 12 },
      { header: "Grupo De Facturación", key: "grupo", width: 44 },
      { header: "Teléfono", key: "telefono", width: 20, style: { numFmt: "@" } },
      { header: "Correo", key: "correo", width: 38 },
      { header: "Recibe Correo", key: "recibeCorreo", width: 15 },
      { header: "Segmento (referencia)", key: "segmento", width: 22 },
    ];
    hoja.addRows(filas);
    const encabezado = hoja.getRow(1);
    encabezado.font = { bold: true, color: { argb: "FF063A3E" } };
    encabezado.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF21C2CC" } };
    hoja.getCell("F1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9DEE3" } };
    hoja.autoFilter = "A1:F1";
    for (let fila = 2; fila <= Math.max(filas.length + 1, 200); fila += 1) {
      hoja.getCell(`C${fila}`).numFmt = "@";
      hoja.getCell(`E${fila}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"Sí,No"'] };
      hoja.getCell(`A${fila}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"AGS,CUN,MID"'] };
    }
    const buffer = await libro.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Plantilla_Contactos_Campanas.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
});

// Errores conocidos del módulo con un mensaje que diga qué hacer, en lugar del genérico
// "Error interno del servidor": tablas sin migrar y fallas al leer Drive.
campanasRouter.use((err, _req, _res, next) => {
  if (err?.type === "entity.too.large") {
    err.statusCode = 413;
    err.expose = true;
    err.message = "El archivo supera 5 MB";
  } else if (err?.code === "42P01" && /campana_plantillas/.test(String(err.message))) {
    err.statusCode = 503;
    err.expose = true;
    err.message = "Falta aplicar en la base de datos la migración de plantillas de Campañas (20261005090000_campanas_plantillas.sql)";
  } else if (err?.code === "42P01" && /campana_/.test(String(err.message))) {
    err.statusCode = 503;
    err.expose = true;
    err.message = "Falta aplicar en la base de datos la migración del módulo Campañas (20261002090000_campanas_cobranza.sql)";
  } else if (err?.code === "23514" && /campana_plantillas/.test(String(err.message))) {
    err.statusCode = 503;
    err.expose = true;
    err.message = "Falta aplicar en la base de datos la migración de los cuatro correctivos (20261007090000_campanas_plantillas_correctivos.sql)";
  } else if (err?.code === "42703" && /mensaje|asunto|editado/.test(String(err.message))) {
    err.statusCode = 503;
    err.expose = true;
    err.message = "Falta aplicar en la base de datos la migración de plantillas de Campañas (20261005090000_campanas_plantillas.sql)";
  } else if (/^Drive respondió|credenciales de Google Drive/.test(String(err?.message))) {
    console.error("[campanas] drive", err);
    err.statusCode = 502;
    err.expose = true;
    err.message = `No se pudo leer la BDD de Drive: ${err.message.slice(0, 160)}`;
  }
  next(err);
});
