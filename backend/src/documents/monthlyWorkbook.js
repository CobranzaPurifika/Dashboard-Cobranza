import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { LOGO_APP_DROP_BASE64 } from "./assets/logoAppDrop.js";

const PURIFIKA_LOGO = fileURLToPath(new URL("./assets/logo-purifika.png", import.meta.url));

export async function renderMonthlyWorkbook(data) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Purifika Cobranza";
  workbook.calcProperties.fullCalcOnLoad = true;

  const appLogoId = workbook.addImage({ base64: LOGO_APP_DROP_BASE64, extension: "png" });
  const purifikaLogoId = workbook.addImage({ buffer: await readFile(PURIFIKA_LOGO), extension: "png" });

  const summary = workbook.addWorksheet("Resumen");
  const management = workbook.addWorksheet("Gestiones");
  const recovered = workbook.addWorksheet("Recuperado");
  for (const sheet of workbook.worksheets) addHeader(sheet, data, appLogoId, purifikaLogoId);

  summary.addRow(["Indicador", "Aguascalientes", "Cancún", "Mérida", "Total"]);
  summary.addRow(["Gestiones del mes", ...data.franchiseIds.map((id) => data.resumenGestiones.porFranquicia[id] ?? 0),
    { formula: "SUM(B7:D7)" }]);
  summary.addRow(["Recuperado del mes", ...data.franchiseIds.map((id) =>
    data.recuperadoPorFranquicia.find((item) => item.franchiseId === id)?.total ?? 0), { formula: "SUM(B8:D8)" }]);

  management.addRow(["Total", { formula: "COUNTA(A10:A1048576)" }]);
  management.addRow(["Clientes únicos", { formula: "IFERROR(SUMPRODUCT(1/COUNTIF(B10:B1048576,B10:B1048576)),0)" }]);
  management.addRow([]);
  management.addRow(["Fecha", "Cliente", "Franquicia", "Estatus", "Comentario"]);
  for (const row of data.gestiones) management.addRow([new Date(`${row.fecha}T12:00:00Z`), row.cliente,
    franchiseCode(row.franchiseId), row.estatus, row.comentario]);
  styleTable(management, 9, [12, 38, 12, 20, 70]);

  recovered.addRow(["Aguascalientes", { formula: "SUMIF(C10:C1048576,\"AGS\",E10:E1048576)" }]);
  recovered.addRow(["Cancún", { formula: "SUMIF(C10:C1048576,\"CUN\",E10:E1048576)" }]);
  recovered.addRow(["Mérida", { formula: "SUMIF(C10:C1048576,\"MID\",E10:E1048576)" }]);
  recovered.addRow(["Fecha", "Cliente", "Franquicia", "Folio/Factura", "Monto"]);
  for (const row of data.pagos) recovered.addRow([new Date(`${row.fecha}T12:00:00Z`), row.cliente,
    franchiseCode(row.franchiseId), row.referencia, row.monto]);
  recovered.addRow(["TOTAL RECUPERADO", null, null, null, { formula: `SUM(E10:E${Math.max(10, recovered.rowCount)})` }]);
  styleTable(recovered, 9, [12, 38, 12, 24, 18]);
  recovered.getColumn(5).numFmt = "$#,##0.00";

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function addHeader(sheet, data, appLogoId, purifikaLogoId) {
  sheet.views = [{ showGridLines: false }];
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  sheet.properties.defaultRowHeight = 18;
  sheet.addImage(appLogoId, { tl: { col: 0, row: 0 }, ext: { width: 54, height: 54 } });
  sheet.addImage(purifikaLogoId, { tl: { col: 4, row: 0 }, ext: { width: 130, height: 46 } });
  sheet.getCell("B1").value = "PURIFIKA";
  sheet.getCell("B1").font = { name: "Arial", bold: true, color: { argb: "FF3D4548" }, size: 14 };
  sheet.getCell("B2").value = "C O B R A N Z A";
  sheet.getCell("B2").font = { name: "Arial", color: { argb: "FF24C4CD" }, size: 9 };
  sheet.mergeCells("B3:D3");
  sheet.getCell("B3").value = `Reporte de gestiones — ${data.desde?.slice(0, 7) ?? ""}`;
  sheet.mergeCells("B4:D4");
  sheet.getCell("B4").value = `Del ${data.desde} al ${data.hasta}`;
  sheet.getRow(5).border = { bottom: { style: "medium", color: { argb: "FF24C4CD" } } };
  sheet.eachRow((row) => row.eachCell((cell) => { cell.font = { ...cell.font, name: "Arial" }; }));
}

function styleTable(sheet, headerRow, widths) {
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.getRow(headerRow).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF24C4CD" } };
    cell.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
  });
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: widths.length } };
  sheet.views = [{ showGridLines: false, state: "frozen", ySplit: headerRow }];
}

function franchiseCode(id) {
  return ({ aguascalientes: "AGS", cancun: "CUN", merida: "MID" })[id] ?? id;
}
