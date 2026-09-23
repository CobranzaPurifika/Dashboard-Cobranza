import { Router } from "express";
import { pool } from "../db/pool.js";
import { runAllImports, runRawImport } from "../imports/rawImport.js";
import { runMonthlySnapshots } from "../jobs/monthlySnapshots.js";
import { requireRole } from "../auth/authorization.js";

export const importacionesRouter = Router();
importacionesRouter.use(requireRole("admin"));

importacionesRouter.get("/", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select id, source_type, trigger_type, status, rows_read, rows_inserted,
              rows_applied, details, error_message, started_at, finished_at
       from import_runs order by started_at desc limit 30`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// Actualización administrativa: BDD completa y, solo si se aplicó, Pagos. Al final recalcula
// también el corte del mes en curso (kpi_snapshots/vencida_snapshots) con los pagos recién
// importados -- si esto falla no debe tumbar la respuesta del sync, que ya se aplicó.
// force = true: aplica de todas formas aunque la caída de clientes/saldo supere el umbral de
// anomalía; el administrador ya confirmó esto tras ver el aviso de la primera corrida.
importacionesRouter.post("/sync", async (req, res, next) => {
  try {
    const force = req.body?.force === true;
    const result = await runAllImports("manual", { force });
    await runMonthlySnapshots().catch((error) => console.error("[monthly-snapshots]", error));
    res.status(201).json(result);
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ error: error.message });
  }
});

// El botón manual llama exactamente esta ruta. Siempre relee los mismos archivos de Drive.
importacionesRouter.post("/:sourceType/sync", async (req, res, next) => {
  const { sourceType } = req.params;
  if (!["bdd", "pagos"].includes(sourceType)) {
    return res.status(400).json({ error: "sourceType debe ser bdd o pagos" });
  }

  try {
    const force = req.body?.force === true;
    const result = await runRawImport(sourceType, "manual", { force });
    res.status(201).json(result);
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ error: error.message });
  }
});
