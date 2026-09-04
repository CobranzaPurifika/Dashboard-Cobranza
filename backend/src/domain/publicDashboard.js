export function sanitizeDashboardForViewer(data, user) {
  if (!user?.isAnonymous) return data;

  return {
    ...data,
    distribucion: data.distribucion.map((item) => ({ ...item, names: [] })),
    recuperadoSemanal: { ...data.recuperadoSemanal, rows: [] },
  };
}
