import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeDashboardForViewer } from "../src/domain/publicDashboard.js";

const sample = {
  distribucion: [{ key: "promesa_pago", label: "Promesa de pago", names: ["Juan Pérez"] }],
  recuperadoSemanal: { total: 100, count: 1, rows: [{ name: "Juan Pérez", monto: 100 }] },
  recuperadoMensual: {
    total: 1000,
    count: 4,
    rows: [
      { cliente_id: "c1", name: "Cliente Uno", monto: 400 },
      { cliente_id: "c2", name: "Cliente Dos", monto: 300 },
      { cliente_id: "c3", name: "Cliente Tres", monto: 200 },
      { cliente_id: "c4", name: "Cliente Cuatro", monto: 100 },
    ],
  },
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
  assert.deepEqual(result.expectativaCobroDetalle, []);
  assert.equal(result.recuperadoMensual.total, 1000);
  assert.deepEqual(result.segmentacion, []);
  assert.deepEqual(result.historico, []);
});

test("Monto recuperado: el Lector solo ve los 3 clientes con mayor monto", () => {
  const result = sanitizeDashboardForViewer(sample, { isAnonymous: true });
  assert.deepEqual(
    result.recuperadoMensual.rows.map((row) => row.cliente_id),
    ["c1", "c2", "c3"]
  );
  // Con un solo cliente en la lista, sigue mostrándose (no queda vacío como antes).
  assert.deepEqual(result.recuperadoSemanal.rows, [{ name: "Juan Pérez", monto: 100 }]);
});
