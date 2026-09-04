export const DRIVE_SOURCES = Object.freeze({
  bdd: [
    {
      franchiseId: "aguascalientes",
      fileId: "1Fy3i62qz0o2vSINmkdHIsG-z_SOMQDeI9r3qv_5v1Ho",
      label: "Antigüedad de Saldos — Aguascalientes",
    },
    {
      franchiseId: "cancun",
      fileId: "1XrtrCSQd51vrVJ8FqG3FlC_YQdhh9F8lRJ7DMYyC7CE",
      label: "Antigüedad de Saldos — Cancún",
    },
    {
      franchiseId: "merida",
      fileId: "1ibQi2pnfCKdIOCpNpf3Wt7RRTBAZPpgvObwYXP_j9AQ",
      label: "Antigüedad de Saldos — Mérida",
    },
  ],
  pagos: [
    {
      franchiseId: null,
      fileId: "1pxubxvmTEpSrZ2aevoH4KqRNsYctu3m6X35NE1BvH3A",
      label: "Pagos mes en curso",
    },
  ],
});

export function getDriveSources(sourceType) {
  const sources = DRIVE_SOURCES[sourceType];
  if (!sources) throw new Error(`Fuente de importación desconocida: ${sourceType}`);
  return sources;
}
