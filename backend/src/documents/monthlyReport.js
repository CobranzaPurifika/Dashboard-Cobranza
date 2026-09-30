import fs from "node:fs";
import PDFDocument from "pdfkit";
import { ASSETS, COLORS, FRANQUICIAS } from "./brand.js";
import { fechaCorta, fechaLarga, montoTexto } from "./format.js";

const FONT = { regular: "Carlito", bold: "Carlito-Bold" };
const WATER_PATH = "M400 320c0 88.37-55.63 144-144 144s-144-55.63-144-144c0-94.83 103.23-222.85 134.89-259.88a12 12 0 0 1 18.23 0C296.77 97.15 400 225.17 400 320Z";
const WATER_SHINE = "M344 328a72 72 0 0 1-72 72";
const MARGIN = 36;
const CONTENT_TOP = 112;
const BOTTOM = 42;

const label = (id) => FRANQUICIAS[id]?.nombreComercial ?? id;
const shortFranchise = (id) => ({ aguascalientes: "AGS", cancun: "CUN", merida: "MID" })[id] ?? id;

export function renderMonthlyReportPdf(data, { generatedAt = new Date() } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", layout: "landscape", margin: 0, bufferPages: true });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.registerFont(FONT.regular, fs.readFileSync(ASSETS.fonts.regular));
    doc.registerFont(FONT.bold, fs.readFileSync(ASSETS.fonts.bold));

    const drawHeader = () => {
      doc.save().translate(MARGIN, 26).scale(0.075).lineWidth(24).strokeColor("#24c4cd")
        .path(WATER_PATH).stroke().path(WATER_SHINE).stroke().restore();
      doc.font(FONT.bold).fontSize(13).fillColor(COLORS.grisOscuro).text("PURIFIKA", 78, 29);
      doc.font(FONT.regular).fontSize(7).fillColor(COLORS.turquesa).text("COBRANZA", 78, 44, { characterSpacing: 1.5 });
      doc.image(ASSETS.logo, doc.page.width - 132, 22, { width: 92 });
      doc.font(FONT.bold).fontSize(16).fillColor(COLORS.grisTexto)
        .text("Reporte de gestiones del mes", 190, 25, { width: 410, align: "center" });
      const from = fechaLarga(data.desde).replace(/^\d+/, "1");
      doc.font(FONT.regular).fontSize(9).fillColor(COLORS.grisClaro)
        .text(`Del ${from} al ${fechaLarga(data.hasta)}`, 190, 47, { width: 410, align: "center" })
        .text(`Generado: ${generatedAt.toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}`, 190, 62, { width: 410, align: "center" });
      doc.moveTo(MARGIN, 91).lineTo(doc.page.width - MARGIN, 91).strokeColor(COLORS.turquesa).lineWidth(0.7).stroke();
      doc.x = MARGIN; doc.y = CONTENT_TOP;
    };
    doc.on("pageAdded", drawHeader);
    drawHeader();

    const addPage = () => doc.addPage({ size: "LETTER", layout: "landscape", margin: 0 });
    const ensure = (height) => { if (doc.y + height > doc.page.height - BOTTOM) addPage(); };
    const heading = (text) => {
      ensure(30);
      doc.font(FONT.bold).fontSize(14).fillColor(COLORS.turquesa).text(text, MARGIN, doc.y);
      doc.y += 8;
    };
    const columns = [
      { key: "fecha", title: "Fecha", width: 54 }, { key: "cliente", title: "Cliente", width: 175 },
      { key: "franchiseId", title: "Franquicia", width: 72 }, { key: "estatus", title: "Estatus", width: 115 },
      { key: "comentario", title: "Comentario", width: 304 },
    ];
    const tableHeader = (cols) => {
      const y = doc.y;
      doc.rect(MARGIN, y, 19, 19).fill(COLORS.turquesa);
      let x = MARGIN;
      for (const col of cols) {
        doc.rect(x, y, col.width, 19).fill(COLORS.turquesa);
        doc.font(FONT.bold).fontSize(8).fillColor(COLORS.blanco).text(col.title, x + 4, y + 5, { width: col.width - 8 });
        x += col.width;
      }
      doc.y = y + 19;
    };
    const table = (rows, cols, values) => {
      tableHeader(cols);
      rows.forEach((row, index) => {
        doc.font(FONT.regular).fontSize(8);
        const rendered = cols.map((col) => String(values(row, col.key)));
        const height = Math.max(20, ...rendered.map((value, i) => doc.heightOfString(value, { width: cols[i].width - 8, lineGap: 0 }) + 8));
        if (doc.y + height > doc.page.height - BOTTOM) { addPage(); tableHeader(cols); }
        const y = doc.y;
        if (index % 2) doc.rect(MARGIN, y, cols.reduce((sum, col) => sum + col.width, 0), height).fill(COLORS.filaAlterna);
        let x = MARGIN;
        rendered.forEach((value, i) => {
          doc.font(FONT.regular).fontSize(8).fillColor(COLORS.grisTexto).text(value, x + 4, y + 4, { width: cols[i].width - 8, height: height - 6 });
          x += cols[i].width;
        });
        doc.y = y + height;
      });
    };

    heading("1. Gestiones");
    const counts = data.franchiseIds.map((id) => `${shortFranchise(id)}: ${data.resumenGestiones.porFranquicia[id]}`).join("   ·   ");
    doc.font(FONT.regular).fontSize(10).fillColor(COLORS.grisTexto)
      .text(`Total: ${data.resumenGestiones.total}   ·   Clientes únicos: ${data.resumenGestiones.clientesUnicos}   ·   ${counts}`, MARGIN, doc.y);
    doc.y += 12;
    for (const group of data.gestionesPorFranquicia) {
      ensure(52);
      doc.font(FONT.bold).fontSize(11).fillColor(COLORS.grisOscuro)
        .text(`${label(group.franchiseId)} — ${group.rows.length} gestiones`, MARGIN, doc.y);
      doc.y += 6;
      if (group.rows.length) table(group.rows, columns, (row, key) => key === "fecha" ? fechaCorta(row.fecha).slice(0, 5) : key === "franchiseId" ? shortFranchise(row.franchiseId) : row[key]);
      else { doc.font(FONT.regular).fontSize(9).text("Sin gestiones en el periodo.", MARGIN, doc.y); doc.y += 10; }
      doc.y += 12;
    }

    addPage();
    heading("2. Recuperado");
    for (const item of data.recuperadoPorFranquicia) {
      doc.font(FONT.regular).fontSize(10).fillColor(COLORS.grisTexto).text(`${label(item.franchiseId)}: ${montoTexto(item.total)}`, MARGIN, doc.y, { continued: true });
      doc.text("     ", { continued: true });
    }
    doc.font(FONT.bold).text(`Total general: ${montoTexto(data.totalRecuperado)}`);
    doc.y += 12;
    const payCols = [{ key: "fecha", title: "Fecha", width: 70 }, { key: "cliente", title: "Cliente", width: 270 }, { key: "franchiseId", title: "Franquicia", width: 90 }, { key: "referencia", title: "Folio/Factura", width: 180 }, { key: "monto", title: "Monto", width: 110 }];
    if (data.pagos.length) table(data.pagos, payCols, (row, key) => key === "fecha" ? fechaCorta(row.fecha) : key === "franchiseId" ? shortFranchise(row.franchiseId) : key === "monto" ? montoTexto(row.monto) : row[key]);
    else doc.font(FONT.regular).fontSize(9).text("Sin pagos recuperados en el periodo.", MARGIN, doc.y);
    ensure(24);
    doc.font(FONT.bold).fontSize(10).fillColor(COLORS.grisTexto).text(`TOTAL RECUPERADO: ${montoTexto(data.totalRecuperado)}`, MARGIN, doc.y, { width: 720, align: "right" });

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      doc.font(FONT.regular).fontSize(8).fillColor(COLORS.grisClaro)
        .text(`Página ${i + 1} de ${range.count}`, MARGIN, doc.page.height - 28, { width: doc.page.width - MARGIN * 2, align: "center" });
    }
    doc.end();
  });
}
