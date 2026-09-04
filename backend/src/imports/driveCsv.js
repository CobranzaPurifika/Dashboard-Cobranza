import { JWT } from "google-auth-library";

const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

function getAuthClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error("Faltan credenciales de Google Drive para ejecutar la importación");
  }

  return new JWT({
    email,
    key: rawKey.replace(/\\n/g, "\n"),
    scopes: [DRIVE_READONLY_SCOPE],
  });
}

export async function downloadSheetAsCsv(fileId) {
  const auth = getAuthClient();
  const headers = await auth.getRequestHeaders();
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}/export`);
  url.searchParams.set("mimeType", "text/csv");

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Drive respondió ${response.status}: ${detail.slice(0, 300)}`);
  }

  return response.text();
}
