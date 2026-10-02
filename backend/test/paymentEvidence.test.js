import test from "node:test";
import assert from "node:assert/strict";
import { groupPaymentsByFolio, hasFullPaymentEvidence, invoiceEvidence } from "../src/domain/paymentEvidence.js";

// Caso real 02-oct-2026: Antonio Bassol pagó AGS2 5694 el 25-sep; la BDD todavía lo mostraba el
// 29-sep (rezago normal) y después salió. Antes el pago se descartaba por ser anterior al 29-sep.
const bassolPayments = groupPaymentsByFolio([
  { factura: "AGS2 5694", fecha_iso: "2026-09-25", monto: 1088.8 },
]);

test("un pago anterior a la última aparición en BDD sí cuenta como evidencia", () => {
  const evidence = invoiceEvidence({ folio: "AGS2 5694", monto: 1088.8, fecha_facturacion: "2026-09-01" }, bassolPayments);
  assert.equal(evidence.cubierta, true);
  assert.equal(evidence.ultimo_pago_iso, "2026-09-25");
});

test("la factura sin pago deja al cliente sin evidencia completa", () => {
  const invoices = [
    { folio: "AGS2 5694", monto: 1088.8, fecha_facturacion: "2026-09-01" },
    { folio: "AGS2 5455", monto: 1088.8, fecha_facturacion: "2026-08-03" },
  ];
  assert.equal(hasFullPaymentEvidence(invoices, bassolPayments), false);
  assert.equal(hasFullPaymentEvidence(invoices.slice(0, 1), bassolPayments), true);
});

test("el folio se compara sin espacios ni mayúsculas", () => {
  const payments = groupPaymentsByFolio([{ factura: "ags25694", fecha_iso: "2026-09-25", monto: 1088.8 }]);
  assert.equal(invoiceEvidence({ folio: "AGS2 5694", monto: 1088.8, fecha_facturacion: "2026-09-01" }, payments).cubierta, true);
});

test("un pago anterior a la fecha de facturación no cubre la factura", () => {
  const payments = groupPaymentsByFolio([{ factura: "AGS2 5694", fecha_iso: "2026-08-20", monto: 1088.8 }]);
  assert.equal(invoiceEvidence({ folio: "AGS2 5694", monto: 1088.8, fecha_facturacion: "2026-09-01" }, payments).cubierta, false);
});

test("abonos parciales se suman y se reportan", () => {
  const payments = groupPaymentsByFolio([
    { factura: "X1", fecha_iso: "2026-09-05", monto: 400 },
    { factura: "X1", fecha_iso: "2026-09-10", monto: 300 },
  ]);
  const evidence = invoiceEvidence({ folio: "X1", monto: 1000, fecha_facturacion: "2026-09-01" }, payments);
  assert.equal(evidence.cubierta, false);
  assert.equal(evidence.pagado, 700);
});

test("sin facturas no hay evidencia", () => {
  assert.equal(hasFullPaymentEvidence([], bassolPayments), false);
});
