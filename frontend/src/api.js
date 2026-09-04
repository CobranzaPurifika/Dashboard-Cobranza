import { clearSession, getValidAccessToken } from "./auth.js";

const API_BASE = window.__APP_CONFIG__?.apiBase ?? "http://localhost:3001/api";

async function request(path, options = {}) {
  const token = await getValidAccessToken();

  const { headers: optionHeaders, ...fetchOptions } = options;
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...optionHeaders,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      clearSession();
      notifyAuthenticationRequired();
    }
    throw new Error(body.error ?? `Error ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

function notifyAuthenticationRequired() {
  window.dispatchEvent(new CustomEvent("auth-required"));
}

export const api = {
  me: () => request("/me"),
  dashboard: (franchise) => request(`/dashboard/${franchise}`),
  prioridad: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    return request(`/clientes/prioridad?${qs}`);
  },
  seguimiento: (franchise) => request(`/seguimiento?franchise=${encodeURIComponent(franchise)}`),
  blacklist: (franchise) => request(`/blacklist?franchise=${encodeURIComponent(franchise)}`),
  clientes: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    return request(`/clientes?${qs}`);
  },
  cliente: (id) => request(`/clientes/${id}`),
  statusGestion: () => request(`/status-gestion`),
  guardarGestion: (id, body) =>
    request(`/clientes/${id}/gestion`, { method: "POST", body: JSON.stringify(body) }),
  agregarBlacklist: (id, motivo) =>
    request(`/clientes/${id}/blacklist`, { method: "POST", body: JSON.stringify({ motivo }) }),
  quitarBlacklist: (id) => request(`/clientes/${id}/blacklist`, { method: "DELETE" }),
};
