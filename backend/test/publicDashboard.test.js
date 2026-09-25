import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeDashboardForViewer } from "../src/domain/publicDashboard.js";

const sample = {
  distribucion: [{ key: "promesa_pago", label: "Promesa de pago", names: ["Juan Pérez"] }],
  recuperadoSemanal: { total: 100, count: 1, rows: [{ name: "Juan Pérez", monto: 100 }] },
  recuperadoMensual: { total: 400, count: 3, rows: [{ name: "Juan Pérez", monto: 400 }] },
  expectativaCobroDetalle: [{ name: "Juan Pérez", deadline: "2026-09-25", monto: 9550 }],
  segmentacion: [{ segment: "residencial", label: "Residencial", clientes: 5, monto: 1000 }],
  historico: [{ month: "2026-09-01", monto_recuperado: 5000 }],
};

test("deja pasar el detalle con nombres para un usuario autenticado", () => {
  const result = sanitizeDashboardForViewer(sample, { isAnonymous: false });
  assert.equal(result, sample);
});

test("oculta nombres de clientes para el visor anónimo", () => {
  const result = sanitizeDashboardForViewer(sample, { isAnonymous: true });
  assert.deepEqual(result.distribucion[0].names, []);
  assert.deepEqual(result.recuperadoSemanal.rows, []);
  assert.deepEqual(result.recuperadoMensual.rows, []);
  assert.deepEqual(result.expectativaCobroDetalle, []);
  assert.equal(result.recuperadoMensual.total, 400);
  assert.deepEqual(result.segmentacion, []);
  assert.deepEqual(result.historico, []);
});
