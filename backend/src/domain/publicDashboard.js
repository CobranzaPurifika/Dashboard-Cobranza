export function sanitizeDashboardForViewer(data, user) {
  if (!user?.isAnonymous) return data;

  return {
    ...data,
    distribucion: data.distribucion.map((item) => ({ ...item, names: [] })),
    // Monto recuperado: el Lector solo ve los 3 clientes con mayor monto (no la lista
    // completa) -- limitToTopClients recorta aquí mismo, en el backend, en vez de confiar en
    // que la plantilla lo recorte (el endpoint es público y cualquiera puede pedirlo directo).
    recuperadoSemanal: { ...data.recuperadoSemanal, rows: limitToTopClients(data.recuperadoSemanal?.rows, 3) },
    recuperadoMensual: { ...(data.recuperadoMensual ?? {}), rows: limitToTopClients(data.recuperadoMensual?.rows, 3) },
    expectativaCobroDetalle: [],
    // Segmentación y Recuperación mensual (histórico) se quitan por completo para el Lector,
    // no solo se ocultan en la plantilla -- el endpoint es público y no requiere sesión.
    segmentacion: [],
    historico: [],
  };
}

function limitToTopClients(rows, limit) {
  const list = rows ?? [];
  const totals = new Map();
  for (const row of list) {
    const key = clientKey(row);
    totals.set(key, (totals.get(key) ?? 0) + Number(row.monto ?? 0));
  }
  const topKeys = new Set(
    [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([key]) => key)
  );
  return list.filter((row) => topKeys.has(clientKey(row)));
}

function clientKey(row) {
  return row.cliente_id || `${row.franchise_id}|${String(row.name ?? "").toLowerCase()}`;
}
