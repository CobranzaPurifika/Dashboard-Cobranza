import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildMonthlyReportData } from "../src/domain/monthlyReport.js";
import { buildMonthSummary } from "../src/domain/monthSummary.js";
import { buildMonthlyManagement } from "../src/domain/monthlyManagement.js";
import { renderMonthlyWorkbook } from "../src/documents/monthlyWorkbook.js";
import { LOGO_APP_FULL_BASE64 } from "../src/documents/assets/logoAppFull.js";
const base = { franchiseIds: ["aguascalientes", "cancun", "merida"], desde: "2026-09-01", hasta: "2026-09-30", isCurrent: false };

for (const populated of [false, true]) test(`libro con fórmulas, dos imágenes y tres hojas; datos=${populated}`, async () => {
  const source = { ...base,
    gestiones: populated ? [1, 2, 1].map((id) => ({ fecha_iso: "2026-09-02", name: "Mismo nombre", cliente_id: id, franchise_id: "aguascalientes", descripcion: "Seguimiento", estatus_value: "promesa_pago" })) : [],
    pagos: populated ? [{ fecha_iso: "2026-09-04", name: "Cliente", franchise_id: "cancun", monto: 150 }] : [],
    corte: [{ franchise_id: "todas", saldo_total: 1000, tramo_60_mas_monto: 100, al_corriente_pct: 80, cartera_vencida_pct: 20 }],
    statusCatalog: [{ value: "promesa_pago", label: "Promesa", efectiva: true, sort_order: 1 }],
  };
  const compliance = buildMonthlyManagement({
    month: "2026-09", throughDate: "2026-09-30",
    franchises: [{ id: "aguascalientes", label: "Aguascalientes" }, { id: "cancun", label: "Cancún" }],
    goals: [{ franchise_id: "aguascalientes", daily_goal: 10 }, { franchise_id: "cancun", daily_goal: 4 }],
    counts: populated ? [{ franchise_id: "aguascalientes", fecha: "2026-09-01", count: 5 }, { franchise_id: "cancun", fecha: "2026-09-01", count: 8 }] : [],
    incidents: populated ? [{ franchise_id: "aguascalientes", fecha: "2026-09-02", note: "Sin sistema" }] : [],
  });
  const data = { ...buildMonthlyReportData(source), summary: buildMonthSummary(source), compliance, generatedAt: new Date("2026-10-01T18:00:00Z") };
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await renderMonthlyWorkbook(data));
  assert.deepEqual(workbook.worksheets.map((s) => s.name), ["Resumen", "Gestiones", "Cumplimiento", "Recuperado"]);
  assert.equal(workbook.model.media.length, 2);
  assert.equal(Buffer.from(LOGO_APP_FULL_BASE64, "base64").subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  for (const sheet of workbook.worksheets) {
    assert.equal(sheet.getImages().length, 2);
    assert.equal(sheet.getCell("B1").value, "Reporte de gestiones — Septiembre 2026");
    assert.equal(sheet.getCell("B3").value, sheet.name);
    assert.match(sheet.getCell("B4").value, /^Del 1 al 30 de septiembre de 2026 · Generado:.*CDMX/);
    assert.equal(sheet.pageSetup.orientation, "landscape");
    assert.equal(sheet.pageSetup.fitToWidth, 1);
    assert.equal(sheet.views[0].showGridLines, false);
  }
  const summary = workbook.getWorksheet("Resumen");
  assert.equal(summary.getCell("E8").value, 1000);
  assert.equal(summary.getCell("E12").formula, "IFERROR(E11/E8,0)");
  assert.equal(summary.getCell("A13").value, "Representación de saldos");
  assert.equal(summary.getCell("A14").value, "Detalle no disponible para este corte");
  assert.equal(summary.getCell("E16").formula, "SUM(B16:D16)");
  const management = workbook.getWorksheet("Gestiones");
  assert.match(management.getCell("B6").formula, /^COUNTA/);
  assert.equal(management.getCell("B7").result ?? 0, populated ? 2 : 0);
  assert.equal(management.getColumn(6).hidden, true);
  if (populated) {
    assert.match(management.getCell("B7").formula, /SUMPRODUCT\(1\/COUNTIF\(F13:F15/);
    assert.equal(management.getCell("A13").numFmt, "dd/mm/yyyy");
    assert.equal(management.getCell("E13").alignment.wrapText, true);
  }
  const sheet = workbook.getWorksheet("Cumplimiento");
  assert.deepEqual([sheet.getCell("B6").value, sheet.getCell("C6").value], ["Aguascalientes", "Cancún"]);
  assert.equal(sheet.getCell("B7").value, 10);
  assert.equal(sheet.getCell("A14").value, "Fecha");
  // 22 días hábiles en septiembre 2026 × 2 franquicias, ordenados por fecha y franquicia.
  assert.equal(sheet.rowCount, 14 + 44);
  assert.deepEqual([sheet.getCell("B15").value, sheet.getCell("B16").value], ["AGS", "CUN"]);
  assert.equal(sheet.getCell("E15").formula, "IF(D15=0,1,MIN(1,C15/D15))");
  if (populated) {
    assert.equal(sheet.getCell("E15").result, 0.5);
    assert.equal(sheet.getCell("E16").result, 1);
    assert.equal(sheet.getCell("E17").value, "Justificado: Sin sistema");
    // Promedio del dominio: AGS 50% en 1 de 21 días evaluados (uno justificado); CUN 100% en 1 de 22.
    assert.deepEqual([sheet.getCell("B8").value, sheet.getCell("C8").value, sheet.getCell("B11").value], [0.02, 0.05, 1]);
  }
  const recovered = workbook.getWorksheet("Recuperado");
  assert.equal(recovered.getCell("B9").formula, "SUM(B6:B8)");
  const finalCell = recovered.getCell(recovered.rowCount, 5);
  assert.equal(finalCell.formula, "SUM(E12:E12)");
  assert.equal(finalCell.numFmt, "$#,##0.00");
  assert.equal(finalCell.alignment.horizontal, "right");
  if (populated) assert.match(recovered.getCell("B7").formula, /^SUMIF/);
});

test("Resumen incluye la representación de saldos del corte por franquicia", async () => {
  const detail = {
    tramos: [
      { franchise_id: "aguascalientes", segment: "comercial", tramo: "good", monto: 600, clientes: 3 },
      { franchise_id: "aguascalientes", segment: "residencial", tramo: "critical", monto: 400, clientes: 2 },
      { franchise_id: "cancun", segment: "comercial", tramo: "warning", monto: 250, clientes: 1 },
    ],
    segments: [],
  };
  const source = { ...base, detail, corte: [], statusCatalog: [] };
  const compliance = buildMonthlyManagement({ month: "2026-09", throughDate: "2026-09-30", franchises: [], goals: [], counts: [], incidents: [] });
  const data = { ...buildMonthlyReportData(source), summary: buildMonthSummary(source), compliance };
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await renderMonthlyWorkbook(data));
  const sheet = workbook.getWorksheet("Resumen");
  const heading = sheet.getColumn(1).values.indexOf("Representación de saldos");
  const start = heading + 1;
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => sheet.getCell(start + i - 1, 1).value),
    ["Al corriente", "1-30 días", "31-60 días", "+60 días", "Total facturado"]);
  assert.deepEqual([sheet.getCell(start, 2).value, sheet.getCell(start + 3, 2).value], [600, 400]);
  assert.equal(sheet.getCell(start + 1, 3).value, 250);
  assert.equal(sheet.getCell(start, 4).value, "No disponible");
  assert.equal(sheet.getCell(start + 1, 2).value, 0);
  assert.equal(sheet.getCell(start + 4, 2).formula, `SUM(B${start}:B${start + 3})`);
  assert.equal(sheet.getCell(start + 4, 2).result, 1000);
  assert.equal(sheet.getCell(start, 5).formula, `SUM(B${start}:D${start})`);
  assert.equal(sheet.getCell(start, 5).result, 600);
  assert.equal(sheet.getCell(start + 8, 2).formula, `IFERROR(B${start + 3}/B${start + 4},0)`);
  assert.equal(sheet.getCell(start + 8, 2).result, 0.4);
});
