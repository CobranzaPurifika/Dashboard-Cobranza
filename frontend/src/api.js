const API_BASE = window.__API_BASE__ ?? "http://localhost:3001/api";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Error ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  dashboard: (franchise) => request(`/dashboard/${franchise}`),
  clientes: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    return request(`/clientes?${qs}`);
  },
  cliente: (id) => request(`/clientes/${id}`),
  statusGestion: () => request(`/status-gestion`),
  guardarGestion: (id, body) =>
    request(`/clientes/${id}/gestion`, { method: "POST", body: JSON.stringify(body) }),
  aplicarPago: (id, body) =>
    request(`/clientes/${id}/pagos`, { method: "POST", body: JSON.stringify(body) }),
};
