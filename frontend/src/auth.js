const STORAGE_KEY = "cobranza-purifika.session";

function config() {
  return window.__APP_CONFIG__ ?? {};
}

export function authConfigurationError() {
  const { supabaseUrl, supabaseAnonKey } = config();
  if (!supabaseUrl || !supabaseAnonKey) {
    return "Falta configurar Supabase en frontend/config.js";
  }
  return null;
}

export function hasSession() {
  return Boolean(readSession()?.refresh_token);
}

export async function signIn(email, password) {
  const error = authConfigurationError();
  if (error) throw new Error(error);

  const session = await authRequest("/token?grant_type=password", {
    email: String(email).trim().toLowerCase(),
    password,
  });
  writeSession(session);
  return session;
}

export async function getValidAccessToken() {
  const session = readSession();
  if (!session) return null;

  if (session.access_token && Number(session.expires_at) * 1000 > Date.now() + 30_000) {
    return session.access_token;
  }

  if (!session.refresh_token) {
    clearSession();
    return null;
  }

  try {
    const refreshed = await authRequest("/token?grant_type=refresh_token", {
      refresh_token: session.refresh_token,
    });
    writeSession(refreshed);
    return refreshed.access_token;
  } catch (error) {
    clearSession();
    throw error;
  }
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function signOut() {
  const session = readSession();
  clearSession();
  if (!session?.access_token || authConfigurationError()) return;

  const { supabaseUrl, supabaseAnonKey } = config();
  await fetch(`${normalizeUrl(supabaseUrl)}/auth/v1/logout`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
  }).catch(() => undefined);
}

async function authRequest(path, body) {
  const { supabaseUrl, supabaseAnonKey } = config();
  const response = await fetch(`${normalizeUrl(supabaseUrl)}/auth/v1${path}`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload.error_description ?? payload.msg ?? "No fue posible iniciar sesión";
    if (/invalid login credentials/i.test(message)) {
      throw new Error("Correo o contraseña incorrectos");
    }
    throw new Error(message);
  }

  return response.json();
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch (_error) {
    clearSession();
    return null;
  }
}

function writeSession(session) {
  const expiresAt = session.expires_at ?? Math.floor(Date.now() / 1000) + Number(session.expires_in ?? 3600);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...session, expires_at: expiresAt }));
}

function normalizeUrl(url) {
  return String(url).replace(/\/$/, "");
}
