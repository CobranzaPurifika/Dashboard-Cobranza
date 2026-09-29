import assert from "node:assert/strict";
import test from "node:test";
import { attachSegmentTramos, TRAMOS } from "../src/domain/segmentation.js";

test("attaches fixed, complete tramos to multiple segments without mutation", () => {
  const segments = [{ segment: "residencial", monto: 120 }, { segment: "comercial", monto: 80 }];
  const tramos = [
    { segment: "residencial", tramo: "critical", monto: 20, clientes: 1 },
    { segment: "comercial", tramo: "good", monto: 80, clientes: 2 },
    { segment: "residencial", tramo: "good", monto: 100, clientes: 3 },
  ];
  const originals = [structuredClone(segments), structuredClone(tramos)];
  const result = attachSegmentTramos(segments, tramos);

  assert.deepEqual(result.map((row) => row.tramos.map(({ tramo }) => tramo)), [
    TRAMOS.map(({ tramo }) => tramo), TRAMOS.map(({ tramo }) => tramo),
  ]);
  assert.deepEqual(result[0].tramos[1], { tramo: "warning", label: "1-30 días", monto: 0, clientes: 0 });
  assert.deepEqual(result[1].tramos[0], { tramo: "good", label: "Al corriente", monto: 80, clientes: 2 });
  assert.deepEqual([segments, tramos], originals);
});
