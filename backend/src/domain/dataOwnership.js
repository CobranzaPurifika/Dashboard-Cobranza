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
