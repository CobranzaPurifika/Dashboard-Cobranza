export function sanitizeDashboardForViewer(data, user) {
  if (!user?.isAnonymous) return data;

  return {
    ...data,
    distribucion: data.distribucion.map((item) => ({ ...item, names: [] })),
    recuperadoSemanal: { ...data.recuperadoSemanal, rows: [] },
    recuperadoMensual: { ...(data.recuperadoMensual ?? {}), rows: [] },
    expectativaCobroDetalle: [],
    // Segmentación y Recuperación mensual (histórico) se quitan por completo para el Lector,
    // no solo se ocultan en la plantilla -- el endpoint es público y no requiere sesión.
    segmentacion: [],
    historico: [],
  };
}
