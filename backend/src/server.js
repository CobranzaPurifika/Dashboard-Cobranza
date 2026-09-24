import "dotenv/config";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "node:url";

import { clientesRouter } from "./routes/clientes.js";
import { publicClientesRouter } from "./routes/publicClientes.js";
import { gestionRouter } from "./routes/gestion.js";
import { pagosRouter } from "./routes/pagos.js";
import { blacklistRouter } from "./routes/blacklist.js";
import { agendaRouter } from "./routes/agenda.js";
import { statusGestionRouter } from "./routes/statusGestion.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { importacionesRouter } from "./routes/importaciones.js";
import { seguimientoRouter } from "./routes/seguimiento.js";
import { monthlyManagementRouter } from "./routes/monthlyManagement.js";
import { notasRouter } from "./routes/notas.js";
import { startSnapshotSchedule } from "./jobs/scheduler.js";
import { authenticate, requireAuthenticated } from "./auth/authorization.js";

const app = express();
const frontendDirectory = fileURLToPath(new URL("../../frontend", import.meta.url));
app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/config.js", (_req, res) => {
  res.type("application/javascript").send(
    `window.__APP_CONFIG__ = ${JSON.stringify({
      apiBase: "/api",
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    })};`
  );
});
app.use("/api", authenticate);
app.get("/api/me", (req, res) =>
  res.json({ ...req.user, allFranchises: req.user.role !== "gestor" })
);
app.use("/api/dashboard", dashboardRouter);
// Buscador de clientes para el Lector (sin sesión) -- lo usan compañeros de trabajo para
// consultar el detalle de un cliente sin poder modificar nada (ver publicClientes.js).
app.use("/api/public-clientes", publicClientesRouter);

// El enlace público solo expone /api/me, métricas agregadas del dashboard y la búsqueda de
// clientes de solo lectura. A partir de aquí, gestión y operación requieren sesión.
app.use("/api", requireAuthenticated);

app.use("/api/clientes", clientesRouter);
app.use("/api/clientes", gestionRouter);
app.use("/api/clientes", notasRouter);
app.use("/api/clientes", pagosRouter);
app.use("/api", blacklistRouter);
app.use("/api/clientes", agendaRouter);
app.use("/api/status-gestion", statusGestionRouter);
app.use("/api/seguimiento", seguimientoRouter);
app.use("/api/gestiones-mes", monthlyManagementRouter);
app.use("/api/importaciones", importacionesRouter);

// En producción el mismo proceso sirve la SPA y la API; localmente puede conservarse
// el servidor estático independiente descrito en el README.
app.use(express.static(frontendDirectory));

app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode ?? 500;
  if (statusCode >= 500) console.error(err);
  res.status(statusCode).json({
    error: statusCode >= 500 ? "Error interno del servidor" : err.message,
  });
});

const port = process.env.PORT ?? 3001;
app.listen(port, () => {
  console.log(`Cobranza Purifika API escuchando en :${port}`);
  startSnapshotSchedule();
});
