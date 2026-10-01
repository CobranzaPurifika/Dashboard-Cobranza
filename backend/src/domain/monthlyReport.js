import { FRANCHISE_IDS } from "../auth/franchiseScope.js";

const asIso = (value) => value instanceof Date
  ? value.toISOString().slice(0, 10)
  : String(value ?? "").slice(0, 10);

const asMoney = (value) => Number(value) || 0;

export function buildMonthlyReportData({ gestiones = [], pagos = [], franchiseIds = [], desde, hasta }) {
  const allowed = new Set(franchiseIds);
  const orderedIds = FRANCHISE_IDS.filter((id) => allowed.has(id));
  const order = new Map(orderedIds.map((id, index) => [id, index]));

  const managementRows = gestiones
    .filter((row) => allowed.has(row.franchise_id))
    .map((row) => ({
      fecha: asIso(row.fecha_iso),
      cliente: row.name || "—",
      clienteId: row.cliente_id ?? row.name ?? "—",
      franchiseId: row.franchise_id,
      estatus: row.status_label || row.estatus_label || row.estatus_value || "—",
      comentario: row.descripcion || "—",
      createdAt: row.created_at ?? "",
    }))
    .sort((a, b) => (order.get(a.franchiseId) - order.get(b.franchiseId))
      || a.fecha.localeCompare(b.fecha) || String(a.createdAt).localeCompare(String(b.createdAt)));

  const paymentRows = pagos
    .filter((row) => allowed.has(row.franchise_id))
    .map((row) => ({
      fecha: asIso(row.fecha_iso),
      cliente: row.name || "—",
      franchiseId: row.franchise_id,
      referencia: [row.folio, row.factura].filter(Boolean).join(" / ") || "—",
      monto: asMoney(row.monto),
    }))
    .sort((a, b) => (order.get(a.franchiseId) - order.get(b.franchiseId)) || a.fecha.localeCompare(b.fecha));

  const gestionesPorFranquicia = orderedIds.map((franchiseId) => ({
    franchiseId,
    rows: managementRows.filter((row) => row.franchiseId === franchiseId),
  }));
  const recuperadoPorFranquicia = orderedIds.map((franchiseId) => ({
    franchiseId,
    total: paymentRows.filter((row) => row.franchiseId === franchiseId).reduce((sum, row) => sum + row.monto, 0),
  }));

  return {
    desde,
    hasta,
    franchiseIds: orderedIds,
    gestiones: managementRows,
    gestionesPorFranquicia,
    resumenGestiones: {
      total: managementRows.length,
      clientesUnicos: new Set(managementRows.map((row) => row.clienteId)).size,
      porFranquicia: Object.fromEntries(gestionesPorFranquicia.map((group) => [group.franchiseId, group.rows.length])),
    },
    pagos: paymentRows,
    recuperadoPorFranquicia,
    totalRecuperado: paymentRows.reduce((sum, row) => sum + row.monto, 0),
  };
}
