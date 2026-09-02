import "dotenv/config";
import express from "express";
import cors from "cors";
import cron from "node-cron";

import { clientesRouter } from "./routes/clientes.js";
import { gestionRouter } from "./routes/gestion.js";
import { pagosRouter } from "./routes/pagos.js";
import { blacklistRouter } from "./routes/blacklist.js";
import { agendaRouter } from "./routes/agenda.js";
import { statusGestionRouter } from "./routes/statusGestion.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { recalcularVencidos } from "./jobs/recalcularVencidos.js";

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? "*" }));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/clientes", clientesRouter);
app.use("/api/clientes", gestionRouter);
app.use("/api/clientes", pagosRouter);
app.use("/api", blacklistRouter);
app.use("/api/clientes", agendaRouter);
app.use("/api/status-gestion", statusGestionRouter);
app.use("/api/dashboard", dashboardRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
});

const port = process.env.PORT ?? 3001;
app.listen(port, () => {
  console.log(`Cobranza Purifika API escuchando en :${port}`);
});

// Tarea programada real (reemplaza la reconciliación manual del artifact original):
// todos los días a la 01:00 se recalculan días de vencido y tramo de cada cliente.
cron.schedule("0 1 * * *", () => {
  recalcularVencidos().catch(() => {});
});
