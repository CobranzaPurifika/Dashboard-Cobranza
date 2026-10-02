// Servicio del módulo Campañas: lee la BDD de Drive (solo lectura), la cruza con el estado
// de la app (lista negra, promesas vigentes, pagos recientes), con el directorio de
// contactos y con la bitácora de envíos, y arma el lote del día.
//
// No escribe en clientes, facturas, pagos ni gestion_timeline.
import { mexicoTodayISO, addCalendarDays } from "../domain/dates.js";
import { getDriveSources } from "../imports/config.js";
import { normalizeBusinessKey, normalizeInvoiceKey } from "../imports/consolidation.js";
import { parseBddCsv } from "../imports/parsers.js";
import { agruparClientes, extraerFacturas } from "./bdd.js";
import { REGLAS } from "./config.js";
import { descargarCsv, fechaModificacion } from "./drive.js";
import { construirLote, diasEntre, llaveEnvio } from "./reglas.js";

const CACHE_MINUTOS = 10;
const cacheBdd = new Map();

// BDD de una franquicia, con caché corta para no descargar Drive en cada clic.
export async function leerBdd(franchiseId, { refrescar = false } = {}) {
  const hoyISO = mexicoTodayISO();
  const enCache = cacheBdd.get(franchiseId);
  if (!refrescar && enCache && enCache.hoyISO === hoyISO && Date.now() - enCache.leidoEn < CACHE_MINUTOS * 60_000) {
    return enCache;
  }
  const fuente = getDriveSources("bdd").find((source) => source.franchiseId === franchiseId);
  if (!fuente) throw new Error(`Sin BDD configurada para ${franchiseId}`);
  const [csv, modificado] = await Promise.all([descargarCsv(fuente.fileId), fechaModificacion(fuente.fileId)]);
  const clientes = agruparClientes(extraerFacturas(franchiseId, parseBddCsv(csv)));
  const modificadoISO = modificado ? mexicoTodayISO(new Date(modificado)) : null;
  const resultado = {
    franchiseId,
    hoyISO,
    leidoEn: Date.now(),
    clientes,
    fuente: {
      archivo: fuente.label,
      modificadoEn: modificado,
      desactualizada: modificadoISO ? diasEntre(modificadoISO, hoyISO) > REGLAS.bddVigenciaDias : true,
    },
  };
  cacheBdd.set(franchiseId, resultado);
  return resultado;
}

// Relaciona cada cliente de la BDD con el cliente de la app: primero por folio (como la
// importación oficial) y si no, por Grupo De Facturación normalizado.
async function estadoApp(db, franchiseId, clientes, hoyISO) {
  const { rows } = await db.query(
    `select c.id, c.name, c.is_blacklisted, c.estatus_value, c.promise_deadline_iso::text as promesa_hasta,
            coalesce(array_agg(f.folio) filter (where f.folio is not null), '{}') as folios
     from clientes c left join facturas f on f.cliente_id = c.id
     where c.franchise_id = $1
     group by c.id`,
    [franchiseId]
  );
  const porFolio = new Map();
  const porNombre = new Map();
  for (const row of rows) {
    porNombre.set(normalizeBusinessKey(row.name), row);
    for (const folio of row.folios) porFolio.set(normalizeInvoiceKey(folio), row);
  }
  const estado = new Map();
  for (const cliente of clientes) {
    const row = cliente.facturas.map((factura) => porFolio.get(normalizeInvoiceKey(factura.folio))).find(Boolean)
      ?? porNombre.get(cliente.groupKey);
    if (!row) continue;
    estado.set(cliente.groupKey, {
      id: row.id,
      enListaNegra: row.is_blacklisted === true,
      promesaVigente: row.estatus_value === "promesa_pago" && Boolean(row.promesa_hasta) && row.promesa_hasta >= hoyISO,
    });
  }
  return estado;
}

async function foliosPagados(db, franchiseId, desdeISO) {
  const { rows } = await db.query(
    `select p.factura from pagos p left join clientes c on c.id = p.cliente_id
     where coalesce(p.franchise_id, c.franchise_id) = $1 and p.monto > 0 and p.fecha_iso >= $2::date`,
    [franchiseId, desdeISO]
  );
  return new Set(rows.map((row) => normalizeInvoiceKey(row.factura)));
}

async function enviados(db, franchiseId) {
  const { rows } = await db.query(
    `select group_key, regla, periodo from campana_envios
     where franchise_id = $1 and enviado_at >= now() - interval '120 days'`,
    [franchiseId]
  );
  return new Set(rows.map((row) => llaveEnvio(row.group_key, row.regla, row.periodo)));
}

export async function contactosPorGrupo(db, franchiseId) {
  const { rows } = await db.query(`select * from campana_contactos where franchise_id = $1`, [franchiseId]);
  return new Map(rows.map((row) => [row.group_key, row]));
}

export async function obtenerLote(db, franchiseId, opciones = {}) {
  const bdd = await leerBdd(franchiseId, opciones);
  const hoyISO = mexicoTodayISO();
  const desdePago = addCalendarDays(
    bdd.fuente.modificadoEn ? [mexicoTodayISO(new Date(bdd.fuente.modificadoEn)), hoyISO].sort()[0] : hoyISO,
    -REGLAS.pagoRecienteDias
  );
  const [estado, pagados, yaEnviados, contactos] = await Promise.all([
    estadoApp(db, franchiseId, bdd.clientes, hoyISO),
    foliosPagados(db, franchiseId, desdePago),
    enviados(db, franchiseId),
    contactosPorGrupo(db, franchiseId),
  ]);
  const lote = construirLote({
    hoyISO,
    franchiseId,
    clientes: bdd.clientes,
    estadoApp: estado,
    foliosPagados: pagados,
    enviados: yaEnviados,
    contactos,
  });
  return { ...lote, fuente: bdd.fuente };
}

// Registra el envío de un item del lote: una fila por periodo (por factura en preventivo,
// por recordatorio del mes en correctivo). La llave única evita duplicados aunque dos
// personas lo marquen al mismo tiempo. Devuelve los ids insertados.
export async function registrarEnvio(db, item, canal, destino, userId) {
  const ids = [];
  for (const periodo of item.periodos) {
    const facturas = item.regla === "preventivo"
      ? item.facturas.filter((factura) => factura.folio === periodo)
      : item.facturas;
    const monto = Math.round(facturas.reduce((suma, factura) => suma + factura.saldo, 0) * 100) / 100;
    const { rows } = await db.query(
      `insert into campana_envios
         (franchise_id, group_key, cliente_nombre, cliente_id, regla, periodo, canal, destino, folios, monto, enviado_por)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (franchise_id, group_key, regla, periodo) do nothing
       returning id`,
      [item.franchiseId, item.groupKey, item.nombre, item.clienteId, item.regla, periodo, canal, destino,
        facturas.map((factura) => factura.folio), monto, userId]
    );
    if (rows[0]) ids.push(rows[0].id);
  }
  return ids;
}
