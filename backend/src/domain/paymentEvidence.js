import { normalizeInvoiceKey } from "../imports/consolidation.js";

// Evidencia de pago por factura -- regla única compartida por la importación (decidir si un
// cliente que salió de la BDD quedó liquidado) y por la ficha (marcar facturas cubiertas).
//
// Un pago cuenta para una factura cuando su `factura` coincide con el folio (sin espacios ni
// mayúsculas) y su fecha es igual o posterior a la fecha de facturación. Antes se exigía que el
// pago fuera posterior a la última vez que el cliente apareció en la BDD; como la BDD refleja los
// pagos con días de retraso, casi todos los pagos reales quedaban fuera y el cliente terminaba
// en "Fuera de cartera" aunque hubiera pagado (incidente 02-oct-2026, Antonio Bassol).

// Misma llave de folio que usa la importación para ligar pagos y facturas.
export function normalizeFolio(value) {
  return normalizeInvoiceKey(value ?? "");
}

function dateOnly(value) {
  if (!value) return null;
  // node-pg convierte columnas `date` a medianoche local; se leen componentes locales para no
  // correr un día según la zona horaria del servidor.
  if (value instanceof Date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return String(value).match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

export function paymentsForInvoice(invoice, paymentsByFolio) {
  const invoiceDate = dateOnly(invoice.fecha_facturacion);
  const payments = paymentsByFolio.get(normalizeFolio(invoice.folio)) ?? [];
  return payments.filter((payment) => {
    if (!(Number(payment.monto) > 0)) return false;
    const paymentDate = dateOnly(payment.fecha_iso);
    return !invoiceDate || !paymentDate || paymentDate >= invoiceDate;
  });
}

export function invoiceEvidence(invoice, paymentsByFolio) {
  const payments = paymentsForInvoice(invoice, paymentsByFolio);
  const pagado = payments.reduce((sum, payment) => sum + Number(payment.monto), 0);
  const ultimoPago = payments.map((payment) => dateOnly(payment.fecha_iso)).filter(Boolean).sort().at(-1) ?? null;
  return {
    pagado: Math.round(pagado * 100) / 100,
    cubierta: pagado + 0.005 >= Number(invoice.monto),
    ultimo_pago_iso: ultimoPago,
  };
}

export function hasFullPaymentEvidence(invoices, paymentsByFolio) {
  if (!invoices || invoices.length === 0) return false;
  return invoices.every((invoice) => invoiceEvidence(invoice, paymentsByFolio).cubierta);
}

export function groupPaymentsByFolio(payments) {
  const grouped = new Map();
  for (const payment of payments) {
    const key = normalizeFolio(payment.factura);
    if (!key) continue;
    const list = grouped.get(key) ?? [];
    list.push(payment);
    grouped.set(key, list);
  }
  return grouped;
}
