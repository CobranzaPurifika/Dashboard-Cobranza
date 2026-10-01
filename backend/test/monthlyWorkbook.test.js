import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildMonthlyReportData } from "../src/domain/monthlyReport.js";
import { buildMonthSummary } from "../src/domain/monthSummary.js";
import { renderMonthlyWorkbook } from "../src/documents/monthlyWorkbook.js";
import { LOGO_APP_DROP_BASE64 } from "../src/documents/assets/logoAppDrop.js";
const base = { franchiseIds: ["aguascalientes", "cancun", "merida"], desde: "2026-09-01", hasta: "2026-09-30", isCurrent: false };

for (const populated of [false, true]) test(`libro con fórmulas, dos imágenes y tres hojas; datos=${populated}`, async () => {
  const source = { ...base,
    gestiones: populated ? [1, 2, 1].map((id) => ({ fecha_iso: "2026-09-02", name: "Mismo nombre", cliente_id: id, franchise_id: "aguascalientes", descripcion: "Seguimiento", estatus_value: "promesa_pago" })) : [],
    pagos: populated ? [{ fecha_iso: "2026-09-04", name: "Cliente", franchise_id: "cancun", monto: 150 }] : [],
    corte: [{ franchise_id: "todas", saldo_total: 1000, tramo_60_mas_monto: 100, al_corriente_pct: 80, cartera_vencida_pct: 20 }],
    statusCatalog: [{ value: "promesa_pago", label: "Promesa", efectiva: true, sort_order: 1 }],
  };
  const data = { ...buildMonthlyReportData(source), summary: buildMonthSummary(source), generatedAt: new Date("2026-10-01T18:00:00Z") };
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await renderMonthlyWorkbook(data));
  assert.deepEqual(workbook.worksheets.map((s) => s.name), ["Resumen", "Gestiones", "Recuperado"]);
  assert.equal(workbook.model.media.length, 2);
  assert.equal(Buffer.from(LOGO_APP_DROP_BASE64, "base64").subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  for (const sheet of workbook.worksheets) {
    assert.equal(sheet.getImages().length, 2);
    assert.equal(sheet.getCell("B3").value, "Reporte de gestiones — Septiembre 2026");
    assert.equal(sheet.getCell("B4").value, "Del 1 al 30 de septiembre de 2026");
    assert.match(sheet.getCell("B5").value, /Generado:.*CDMX/);
    assert.equal(sheet.pageSetup.orientation, "landscape");
    assert.equal(sheet.pageSetup.fitToWidth, 1);
    assert.equal(sheet.views[0].showGridLines, false);
  }
  const summary = workbook.getWorksheet("Resumen");
  assert.equal(summary.getCell("E8").value, 1000);
  assert.equal(summary.getCell("E12").formula, "IFERROR(E11/E8,0)");
  assert.equal(summary.getCell("E14").formula, "SUM(B14:D14)");
  const management = workbook.getWorksheet("Gestiones");
  assert.match(management.getCell("B6").formula, /^COUNTA/);
  assert.equal(management.getCell("B7").result ?? 0, populated ? 2 : 0);
  assert.equal(management.getColumn(6).hidden, true);
  if (populated) {
    assert.match(management.getCell("B7").formula, /SUMPRODUCT\(1\/COUNTIF\(F13:F15/);
    assert.equal(management.getCell("A13").numFmt, "dd/mm/yyyy");
    assert.equal(management.getCell("E13").alignment.wrapText, true);
  }
  const recovered = workbook.getWorksheet("Recuperado");
  assert.equal(recovered.getCell("B9").formula, "SUM(B6:B8)");
  const finalCell = recovered.getCell(recovered.rowCount, 5);
  assert.equal(finalCell.formula, "SUM(E12:E12)");
  assert.equal(finalCell.numFmt, "$#,##0.00");
  assert.equal(finalCell.alignment.horizontal, "right");
  if (populated) assert.match(recovered.getCell("B7").formula, /^SUMIF/);
});
