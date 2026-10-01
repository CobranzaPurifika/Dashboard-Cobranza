// Rutas del módulo Campañas (cobranza preventiva y correctiva por envío masivo asistido).
// Montadas en /api/campanas, siempre con sesión. Administradores y gestores; cada gestor
// solo ve y opera las franquicias asignadas.
import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireRole } from "../auth/authorization.js";
import { FRANCHISE_IDS, resolveFranchiseScope } from "../auth/franchiseScope.js";
import { normalizeBusinessKey } from "../imports/consolidation.js";
import { contactosPorGrupo, leerBdd, obtenerLote, registrarEnvio } from "../campanas/service.js";
import { correoDeItem } from "../campanas/reglas.js";
import { correoConfigurado, enviarCorreo, remitente } from "../campanas/correo.js";
import { normalizarCorreos, normalizarTelefono, parseContactosCsv, properCase } from "../campanas/contactos.js";
import { descargarCsv } from "../campanas/drive.js";

export const campanasRouter = Router();
campanasRouter.use(requireRole("admin", "gestor"));

const MAX_CORREOS_POR_SOLICITUD = 25;

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

async function buscarPendiente(user, { franchiseId, groupKey, regla }) {
  const franquicia = franquiciaUnica(user, franchiseId);
  const lote = await obtenerLote(pool, franquicia);
  return lote.pendientes.find((item) => item.groupKey === groupKey && item.regla === regla) ?? null;
}

// POST /api/campanas/envios  body: { franchiseId, groupKey, regla }
// Registra un recordatorio de WhatsApp enviado por el gestor (el texto se abre en WhatsApp
// desde la pantalla). El item se vuelve a calcular en el servidor.
campanasRouter.post("/envios", async (req, res, next) => {
  try {
    const item = await buscarPendiente(req.user, req.body ?? {});
    if (!item) return res.status(409).json({ error: "El recordatorio ya no está pendiente" });
    if (!item.telefono) return res.status(400).json({ error: "El cliente no tiene teléfono registrado" });
    const ids = await registrarEnvio(pool, item, "whatsapp", item.telefono, req.user.id);
    if (ids.length === 0) return res.status(409).json({ error: "Este recordatorio ya se había registrado" });
    res.status(201).json({ ids });
  } catch (err) {
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

// POST /api/campanas/correo/enviar  body: { items: [{ franchiseId, groupKey, regla }] }
// Envía los correos seleccionados (comerciales autorizados). Primero reserva el envío en la
// bitácora para que dos personas no manden el mismo correo; si el envío falla, se libera.
campanasRouter.post("/correo/enviar", async (req, res, next) => {
  try {
    if (!correoConfigurado()) return res.status(503).json({ error: "El envío de correo no está configurado en el servidor" });
    const solicitados = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!solicitados.length) return res.status(400).json({ error: "Selecciona al menos un correo" });
    if (solicitados.length > MAX_CORREOS_POR_SOLICITUD) {
      return res.status(400).json({ error: `Máximo ${MAX_CORREOS_POR_SOLICITUD} correos por solicitud` });
    }

    const resultados = [];
    for (const solicitado of solicitados) {
      const etiqueta = { groupKey: solicitado.groupKey, franchiseId: solicitado.franchiseId, regla: solicitado.regla };
      try {
        const item = await buscarPendiente(req.user, solicitado);
        if (!item || item.canal !== "correo") {
          resultados.push({ ...etiqueta, ok: false, error: "Ya no está pendiente de correo" });
          continue;
        }
        const ids = await registrarEnvio(pool, item, "correo", item.destino, req.user.id);
        if (!ids.length) {
          resultados.push({ ...etiqueta, ok: false, error: "Ya se había enviado" });
          continue;
        }
        try {
          const correo = correoDeItem(item);
          await enviarCorreo({ para: item.destino, asunto: correo.asunto, texto: correo.texto, html: correo.html });
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
    const item = await buscarPendiente(req.user, req.query);
    if (!item) return res.status(404).json({ error: "El recordatorio ya no está pendiente" });
    res.json({ para: item.destino, ...correoDeItem(item) });
  } catch (err) {
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
      return res.status(400).json({ error: "El teléfono debe tener 10 dígitos (México)" });
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
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/campanas/contactos/importar  (solo admin)
// Lee el archivo del portal en Drive (CAMPANAS_CONTACTOS_FILE_ID). Agrega clientes nuevos y
// actualiza los que vinieron del portal; nunca sobrescribe un contacto editado a mano.
campanasRouter.post("/contactos/importar", requireRole("admin"), async (_req, res, next) => {
  const fileId = process.env.CAMPANAS_CONTACTOS_FILE_ID;
  if (!fileId) return res.status(503).json({ error: "Falta configurar el archivo de contactos del portal (CAMPANAS_CONTACTOS_FILE_ID)" });
  const client = await pool.connect();
  try {
    const { contactos, omitidas } = parseContactosCsv(await descargarCsv(fileId));
    await client.query("begin");
    const existentes = await client.query("select franchise_id, group_key, editado_manual from campana_contactos");
    const estado = new Map(existentes.rows.map((row) => [`${row.franchise_id}|${row.group_key}`, row.editado_manual]));
    const resumen = { insertados: 0, actualizados: 0, protegidos: 0, omitidas };
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
           nombre = excluded.nombre, telefono = excluded.telefono, correo = excluded.correo,
           recibe_correo = coalesce($6, campana_contactos.recibe_correo), updated_at = now()
         where campana_contactos.editado_manual = false`,
        [contacto.franchiseId, contacto.groupKey, contacto.nombre, contacto.telefono, contacto.correo, contacto.recibeCorreo]
      );
      if (estado.has(llave)) resumen.actualizados += 1;
      else resumen.insertados += 1;
    }
    await client.query("commit");
    res.json(resumen);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    if (!err.statusCode && /columna requerida|vacío/.test(err.message)) err.statusCode = 400;
    next(err);
  } finally {
    client.release();
  }
});
