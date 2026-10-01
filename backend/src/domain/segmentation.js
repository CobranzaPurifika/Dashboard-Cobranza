export const TRAMOS = [
  { tramo: "good", label: "Al corriente" },
  { tramo: "warning", label: "1-30 días" },
  { tramo: "serious", label: "31-60 días" },
  { tramo: "critical", label: "+60 días" },
];

export function attachSegmentTramos(segRows, tramoRows) {
  return segRows.map((segment) => ({
    ...segment,
    tramos: TRAMOS.map(({ tramo, label }) => {
      const row = tramoRows.find((item) => item.segment === segment.segment && item.tramo === tramo);
      return { tramo, label, monto: Number(row?.monto ?? 0), clientes: Number(row?.clientes ?? 0) };
    }),
  }));
}

const sumBy = (rows, key, pick) => {
  const out = new Map();
  for (const row of rows) {
    const id = key(row);
    const prev = out.get(id) ?? {};
    out.set(id, pick(row, prev));
  }
  return out;
};

/**
 * Builds the dashboard `saldos`/`segmentacion` shapes from per-franchise corte rows
 * (portfolioSnapshotDetail.js). Returns null when the corte has no saved detail.
 */
export function buildPortfolioDetail({ tramos = [], segments = [] }, franchiseIds) {
  const allowed = new Set(franchiseIds);
  const tramoRows = tramos.filter((row) => allowed.has(row.franchise_id));
  const segmentRows = segments.filter((row) => allowed.has(row.franchise_id));
  if (!tramoRows.length && !segmentRows.length) return null;
  const add = (row, prev) => ({
    ...row,
    monto: Math.round((Number(prev.monto ?? 0) + Number(row.monto ?? row.saldo ?? 0)) * 100) / 100,
    clientes: Number(prev.clientes ?? 0) + Number(row.clientes ?? 0),
  });
  const byTramo = sumBy(tramoRows, (row) => row.tramo, add);
  const bySegmentTramo = [...sumBy(tramoRows, (row) => `${row.segment}|${row.tramo}`, add).values()];
  const bySegment = [...sumBy(segmentRows, (row) => row.segment, add).values()]
    .map(({ segment, label, clientes, monto }) => ({ segment, label, clientes, monto }));
  return {
    saldos: TRAMOS.filter(({ tramo }) => byTramo.has(tramo)).map(({ tramo, label }) => ({
      tramo, label, value: byTramo.get(tramo).monto, clientes: byTramo.get(tramo).clientes,
    })),
    segmentacion: attachSegmentTramos(bySegment, bySegmentTramo),
    clientes: bySegment.reduce((sum, row) => sum + row.clientes, 0),
  };
}
