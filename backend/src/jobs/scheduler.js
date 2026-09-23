import cron from "node-cron";
import { runMonthlySnapshots } from "./monthlySnapshots.js";

const TIMEZONE = "America/Mexico_City";

// Evita que un servidor local o de pruebas escriba automáticamente en la base de datos real.
export function startSnapshotSchedule() {
  if (process.env.IMPORT_SCHEDULER_ENABLED !== "true") return;

  // A las 17:00, para que el monto recuperado del mes en curso incluya los pagos importados
  // ese día mediante el botón Actualizar.
  cron.schedule("30 17 * * *", execute, { timezone: TIMEZONE });

  // Corrida al levantar el servidor: si un redeploy se saltó la ventana nocturna, el mes en
  // curso no se queda desactualizado hasta la siguiente noche.
  execute();
}

function execute() {
  runMonthlySnapshots().catch((error) => {
    console.error("[monthly-snapshots]", error);
  });
}
