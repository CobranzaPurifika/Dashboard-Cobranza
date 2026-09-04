import { pool } from "../db/pool.js";
import { getDriveSources } from "./config.js";
import { downloadSheetAsCsv } from "./driveCsv.js";
import { parseBddCsv, parsePaymentsCsv } from "./parsers.js";

const parsers = {
  bdd: parseBddCsv,
  pagos: parsePaymentsCsv,
};

export async function runRawImport(sourceType, triggerType = "manual") {
  const sources = getDriveSources(sourceType);
  const parser = parsers[sourceType];
  const run = await createRun(sourceType, triggerType);

  try {
    // Se leen y validan todos los archivos antes de escribir una sola fila RAW.
    const downloaded = await Promise.all(
      sources.map(async (source) => ({
        source,
        rows: parser(await downloadSheetAsCsv(source.fileId)),
      }))
    );

    const client = await pool.connect();
    try {
      await client.query("begin");
      let rowsRead = 0;
      let rowsInserted = 0;

      for (const { source, rows } of downloaded) {
        rowsRead += rows.length;
        if (rows.length === 0) continue;

        const inserted = await client.query(
          `insert into import_raw_rows
             (import_run_id, source_type, source_file_id, franchise_id, source_row, row_hash, payload)
           select $1, $2, $3, $4, r.source_row, r.row_hash, r.payload
           from jsonb_to_recordset($5::jsonb)
             as r(source_row integer, row_hash text, payload jsonb)
           on conflict (source_file_id, row_hash) do nothing`,
          [run.id, sourceType, source.fileId, source.franchiseId, JSON.stringify(rows)]
        );
        rowsInserted += inserted.rowCount;
      }

      await client.query(
        `update import_runs
         set status = 'validated', rows_read = $1, rows_inserted = $2, finished_at = now()
         where id = $3`,
        [rowsRead, rowsInserted, run.id]
      );
      await client.query("commit");

      return { id: run.id, sourceType, status: "validated", rowsRead, rowsInserted };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    await pool.query(
      `update import_runs set status = 'failed', error_message = $1, finished_at = now() where id = $2`,
      [String(error.message ?? error).slice(0, 2000), run.id]
    );
    throw error;
  }
}

async function createRun(sourceType, triggerType) {
  try {
    await pool.query(
      `update import_runs
       set status = 'failed', error_message = 'La ejecución quedó interrumpida', finished_at = now()
       where source_type = $1 and status = 'running'
         and started_at < now() - interval '1 hour'`,
      [sourceType]
    );

    const { rows } = await pool.query(
      `insert into import_runs (source_type, trigger_type, status)
       values ($1, $2, 'running') returning id`,
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
