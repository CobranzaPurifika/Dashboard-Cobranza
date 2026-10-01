import assert from "node:assert/strict";
import test from "node:test";
import { buildMonthlyReportData } from "../src/domain/monthlyReport.js";
import ExcelJS from "exceljs";
import { renderMonthlyWorkbook } from "../src/documents/monthlyWorkbook.js";

const base = {
  franchiseIds: ["aguascalientes", "cancun", "merida"],
  desde: "2026-09-01",
  hasta: "2026-09-30",
};

test("agrupa y ordena gestiones, conserva el estatus de respaldo y cuenta clientes", () => {
  const data = buildMonthlyReportData({
    ...base,
    gestiones: [
      { fecha_iso: "2026-09-03", created_at: "2026-09-03T11:00:00Z", cliente_id: 2, name: "Dos", franchise_id: "cancun", estatus_value: null },
      { fecha_iso: "2026-09-02", created_at: "2026-09-02T12:00:00Z", cliente_id: 1, name: "Uno", franchise_id: "aguascalientes", status_label: "Contactado" },
      { fecha_iso: "2026-09-01", created_at: "2026-09-01T12:00:00Z", cliente_id: 1, name: "Uno", franchise_id: "aguascalientes", estatus_value: "sin_respuesta" },
    ],
    pagos: [],
  });
  assert.deepEqual(data.gestiones.map((row) => row.franchiseId), ["aguascalientes", "aguascalientes", "cancun"]);
  assert.deepEqual(data.gestiones.map((row) => row.estatus), ["sin_respuesta", "Contactado", "—"]);
  assert.equal(data.resumenGestiones.total, 3);
  assert.equal(data.resumenGestiones.clientesUnicos, 2);
  assert.deepEqual(data.resumenGestiones.porFranquicia, { aguascalientes: 2, cancun: 1, merida: 0 });
});

test("calcula el recuperado por franquicia y el total general", () => {
  const data = buildMonthlyReportData({
    ...base,
    gestiones: [],
    pagos: [
      { fecha_iso: "2026-09-05", name: "A", franchise_id: "merida", folio: "MID 2", monto: "50.25" },
      { fecha_iso: "2026-09-04", name: "B", franchise_id: "aguascalientes", factura: "F-1", monto: 100 },
    ],
  });
  assert.deepEqual(data.pagos.map((row) => row.franchiseId), ["aguascalientes", "merida"]);
  assert.equal(data.recuperadoPorFranquicia.find((row) => row.franchiseId === "merida").total, 50.25);
  assert.equal(data.totalRecuperado, 150.25);
});

test("renderiza el libro con sus hojas, fórmulas y logos", async () => {
  const gestiones = Array.from({ length: 65 }, (_, index) => ({
    fecha_iso: `2026-09-${String((index % 30) + 1).padStart(2, "0")}`,
    created_at: String(index), cliente_id: index, name: `Cliente ${index}`,
    franchise_id: "aguascalientes", status_label: "Contactado",
    descripcion: `Comentario de seguimiento ${index} con suficiente contenido para validar el ajuste de línea.`,
  }));
  const data = buildMonthlyReportData({ ...base, gestiones, pagos: [] });
  const buffer = await renderMonthlyWorkbook(data);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Resumen", "Gestiones", "Recuperado"]);
  assert.equal(workbook.getWorksheet("Resumen").getCell("E7").value.formula, "SUM(B7:D7)");
  assert.equal(workbook.model.media.length, 2);
});
