import cron from "node-cron";
import { runRawImport } from "./rawImport.js";

const TIMEZONE = "America/Mexico_City";

export function startImportSchedules() {
  if (process.env.IMPORT_SCHEDULER_ENABLED !== "true") return;

  cron.schedule("0 10,13,16 * * *", () => execute("bdd"), { timezone: TIMEZONE });
  cron.schedule("0 17 * * *", () => execute("pagos"), { timezone: TIMEZONE });
}

function execute(sourceType) {
  runRawImport(sourceType, "automatic").catch((error) => {
    console.error(`[import:${sourceType}]`, error);
  });
}
