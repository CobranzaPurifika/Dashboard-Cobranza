import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { LOGO_APP_FULL_BASE64 } from "./assets/logoAppFull.js";

const IDS = ["aguascalientes", "cancun", "merida"];
const LABELS = ["Aguascalientes", "Cancún", "Mérida"];
const CODES = ["AGS", "CUN", "MID"];
const MONEY = "$#,##0.00";
const TURQUOISE = "FF24C4CD";
const formula = (value, result = 0) => ({ formula: value, result });
const code = (id) => CODES[IDS.indexOf(id)] ?? id;
const date = (iso) => new Date(`${iso}T12:00:00Z`);

export async function renderMonthlyWorkbook(data) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Purifika Cobranza";
  workbook.calcProperties.fullCalcOnLoad = true;
  const appLogo = workbook.addImage({ base64: LOGO_APP_FULL_BASE64, extension: "png" });
  const logo = workbook.addImage({ buffer: await readFile(new URL("./assets/logo-purifika.png", import.meta.url)), extension: "png" });
  const summary = workbook.addWorksheet("Resumen");
  const management = workbook.addWorksheet("Gestiones");
  const recovered = workbook.addWorksheet("Recuperado");
  [32, 22, 22, 22, 24].forEach((width, i) => { summary.getColumn(i + 1).width = width; });
  [12, 38, 12, 20, 70].forEach((width, i) => { management.getColumn(i + 1).width = width; });
  [12, 38, 12, 24, 22].forEach((width, i) => { recovered.getColumn(i + 1).width = width; });
  for (const sheet of workbook.worksheets) addHeader(sheet, data, appLogo, logo);
  addSummary(summary, data.summary);
  addManagement(management, data);
  addRecovered(recovered, data);
  for (const sheet of workbook.worksheets) {
    sheet.eachRow((row) => row.eachCell((cell) => { cell.font = { name: "Arial", size: 10, ...cell.font }; }));
    sheet.pageSetup.printArea = `A1:E${sheet.rowCount}`;
    sheet.pageSetup.printTitlesRow = "1:5";
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// Mismo encabezado que la maqueta aprobada: logo de la app a la izquierda, logo Purifika a la
// derecha, título del mes centrado en las filas 1-2, nombre de la hoja y periodo debajo.
function addHeader(sheet, data, appLogo, logo) {
  sheet.views = [{ showGridLines: false }];
  sheet.pageSetup = { orientation: "landscape", paperSize: 1, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  sheet.properties.defaultRowHeight = 20;
  [22, 20, 16, 16, 8].forEach((height, i) => { sheet.getRow(i + 1).height = height; });
  sheet.addImage(appLogo, { tl: { col: 0.1, row: 0.15 }, ext: { width: 131, height: 48 } });
  sheet.addImage(logo, { tl: { col: 4.15, row: 0 }, ext: { width: 97, height: 54 } });
  const month = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(date(data.desde)).replace(" de ", " ");
  const longDate = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date(data.hasta));
  const generated = new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short", timeZone: "America/Mexico_City" }).format(data.generatedAt ?? new Date());
  sheet.mergeCells("B1:D2");
  sheet.getCell("B1").value = `Reporte de gestiones — ${month[0].toUpperCase()}${month.slice(1)}`;
  sheet.getCell("B1").font = { name: "Arial", bold: true, size: 16, color: { argb: "FF3A4A50" } };
  sheet.getCell("B1").alignment = { horizontal: "center", vertical: "middle" };
  sheet.mergeCells("B3:D3");
  sheet.getCell("B3").value = sheet.name;
  sheet.getCell("B3").font = { name: "Arial", size: 10, color: { argb: "FF8A969B" } };
  sheet.getCell("B3").alignment = { horizontal: "center", vertical: "middle" };
  sheet.mergeCells("B4:D4");
  sheet.getCell("B4").value = `Del 1 al ${longDate} · Generado: ${generated} (CDMX)`;
  sheet.getCell("B4").font = { name: "Arial", size: 9, color: { argb: "FF8A969B" } };
  sheet.getCell("B4").alignment = { horizontal: "center", vertical: "middle", shrinkToFit: true };
  for (let col = 1; col <= 5; col++) sheet.getCell(5, col).border = { bottom: { style: "thin", color: { argb: TURQUOISE } } };
}

function heading(sheet, label) {
  const row = sheet.addRow([label]);
  sheet.mergeCells(row.number, 1, row.number, 5);
  row.font = { name: "Arial", bold: true, color: { argb: TURQUOISE } };
  row.height = 25;
}

function addSummary(sheet, summary) {
  sheet.addRow(["Indicador", ...LABELS, "Total"]);
  colorHeader(sheet.getRow(6));
  const { groups, isCurrent, hasta, catalog } = summary;
  const ids = [...IDS, "todas"];
  heading(sheet, `Cartera al corte — ${isCurrent ? "Al día de hoy" : hasta}`);
  if (!ids.some((id) => groups[id]?.portfolio)) sheet.addRow(["Corte no disponible"]);
  else {
    const start = sheet.rowCount + 1;
    ["Saldo total", "% al corriente", "% cartera vencida", "Monto +60 días", "% +60 días"].forEach((label) => sheet.addRow([label]));
    ids.forEach((id, i) => {
      const col = i + 2;
      const letter = String.fromCharCode(66 + i);
      const p = groups[id]?.portfolio;
      if (!p) { sheet.getCell(start, col).value = "Corte no disponible"; return; }
      const total = isCurrent && id === "todas";
      sheet.getCell(start, col).value = total ? formula(`SUM(B${start}:D${start})`, p.saldo) : p.saldo;
      sheet.getCell(start + 3, col).value = total ? formula(`SUM(B${start + 3}:D${start + 3})`, p.mas60Monto) : p.mas60Monto;
      if (isCurrent) {
        // Source invoice amounts are hidden outside the print area. Portfolio balance
        // and invoice total are distinct, exactly as in dashboard.js.
        const sourceCol = i + 6;
        const sourceLetter = String.fromCharCode(70 + i);
        sheet.getColumn(sourceCol).hidden = true;
        [p.total, p.corrienteMonto, p.vencidaMonto].forEach((value, j) => {
          sheet.getCell(start + j, sourceCol).value = total ? formula(`SUM(F${start + j}:H${start + j})`, value) : value;
        });
        sheet.getCell(start + 1, col).value = formula(`IFERROR(${sourceLetter}${start + 1}/${sourceLetter}${start},0)`, p.total ? p.corrienteMonto / p.total : 0);
        sheet.getCell(start + 2, col).value = formula(`IFERROR(${sourceLetter}${start + 2}/${sourceLetter}${start},0)`, p.total ? p.vencidaMonto / p.total : 0);
        sheet.getCell(start + 4, col).value = formula(`IFERROR(${letter}${start + 3}/${sourceLetter}${start},0)`, p.total ? p.mas60Monto / p.total : 0);
      } else {
        sheet.getCell(start + 1, col).value = p.corriente;
        sheet.getCell(start + 2, col).value = p.vencida;
        sheet.getCell(start + 4, col).value = formula(`IFERROR(${letter}${start + 3}/${letter}${start},0)`, p.mas60);
      }
      [0, 3].forEach((j) => { sheet.getCell(start + j, col).numFmt = MONEY; });
      [1, 2, 4].forEach((j) => { sheet.getCell(start + j, col).numFmt = "0.0%"; });
    });
  }
  const metric = (label, key, money = false) => {
    const values = IDS.map((id) => groups[id]?.[key] ?? 0);
    const row = sheet.addRow([label, ...values]);
    row.getCell(5).value = formula(`SUM(B${row.number}:D${row.number})`, values.reduce((a, b) => a + b, 0));
    if (money) for (let c = 2; c <= 5; c++) row.getCell(c).numFmt = MONEY;
    return row.number;
  };
  heading(sheet, "Gestiones del mes");
  const total = metric("Total de gestiones", "total");
  metric("Clientes gestionados", "clientes");
  const effective = metric("Efectivas", "efectivas");
  const agreed = metric("Acordadas", "acordadas");
  const fulfilled = metric("Cumplidas", "cumplidas");
  for (const [label, numerator, denominator, key] of [["Contactabilidad", effective, total, "contactabilidad"], ["Tasa de acuerdo", agreed, effective, "tasaAcuerdo"], ["Cumplimiento", fulfilled, agreed, "cumplimiento"]]) {
    const row = sheet.addRow([label]);
    ids.forEach((id, i) => {
      const letter = String.fromCharCode(66 + i);
      row.getCell(i + 2).value = formula(`IFERROR(${letter}${numerator}/${letter}${denominator},0)`, groups[id]?.[key] ?? 0);
      row.getCell(i + 2).numFmt = "0.0%";
    });
  }
  heading(sheet, "Distribución de estatus");
  for (const status of catalog) {
    const values = IDS.map((id) => groups[id]?.distribution[status.value] ?? 0);
    const row = sheet.addRow([status.label, ...values]);
    row.getCell(5).value = formula(`SUM(B${row.number}:D${row.number})`, values.reduce((a, b) => a + b, 0));
  }
  heading(sheet, "Recuperado del mes");
  metric("Monto recuperado", "recuperado", true);
  sheet.views = [{ showGridLines: false, state: "frozen", ySplit: 6 }];
}

function addManagement(sheet, data) {
  const header = 12, first = header + 1, last = header + data.gestiones.length;
  sheet.getCell("A6").value = "Total";
  sheet.getCell("B6").value = formula(last >= first ? `COUNTA(A${first}:A${last})` : "COUNTA(A13)", data.gestiones.length);
  sheet.getCell("A7").value = "Clientes únicos";
  sheet.getCell("B7").value = formula(last >= first ? `SUMPRODUCT(1/COUNTIF(F${first}:F${last},F${first}:F${last}))` : "0", data.resumenGestiones.clientesUnicos);
  IDS.forEach((id, i) => {
    sheet.getCell(8 + i, 1).value = LABELS[i];
    sheet.getCell(8 + i, 2).value = formula(`COUNTIF(C${first}:C${Math.max(first, last)},"${CODES[i]}")`, data.resumenGestiones.porFranquicia[id] ?? 0);
  });
  sheet.getRow(header).values = ["Fecha", "Cliente", "Franquicia", "Estatus", "Comentario"];
  // Stable IDs avoid merging unrelated customers who share a display name.
  sheet.getColumn(6).hidden = true;
  data.gestiones.forEach((r, i) => { sheet.getRow(first + i).values = [date(r.fecha), r.cliente, code(r.franchiseId), r.estatus, r.comentario, String(r.clienteId)]; });
  styleTable(sheet, header, last, true);
}

function addRecovered(sheet, data) {
  const header = 11, first = 12, last = header + data.pagos.length;
  const end = Math.max(first, last); // Reserve an empty detail row before the total.
  IDS.forEach((id, i) => {
    sheet.getCell(6 + i, 1).value = LABELS[i];
    sheet.getCell(6 + i, 2).value = formula(`SUMIF(C${first}:C${end},"${CODES[i]}",E${first}:E${end})`, data.recuperadoPorFranquicia.find((r) => r.franchiseId === id)?.total ?? 0);
    sheet.getCell(6 + i, 2).numFmt = MONEY;
  });
  sheet.getCell("A9").value = "Total general";
  sheet.getCell("B9").value = formula("SUM(B6:B8)", data.totalRecuperado);
  sheet.getCell("B9").numFmt = MONEY;
  sheet.getRow(header).values = ["Fecha", "Cliente", "Franquicia", "Folio/Factura", "Monto"];
  data.pagos.forEach((r, i) => { sheet.getRow(first + i).values = [date(r.fecha), r.cliente, code(r.franchiseId), r.referencia, r.monto]; });
  const total = sheet.getRow(end + 1);
  total.values = ["TOTAL RECUPERADO", null, null, null, formula(`SUM(E${first}:E${end})`, data.totalRecuperado)];
  total.font = { name: "Arial", bold: true };
  styleTable(sheet, header, last, false);
  sheet.getColumn(5).numFmt = MONEY;
  sheet.getColumn(5).alignment = { horizontal: "right" };
}

function colorHeader(row) {
  for (let c = 1; c <= 5; c++) {
    row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TURQUOISE } };
    row.getCell(c).font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
  }
}

function styleTable(sheet, header, last, comments) {
  colorHeader(sheet.getRow(header));
  for (let r = header + 1; r <= last; r++) {
    const row = sheet.getRow(r);
    row.getCell(1).numFmt = "dd/mm/yyyy";
    for (let c = 1; c <= 5; c++) {
      row.getCell(c).alignment = { vertical: "top", wrapText: true };
      if ((r - header) % 2 === 0) row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F7F8" } };
    }
    if (comments) row.height = Math.max(22, 15 * String(row.getCell(5).value).split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 70)), 0));
  }
  sheet.autoFilter = { from: { row: header, column: 1 }, to: { row: Math.max(header, last), column: 5 } };
  sheet.views = [{ showGridLines: false, state: "frozen", ySplit: header }];
}
