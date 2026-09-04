import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { pool } from "../db/pool.js";
import { runRawImport } from "../imports/rawImport.js";

export const importacionesRouter = Router();
importacionesRouter.use(requireImportKey);

importacionesRouter.get("/", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select id, source_type, trigger_type, status, rows_read, rows_inserted,
              error_message, started_at, finished_at
       from import_runs order by started_at desc limit 30`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// El botón manual llama exactamente esta ruta. Siempre relee los mismos archivos de Drive.
importacionesRouter.post("/:sourceType/sync", async (req, res, next) => {
  const { sourceType } = req.params;
  if (!["bdd", "pagos"].includes(sourceType)) {
    return res.status(400).json({ error: "sourceType debe ser bdd o pagos" });
  }

  try {
    const result = await runRawImport(sourceType, "manual");
    res.status(201).json(result);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

function requireImportKey(req, res, next) {
  const expected = process.env.IMPORT_MANUAL_KEY;
  const provided = req.get("x-import-key");
  if (!expected) {
    return res.status(503).json({ error: "La sincronización manual todavía no está configurada" });
  }
  if (!provided || !safeEqual(provided, expected)) {
    return res.status(401).json({ error: "No autorizado" });
  }
  next();
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
