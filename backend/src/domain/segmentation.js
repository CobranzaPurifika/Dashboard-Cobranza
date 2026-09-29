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
