import "dotenv/config";
import { fileURLToPath } from "node:url";
import express from "express";
import app from "./app.js";
import { startImportSchedules } from "./imports/scheduler.js";
const frontendDirectory = fileURLToPath(new URL("../../frontend", import.meta.url));

// En producción el mismo proceso sirve la SPA y la API; localmente puede conservarse
// el servidor estático independiente descrito en el README.
app.use(express.static(frontendDirectory));

const port = process.env.PORT ?? 3001;
app.listen(port, () => {
  console.log(`Cobranza Purifika API escuchando en :${port}`);
  startImportSchedules();
});
