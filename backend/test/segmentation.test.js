import assert from "node:assert/strict";
import test from "node:test";
import { attachSegmentTramos, buildPortfolioDetail, TRAMOS } from "../src/domain/segmentation.js";

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

test("reconstruye saldos y segmentación de un corte sumando solo franquicias permitidas", () => {
  const detail = {
    tramos: [
      { franchise_id: "cancun", segment: "comercial", tramo: "good", monto: 100, clientes: 2 },
      { franchise_id: "merida", segment: "comercial", tramo: "good", monto: 50, clientes: 1 },
      { franchise_id: "merida", segment: "residencial", tramo: "critical", monto: 30, clientes: 1 },
      { franchise_id: "aguascalientes", segment: "residencial", tramo: "warning", monto: 999, clientes: 9 },
    ],
    segments: [
      { franchise_id: "cancun", segment: "comercial", label: "Comercial", clientes: 3, saldo: 100 },
      { franchise_id: "merida", segment: "comercial", label: "Comercial", clientes: 1, saldo: 50 },
      { franchise_id: "merida", segment: "residencial", label: "Residencial", clientes: 2, saldo: 30 },
    ],
  };
  const result = buildPortfolioDetail(detail, ["cancun", "merida"]);
  assert.deepEqual(result.saldos, [
    { tramo: "good", label: "Al corriente", value: 150, clientes: 3 },
    { tramo: "critical", label: "+60 días", value: 30, clientes: 1 },
  ]);
  assert.equal(result.clientes, 6);
  const comercial = result.segmentacion.find((row) => row.segment === "comercial");
  assert.deepEqual([comercial.label, comercial.clientes, comercial.monto], ["Comercial", 4, 150]);
  assert.deepEqual(comercial.tramos[0], { tramo: "good", label: "Al corriente", monto: 150, clientes: 3 });
  assert.equal(buildPortfolioDetail({ tramos: [], segments: [] }, ["cancun"]), null);
  assert.equal(buildPortfolioDetail(detail, ["otra"]), null);
});
