import "dotenv/config";
import { pool } from "../db/pool.js";
import { runRawImport } from "./rawImport.js";

const sourceType = process.argv[2];

if (!["bdd", "pagos"].includes(sourceType)) {
  console.error("Uso: npm run import:scheduled -- bdd|pagos");
  process.exitCode = 2;
} else {
  try {
    const result = await runRawImport(sourceType, "automatic");
    console.log(JSON.stringify({
      sourceType: result.sourceType,
      status: result.status,
      rowsRead: result.rowsRead,
      rowsApplied: result.rowsApplied,
      reason: result.details?.reason ?? null,
    }));
  } catch (error) {
    console.error(`[import:${sourceType}] ${error.message ?? error}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
