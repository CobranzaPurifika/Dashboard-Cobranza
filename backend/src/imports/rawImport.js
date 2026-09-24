import { pool } from "../db/pool.js";
import { getDriveSources } from "./config.js";
import { downloadSheetAsCsv } from "./driveCsv.js";
import { parseBddCsv, parsePaymentsCsv } from "./parsers.js";
import {
  buildBddSnapshot,
  buildPayments,
  evaluateSnapshotDrop,
  hasCompletePagosBatch,
  isDegenerateName,
  normalizeBusinessKey,
  normalizeInvoiceKey,
} from "./consolidation.js";

const parsers = { bdd: parseBddCsv, pagos: parsePaymentsCsv };

export async function runRawImport(sourceType, triggerType = "manual", { force = false } = {}) {
  const sources = getDriveSources(sourceType);
  const parser = parsers[sourceType];
  const run = await createRun(sourceType, triggerType);
  let rowsRead = 0;

  try {
    const downloaded = await Promise.all(
      sources.map(async (source) => ({
        source,
        rows: parser(await downloadSheetAsCsv(source.fileId, source.sheetName)),
      }))
    );
    rowsRead = downloaded.reduce((sum, item) => sum + item.rows.length, 0);
    if (sourceType === "bdd") validateCompleteBddBatch(downloaded);

    const db = await pool.connect();
    try {
      await db.query("begin");
      const rowsInserted = await storeRawRows(db, run.id, sourceType, downloaded);
      const application = sourceType === "bdd"
        ? await applyBddBatch(db, downloaded, { force })
        : await applyPayments(db, buildPayments(downloaded.flatMap((item) => item.rows)));

      await db.query(
        `update import_runs
         set status = $1, rows_read = $2, rows_inserted = $3, rows_applied = $4,
             details = $5::jsonb, finished_at = now()
         where id = $6`,
        [application.status, rowsRead, rowsInserted, application.rowsApplied,
          JSON.stringify(application.details), run.id]
      );
      await db.query("commit");
      return {
        id: run.id, sourceType, status: application.status, rowsRead, rowsInserted,
        rowsApplied: application.rowsApplied, details: application.details,
      };
    } catch (error) {
      await db.query("rollback");
      throw error;
    } finally {
      db.release();
    }
  } catch (error) {
    if (sourceType === "bdd" && error.statusCode === 422) {
      const details = { reason: error.message, incompleteBatch: true };
      await pool.query(
        `update import_runs
         set status = 'skipped', rows_read = $1, rows_applied = 0,
             details = $2::jsonb, error_message = null, finished_at = now()
         where id = $3`,
        [rowsRead, JSON.stringify(details), run.id]
      );
      return {
        id: run.id, sourceType, status: "skipped", rowsRead,
        rowsInserted: 0, rowsApplied: 0, details,
      };
    }
    await pool.query(
      `update import_runs set status = 'failed', error_message = $1, finished_at = now() where id = $2`,
      [String(error.message ?? error).slice(0, 2000), run.id]
    );
    throw error;
  }
}

// El botón Actualizar: valida las 3 antigüedades de saldos y la base de Pagos ANTES de tocar
// la BDD -- si falta alguna, no se aplica nada. Los pagos se insertan primero (contra los
// clientes vigentes antes de esta corrida) para que, al decidir qué cliente ausente de la BDD
// ya se pagó, se use el Pagos recién subido y no el de una corrida anterior; ya no queda nadie
// en un estado intermedio esperando la siguiente corrida.
export async function runAllImports(triggerType = "manual", { force = false } = {}) {
  const bddRun = await createRun("bdd", triggerType);
  const pagosRun = await createRun("pagos", triggerType);
  let bddRowsRead = 0;
  let pagosRowsRead = 0;

  try {
    const [bddDownloaded, pagosDownloaded] = await Promise.all([
      downloadSources("bdd"),
      downloadSources("pagos"),
    ]);
    bddRowsRead = bddDownloaded.reduce((sum, item) => sum + item.rows.length, 0);
    pagosRowsRead = pagosDownloaded.reduce((sum, item) => sum + item.rows.length, 0);
    validateCompleteBddAndPagosBatch(bddDownloaded, pagosDownloaded);

    const db = await pool.connect();
    try {
      await db.query("begin");
      const bddRowsInserted = await storeRawRows(db, bddRun.id, "bdd", bddDownloaded);
      const pagosRowsInserted = await storeRawRows(db, pagosRun.id, "pagos", pagosDownloaded);

      const pagosApplication = await applyPayments(
        db, buildPayments(pagosDownloaded.flatMap((item) => item.rows))
      );
      const bddApplication = await applyBddBatch(db, bddDownloaded, { force });

      if (bddApplication.status !== "applied") {
        await db.query("rollback");
        return finishUnappliedJointRun({
          bddRun, pagosRun, bddRowsRead, pagosRowsRead, bddApplication,
        });
      }

      await Promise.all([
        db.query(
          `update import_runs
           set status = $1, rows_read = $2, rows_inserted = $3, rows_applied = $4,
               details = $5::jsonb, finished_at = now()
           where id = $6`,
          [bddApplication.status, bddRowsRead, bddRowsInserted, bddApplication.rowsApplied,
            JSON.stringify(bddApplication.details), bddRun.id]
        ),
        db.query(
          `update import_runs
           set status = $1, rows_read = $2, rows_inserted = $3, rows_applied = $4,
               details = $5::jsonb, finished_at = now()
           where id = $6`,
          [pagosApplication.status, pagosRowsRead, pagosRowsInserted, pagosApplication.rowsApplied,
            JSON.stringify(pagosApplication.details), pagosRun.id]
        ),
      ]);
      await db.query("commit");
      return {
        bdd: {
          id: bddRun.id, sourceType: "bdd", status: bddApplication.status, rowsRead: bddRowsRead,
          rowsInserted: bddRowsInserted, rowsApplied: bddApplication.rowsApplied,
          details: bddApplication.details,
        },
        pagos: {
          id: pagosRun.id, sourceType: "pagos", status: pagosApplication.status, rowsRead: pagosRowsRead,
          rowsInserted: pagosRowsInserted, rowsApplied: pagosApplication.rowsApplied,
          details: pagosApplication.details,
        },
      };
    } catch (error) {
      await db.query("rollback");
      throw error;
    } finally {
      db.release();
    }
  } catch (error) {
    if (error.statusCode === 422) {
      const details = { reason: error.message, incompleteBatch: true };
      await Promise.all([
        pool.query(
          `update import_runs
           set status = 'skipped', rows_read = $1, rows_applied = 0,
               details = $2::jsonb, error_message = null, finished_at = now()
           where id = $3`,
          [bddRowsRead, JSON.stringify(details), bddRun.id]
        ),
        pool.query(
          `update import_runs
           set status = 'skipped', rows_read = $1, rows_applied = 0,
               details = $2::jsonb, error_message = null, finished_at = now()
           where id = $3`,
          [pagosRowsRead, JSON.stringify(details), pagosRun.id]
        ),
      ]);
      return {
        bdd: { id: bddRun.id, sourceType: "bdd", status: "skipped", rowsRead: bddRowsRead, rowsInserted: 0, rowsApplied: 0, details },
        pagos: { id: pagosRun.id, sourceType: "pagos", status: "skipped", rowsRead: pagosRowsRead, rowsInserted: 0, rowsApplied: 0, details },
      };
    }
    const message = String(error.message ?? error).slice(0, 2000);
    await Promise.all([
      pool.query(`update import_runs set status = 'failed', error_message = $1, finished_at = now() where id = $2`, [message, bddRun.id]),
      pool.query(`update import_runs set status = 'failed', error_message = $1, finished_at = now() where id = $2`, [message, pagosRun.id]),
    ]);
    throw error;
  }
}

// bddApplication.status es "needs_confirmation" (cayó más del umbral, se le pregunta al
// administrador si aplicar de todas formas) o "skipped" (lote incompleto). En ambos casos no se
// aplicó nada -- Pagos tampoco, aunque ya se hubiera insertado en esta transacción, por el rollback.
async function finishUnappliedJointRun({ bddRun, pagosRun, bddRowsRead, pagosRowsRead, bddApplication }) {
  const status = bddApplication.status;
  await Promise.all([
    pool.query(
      `update import_runs
       set status = $1, rows_read = $2, rows_applied = 0, details = $3::jsonb, finished_at = now()
       where id = $4`,
      [status, bddRowsRead, JSON.stringify(bddApplication.details), bddRun.id]
    ),
    pool.query(
      `update import_runs
       set status = $1, rows_read = $2, rows_applied = 0,
           details = $3::jsonb, finished_at = now()
       where id = $4`,
      [status, pagosRowsRead, JSON.stringify({ reason: "BDD no se aplicó; Pagos tampoco se aplica en esta corrida" }), pagosRun.id]
    ),
  ]);
  return {
    bdd: { id: bddRun.id, sourceType: "bdd", status, rowsRead: bddRowsRead, rowsInserted: 0, rowsApplied: 0, details: bddApplication.details },
    pagos: { id: pagosRun.id, sourceType: "pagos", status, rowsRead: pagosRowsRead, rowsInserted: 0, rowsApplied: 0, details: { reason: "BDD no se aplicó" } },
  };
}

async function downloadSources(sourceType) {
  const sources = getDriveSources(sourceType);
  const parser = parsers[sourceType];
  return Promise.all(
    sources.map(async (source) => ({
      source,
      rows: parser(await downloadSheetAsCsv(source.fileId, source.sheetName)),
    }))
  );
}

export function validateCompleteBddBatch(downloaded) {
  const problems = bddBatchProblems(downloaded);
  if (problems.length > 0) {
    const error = new Error(`BDD no actualizada; el lote de 3 franquicias está incompleto (${problems.join("; ")})`);
    error.statusCode = 422;
    throw error;
  }
}

export function validateCompleteBddAndPagosBatch(bddDownloaded, pagosDownloaded) {
  const problems = bddBatchProblems(bddDownloaded);
  for (const item of pagosDownloaded) {
    if (!hasCompletePagosBatch(item.rows)) problems.push(`${item.source.label}: sin pagos válidos`);
  }
  if (problems.length > 0) {
    const error = new Error(`Actualización cancelada; faltan datos completos de BDD y/o Pagos (${problems.join("; ")})`);
    error.statusCode = 422;
    throw error;
  }
}

function bddBatchProblems(downloaded) {
  if (downloaded.length !== 3) return ["La corrida BDD requiere exactamente 3 franquicias"];
  const problems = [];
  for (const item of downloaded) {
    if (item.rows.length === 0) {
      problems.push(`${item.source.label}: solo encabezados`);
      continue;
    }
    const snapshot = buildBddSnapshot(item.source.franchiseId, item.rows);
    if (snapshot.clients.length === 0 || snapshot.invoiceCount === 0) {
      problems.push(`${item.source.label}: sin cartera válida`);
    }
  }
  return problems;
}

async function storeRawRows(db, runId, sourceType, downloaded) {
  let inserted = 0;
  for (const { source, rows } of downloaded) {
    if (rows.length === 0) continue;
    const result = await db.query(
      `insert into import_raw_rows
         (import_run_id, source_type, source_file_id, franchise_id, source_row, row_hash, payload)
       select $1, $2, $3, $4, r.source_row, r.row_hash, r.payload
       from jsonb_to_recordset($5::jsonb)
         as r(source_row integer, row_hash text, payload jsonb)
       on conflict (source_file_id, row_hash) do nothing`,
      [runId, sourceType, source.fileId, source.franchiseId, JSON.stringify(rows)]
    );
    inserted += result.rowCount;
  }
  return inserted;
}

async function applyBddBatch(db, downloaded, { force = false } = {}) {
  const snapshots = downloaded.map(({ source, rows }) => buildBddSnapshot(source.franchiseId, rows));
  const details = { franchises: {}, threshold: null };
  const prepared = [];

  for (const snapshot of snapshots) {
    const context = await loadFranchiseContext(db, snapshot.franchiseId);
    resolveSnapshotClients(snapshot, context);
    const presentIds = new Set(snapshot.clients.map((client) => client.id));
    const absent = context.clients.filter(
      (client) => client.portfolio_status === "active" && !presentIds.has(client.id)
    );
    const settled = absent.filter((client) => hasFullPaymentEvidence(client, context));
    const settledIds = new Set(settled.map((client) => client.id));
    const fueraDeCartera = absent.filter((client) => !settledIds.has(client.id));
    const check = evaluateSnapshotDrop({
      previousCount: context.clients.filter((client) => client.portfolio_status === "active").length,
      previousBalance: context.clients
        .filter((client) => client.portfolio_status === "active")
        .reduce((sum, client) => sum + Number(client.saldo), 0),
      nextCount: snapshot.clientCount,
      nextBalance: snapshot.balance,
      confirmedSettledCount: settled.length,
      confirmedSettledBalance: settled.reduce((sum, client) => sum + Number(client.saldo), 0),
    });
    details.threshold = check.threshold;
    details.franchises[snapshot.franchiseId] = {
      clients: snapshot.clientCount, invoices: snapshot.invoiceCount, balance: snapshot.balance,
      settled: settled.length, fueraDeCartera: fueraDeCartera.length,
      clientDrop: check.clientDrop, balanceDrop: check.balanceDrop,
    };
    prepared.push({ snapshot, settled, fueraDeCartera, check });
  }

  const anomalies = prepared.filter(({ check }) => check.anomalous);
  if (anomalies.length > 0) {
    const affected = anomalies.map(({ snapshot }) => snapshot.franchiseId).join(", ");
    if (!force) {
      return {
        status: "needs_confirmation", rowsApplied: 0,
        details: {
          ...details,
          reason: `Caída superior al umbral (${Math.round(details.threshold * 100)}%) en: ${affected}`,
          anomalousFranchises: anomalies.map(({ snapshot }) => snapshot.franchiseId),
        },
      };
    }
    details.forcedPastThreshold = affected;
  }

  await captureMonthlyPortfolioBaseline(db);
  await reconcilePromises(db);
  let rowsApplied = 0;
  for (const item of prepared) rowsApplied += await persistBddSnapshot(db, item);
  await attachUnmatchedPaymentsByInvoice(db);
  await reconcilePromises(db);
  return { status: "applied", rowsApplied, details };
}

// El primer BDD aplicado de cada mes conserva el último estado del mes anterior.
// Si ya hubo una importación BDD este mes, no intenta reconstruir un cierre pasado
// con datos actuales. Así los deltas siempre parten de un corte real.
async function captureMonthlyPortfolioBaseline(db) {
  const existingRun = await db.query(
    `select 1
     from import_runs
     where source_type = 'bdd' and status = 'applied'
       and finished_at >= date_trunc('month', now() at time zone 'America/Mexico_City')
     limit 1`
  );
  if (existingRun.rows.length > 0) return;

  await db.query(
    `with client_totals as (
       select franchise_id, coalesce(sum(saldo), 0)::numeric as saldo_total
       from clientes
       where portfolio_status = 'active'
       group by franchise_id
     ), invoice_totals as (
       select c.franchise_id,
         coalesce(sum(f.monto), 0)::numeric as total_facturado,
         coalesce(sum(f.monto) filter (where f.dias_vencida <= 0), 0)::numeric as al_corriente,
         coalesce(sum(f.monto) filter (where f.dias_vencida > 0), 0)::numeric as vencida,
         coalesce(sum(f.monto) filter (where f.dias_vencida > 60), 0)::numeric as mas60
       from facturas f
       join clientes c on c.id = f.cliente_id
       where c.portfolio_status = 'active'
       group by c.franchise_id
     ), detail as (
       select c.franchise_id, c.saldo_total, i.total_facturado,
              i.al_corriente, i.vencida, i.mas60
       from client_totals c
       join invoice_totals i using (franchise_id)
       where i.total_facturado > 0
     ), snapshots as (
       select franchise_id,
              round(al_corriente / total_facturado * 100, 1) as al_corriente_pct,
              round(vencida / total_facturado * 100, 1) as cartera_vencida_pct,
              mas60 as tramo_60_mas_monto, saldo_total
       from detail
       union all
       select 'todas',
              round(sum(al_corriente) / nullif(sum(total_facturado), 0) * 100, 1),
              round(sum(vencida) / nullif(sum(total_facturado), 0) * 100, 1),
              sum(mas60), sum(saldo_total)
       from detail
     )
     insert into portfolio_snapshots
       (franchise_id, fecha_corte, tipo_corte, al_corriente_pct,
        cartera_vencida_pct, tramo_60_mas_monto, saldo_total)
     select franchise_id,
            (date_trunc('month', now() at time zone 'America/Mexico_City')::date - 1),
            'Mensual', al_corriente_pct, cartera_vencida_pct,
            tramo_60_mas_monto, saldo_total
     from snapshots
     on conflict do nothing`
  );
}

async function loadFranchiseContext(db, franchiseId) {
  const [clients, invoices, mappings, payments] = await Promise.all([
    db.query(
      `select id, name, franchise_id, saldo::float, portfolio_status, last_bdd_seen_at
       from clientes where franchise_id = $1`, [franchiseId]
    ),
    db.query(
      `select f.id, f.cliente_id, f.folio, f.monto::float
       from facturas f join clientes c on c.id = f.cliente_id
       where c.franchise_id = $1`, [franchiseId]
    ),
    db.query(`select folio, cliente_id from invoice_client_keys where franchise_id = $1`, [franchiseId]),
    db.query(
      `select id, cliente_id, factura, fecha_iso, monto::float
       from pagos where franchise_id = $1 and monto > 0`, [franchiseId]
    ),
  ]);
  const invoicesByClient = groupBy(invoices.rows, (row) => row.cliente_id);
  return {
    clients: clients.rows.map((client) => ({ ...client, invoices: invoicesByClient.get(client.id) ?? [] })),
    clientsByName: new Map(clients.rows.map((row) => [normalizeBusinessKey(row.name), row])),
    clientsById: new Map(clients.rows.map((row) => [row.id, row])),
    mappingByInvoice: new Map(
      mappings.rows.map((row) => [normalizeInvoiceKey(row.folio), row.cliente_id])
    ),
    paymentsByInvoice: groupBy(payments.rows, (row) => normalizeInvoiceKey(row.factura)),
  };
}

export function resolveSnapshotClients(snapshot, context) {
  const claimed = new Map();
  const invoiceClaimed = new Map();
  for (const imported of snapshot.clients) {
    for (const invoice of imported.invoices) {
      const key = normalizeInvoiceKey(invoice.folio);
      if (invoiceClaimed.has(key) && invoiceClaimed.get(key) !== imported.groupKey) {
        throw new Error(`${snapshot.franchiseId}: la factura ${invoice.folio} aparece en dos grupos`);
      }
      invoiceClaimed.set(key, imported.groupKey);
    }
    const invoiceMatches = new Set(imported.invoices
      .map((invoice) => context.mappingByInvoice.get(normalizeInvoiceKey(invoice.folio)))
      .filter(Boolean));
    // Los folios se reasignan con el tiempo entre clientes reales distintos, así que el
    // historial de facturas a veces queda ambiguo. Si el nombre del grupo ya identifica sin
    // duda a un cliente existente, se prefiere ese nombre sobre facturas históricas dudosas.
    const byName = context.clientsByName.get(imported.groupKey)?.id;
    if (invoiceMatches.size > 1 && !byName) {
      throw new Error(`${snapshot.franchiseId}: las facturas de ${imported.name} apuntan a clientes distintos`);
    }
    const byInvoice = invoiceMatches.size === 1 ? [...invoiceMatches][0] : undefined;
    let id = byInvoice || byName || imported.idCandidate;
    const collision = context.clientsById.get(id);
    const dbConflict = !byInvoice && !byName
      && collision && normalizeBusinessKey(collision.name) !== imported.groupKey;
    // Dos grupos nuevos de esta misma corrida (o un grupo nuevo cuyo folio quedó ligado por
    // error a otro cliente ya existente) pueden resolver al mismo id -- se conserva el primero
    // y el resto se registra como cliente aparte en vez de abortar toda la corrida.
    const batchConflict = claimed.has(id) && claimed.get(id) !== imported.groupKey;
    if (dbConflict || batchConflict) {
      id = `${imported.idCandidate.slice(0, 43)}-${shortHash(imported.groupKey)}`;
    }
    if (isDegenerateName(imported.name) && !byInvoice && !byName) {
      throw new Error(`${snapshot.franchiseId}: Grupo De Facturación inválido sin historial (${imported.name})`);
    }
    if (claimed.has(id) && claimed.get(id) !== imported.groupKey) {
      throw new Error(`${snapshot.franchiseId}: dos grupos intentan usar el ClienteId ${id}`);
    }
    claimed.set(id, imported.groupKey);
    imported.id = id;
    imported.persistedName = isDegenerateName(imported.name) && collision ? collision.name : imported.name;
  }
}

function hasFullPaymentEvidence(client, context) {
  if (client.invoices.length === 0) return false;
  const seenDate = dateOnly(client.last_bdd_seen_at);
  return client.invoices.every((invoice) => {
    const payments = context.paymentsByInvoice.get(normalizeInvoiceKey(invoice.folio)) ?? [];
    const paid = payments
      .filter((payment) => !seenDate || dateOnly(payment.fecha_iso) >= seenDate)
      .reduce((sum, payment) => sum + Number(payment.monto), 0);
    return paid + 0.005 >= Number(invoice.monto);
  });
}

async function persistBddSnapshot(db, { snapshot, settled, fueraDeCartera }) {
  const clientRows = snapshot.clients.map((client) => ({
    id: client.id, name: client.persistedName, rfc: client.rfc || null,
    segment: client.segment, segment_label: client.segmentLabel, saldo: client.balance,
    tramo: client.tramo, tramo_label: client.tramoLabel,
  }));
  await db.query(
    `insert into clientes
       (id, name, franchise_id, rfc, segment, segment_label, saldo, tramo, tramo_label,
        agenda_active, is_blacklisted, portfolio_status, last_bdd_seen_at, updated_at)
     select r.id, r.name, $1, r.rfc, r.segment, r.segment_label, r.saldo,
            r.tramo, r.tramo_label, false, false, 'active', now(), now()
     from jsonb_to_recordset($2::jsonb) as r(
       id text, name text, rfc text, segment text, segment_label text,
       saldo numeric, tramo text, tramo_label text
     )
       on conflict (id) do update set
         name = excluded.name, rfc = excluded.rfc, segment = excluded.segment,
         segment_label = excluded.segment_label, saldo = excluded.saldo,
         tramo = excluded.tramo, tramo_label = excluded.tramo_label,
         portfolio_status = 'active',
         last_bdd_seen_at = now(), updated_at = now()`,
    [snapshot.franchiseId, JSON.stringify(clientRows)]
  );

  const clientIds = snapshot.clients.map((client) => client.id);
  await db.query(`delete from facturas where cliente_id = any($1::text[])`, [clientIds]);
  const invoiceRows = snapshot.clients.flatMap((client) => client.invoices.map((invoice) => ({
    cliente_id: client.id, folio: invoice.folio, monto: invoice.balance,
    dias_vencida: invoice.overdueDays, fecha_facturacion: invoice.invoiceDate,
    ejecutivo_ventas: invoice.salesExecutive, ejecutivo_cobranza: invoice.collectionExecutive,
    cliente_nombre: invoice.clienteNombre,
  })));
  await db.query(
    `insert into facturas
       (cliente_id, folio, monto, dias_vencida, fecha_facturacion, ejecutivo_ventas, ejecutivo_cobranza, cliente_nombre)
     select cliente_id, folio, monto, dias_vencida, fecha_facturacion, ejecutivo_ventas, ejecutivo_cobranza, cliente_nombre
     from jsonb_to_recordset($1::jsonb) as r(
       cliente_id text, folio text, monto numeric, dias_vencida integer,
       fecha_facturacion date, ejecutivo_ventas text, ejecutivo_cobranza text, cliente_nombre text
     )`,
    [JSON.stringify(invoiceRows)]
  );
  await db.query(
    `insert into invoice_client_keys (franchise_id, folio, cliente_id)
     select $1, folio, cliente_id
     from jsonb_to_recordset($2::jsonb) as r(folio text, cliente_id text)
     on conflict (franchise_id, folio) do update
     set cliente_id = excluded.cliente_id, last_seen_at = now()`,
    [snapshot.franchiseId, JSON.stringify(invoiceRows.map(({ folio, cliente_id }) => ({ folio, cliente_id })))]
  );

  if (fueraDeCartera.length > 0) await markFueraDeCartera(db, fueraDeCartera.map((client) => client.id));
  if (settled.length > 0) await settleClients(db, settled.map((client) => client.id));
  return snapshot.clients.length + invoiceRows.length + fueraDeCartera.length + settled.length;
}

async function applyPayments(db, payments) {
  const [mappings, clients] = await Promise.all([
    db.query(`select franchise_id, folio, cliente_id from invoice_client_keys`),
    db.query(`select id, name, franchise_id from clientes`),
  ]);
  const invoiceMap = new Map(mappings.rows.map((row) => [
    `${row.franchise_id}|${normalizeInvoiceKey(row.folio)}`, row.cliente_id,
  ]));
  const nameMap = new Map(clients.rows.map((row) => [
    `${row.franchise_id}|${normalizeBusinessKey(row.name)}`, row.id,
  ]));
  const rows = payments.map((payment) => ({
    cliente_id: invoiceMap.get(`${payment.franchiseId}|${normalizeInvoiceKey(payment.invoice)}`)
      || nameMap.get(`${payment.franchiseId}|${payment.groupKey}`) || null,
    franchise_id: payment.franchiseId,
    grupo_facturacion: payment.groupName || null,
    fecha_iso: payment.paymentDate,
    monto: payment.amount,
    forma: payment.paymentMethod,
    folio: payment.reference || null,
    factura: payment.invoice,
    dedupe_key: payment.dedupeKey,
  }));
  const result = rows.length === 0 ? { rows: [], rowCount: 0 } : await db.query(
    `insert into pagos
       (cliente_id, franchise_id, grupo_facturacion, fecha_iso, monto, forma, folio, factura, dedupe_key)
     select cliente_id, franchise_id, grupo_facturacion, fecha_iso, monto, forma, folio, factura, dedupe_key
     from jsonb_to_recordset($1::jsonb) as r(
       cliente_id text, franchise_id text, grupo_facturacion text, fecha_iso date,
       monto numeric, forma text, folio text, factura text, dedupe_key text
     )
     on conflict (dedupe_key) where dedupe_key is not null do nothing
     returning cliente_id`,
    [JSON.stringify(rows)]
  );
  const inserted = result.rowCount;
  const matched = result.rows.filter((row) => row.cliente_id).length;
  await attachUnmatchedPaymentsByInvoice(db);
  const promisesFulfilled = await reconcilePromises(db);
  return {
    status: "applied", rowsApplied: inserted,
    details: { validPayments: payments.length, inserted, matched, promisesFulfilled },
  };
}

async function attachUnmatchedPaymentsByInvoice(db) {
  await db.query(
    `update pagos p set cliente_id = k.cliente_id
     from invoice_client_keys k
     where p.cliente_id is null and p.franchise_id = k.franchise_id
       and lower(regexp_replace(coalesce(p.factura,''), '\\s+', '', 'g')) =
           lower(regexp_replace(k.folio, '\\s+', '', 'g'))`
  );
}

async function reconcilePromises(db) {
  const result = await db.query(
    `with matches as (
       select distinct on (pp.id) pp.id as promise_id, pp.cliente_id, p.id as payment_id, p.fecha_iso
       from payment_promises pp join pagos p on p.cliente_id = pp.cliente_id and p.monto > 0
         and p.fecha_iso between pp.gestion_iso and pp.deadline_iso
       where pp.status = 'active' order by pp.id, p.fecha_iso, p.id
     ), fulfilled as (
       update payment_promises pp
       set status = 'fulfilled', fulfilled_at = m.fecha_iso, fulfilled_payment_id = m.payment_id
       from matches m where pp.id = m.promise_id returning pp.cliente_id
     )
     update clientes c set promise_gestion_iso = null, promise_deadline_iso = null, updated_at = now()
     where c.id in (select cliente_id from fulfilled) returning c.id`
  );
  return result.rowCount;
}

// El cliente desaparece de las vistas activas de inmediato -- sin esperar la siguiente
// corrida -- pero conserva su timeline, notas y facturas para consulta histórica.
async function markFueraDeCartera(db, clientIds) {
  await db.query(
    `update payment_promises set status = 'cancelled'
     where cliente_id = any($1::text[]) and status = 'active'`, [clientIds]
  );
  await db.query(
    `update clientes set portfolio_status = 'fuera_de_cartera',
       agenda_active = false, agenda_fecha_iso = null, agenda_hora = null,
       agenda_nota = null, agenda_detail = null,
       promise_gestion_iso = null, promise_deadline_iso = null, updated_at = now()
     where id = any($1::text[])`, [clientIds]
  );
}

async function settleClients(db, clientIds) {
  await db.query(
    `update payment_promises set status = 'cancelled'
     where cliente_id = any($1::text[]) and status = 'active'`, [clientIds]
  );
  await db.query(`delete from blacklist where id = any($1::text[])`, [clientIds]);
  await db.query(
    `update clientes set saldo = 0, tramo = 'good', tramo_label = 'Al corriente',
       portfolio_status = 'settled',
       is_blacklisted = false, agenda_active = false, agenda_fecha_iso = null,
       agenda_hora = null, agenda_nota = null, agenda_detail = null,
       promise_gestion_iso = null, promise_deadline_iso = null, updated_at = now()
     where id = any($1::text[])`, [clientIds]
  );
  await db.query(`delete from facturas where cliente_id = any($1::text[])`, [clientIds]);
}

function groupBy(rows, keyFor) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  return grouped;
}

function shortHash(value) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36).slice(0, 8);
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

async function createRun(sourceType, triggerType) {
  try {
    await pool.query(
      `update import_runs set status = 'failed', error_message = 'La ejecución quedó interrumpida', finished_at = now()
       where source_type = $1 and status = 'running' and started_at < now() - interval '1 hour'`,
      [sourceType]
    );
    const { rows } = await pool.query(
      `insert into import_runs (source_type, trigger_type, status) values ($1, $2, 'running') returning id`,
      [sourceType, triggerType]
    );
    return rows[0];
  } catch (error) {
    if (error.code === "23505") {
      const conflict = new Error(`Ya existe una importación ${sourceType} en curso`);
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }
}
