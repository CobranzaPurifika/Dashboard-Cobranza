// Acceso de solo lectura a Drive para el módulo Campañas: reutiliza la cuenta de servicio
// y la exportación a CSV de la importación oficial, y agrega la fecha de última
// modificación del archivo para avisar cuando la BDD está desactualizada.
import { JWT } from "google-auth-library";
import { downloadSheetAsCsv } from "../imports/driveCsv.js";

const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

function authClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) throw new Error("Faltan credenciales de Google Drive para leer la BDD");
  return new JWT({ email, key: rawKey.replace(/\\n/g, "\n"), scopes: [DRIVE_READONLY_SCOPE] });
}

export async function fechaModificacion(fileId) {
  const headers = await authClient().getRequestHeaders();
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
  url.searchParams.set("fields", "modifiedTime");
  url.searchParams.set("supportsAllDrives", "true");
  const response = await fetch(url, { headers });
  if (!response.ok) return null;
  const { modifiedTime } = await response.json();
  return modifiedTime ?? null;
}

export function descargarCsv(fileId) {
  return downloadSheetAsCsv(fileId);
}
