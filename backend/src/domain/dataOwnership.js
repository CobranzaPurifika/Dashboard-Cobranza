const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DATA_OWNERSHIP = Object.freeze({
  carteraVigente: "bdd",
  facturasPendientes: "bdd",
  recuperacion: "pagos",
  gestiones: "app",
});

export function paymentDedupeKey({ factura, fechaISO, monto }) {
  const normalizedInvoice = String(factura ?? "").trim();
  const normalizedDate = String(fechaISO ?? "").slice(0, 10);
  const normalizedAmount = Number(monto);

  if (!normalizedInvoice) throw new Error("factura es requerida");
  if (!ISO_DATE.test(normalizedDate)) throw new Error("fechaISO debe ser YYYY-MM-DD");
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error("monto debe ser mayor a 0");
  }

  return `${normalizedInvoice}|${normalizedDate}|${normalizedAmount.toFixed(2)}`;
}

// La semana de recuperación empieza el lunes, excepto cuando el mes empezó después.
// En ese caso el corte inicia el día 1 para no mezclar pagos de meses distintos.
export function recoveryWeekStart(isoDate) {
  if (!ISO_DATE.test(isoDate)) throw new Error("isoDate debe ser YYYY-MM-DD");

  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - mondayOffset);

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const start = monday < monthStart ? monthStart : monday;
  return start.toISOString().slice(0, 10);
}
