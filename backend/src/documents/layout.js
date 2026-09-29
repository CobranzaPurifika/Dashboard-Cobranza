// Componentes de diseño compartidos por los tres documentos: membrete, pie de página,
// títulos, párrafos, tablas, recuadros destacados y bloque de firma. Es el equivalente en
// PDF directo (pdfkit) de scripts/components.js de la skill "documentos-purifika", que
// armaba un .docx y lo convertía con LibreOffice. Las medidas originales venían en twips
// (1/20 de punto) y medios puntos; aquí ya están en puntos.
import fs from "node:fs";
import PDFDocument from "pdfkit";
import { ASSETS, COLORS, NIVELES_DENSIDAD } from "./brand.js";

const FONT = { regular: "Carlito", bold: "Carlito-Bold", italic: "Carlito-Italic" };
const FONT_BUFFERS = {
  regular: fs.readFileSync(ASSETS.fonts.regular),
  bold: fs.readFileSync(ASSETS.fonts.bold),
  italic: fs.readFileSync(ASSETS.fonts.italic),
};
const LOGO = fs.readFileSync(ASSETS.logo);
const FOOTER = fs.readFileSync(ASSETS.footer);
const FIRMA = fs.existsSync(ASSETS.firma) ? fs.readFileSync(ASSETS.firma) : null;

// Proporciones de los PNG originales (logo 667x369, pie 567x40, firma 225x269).
const LOGO_WIDTH = 97.5;
const LOGO_HEIGHT = LOGO_WIDTH * (369 / 667);
const FOOTER_WIDTH = 345;
const FOOTER_HEIGHT = FOOTER_WIDTH * (40 / 567);
const FIRMA_RATIO = FIRMA ? FIRMA.readUInt32BE(20) / FIRMA.readUInt32BE(16) : 1;
const HEADER_TOP = 35;
const FOOTER_BOTTOM = 30;
const MIN_FONT = 8;

export class DocumentLayout {
  constructor({ pageSize, margins, density, header, signatureField }) {
    this.level = NIVELES_DENSIDAD[density];
    this.header = header;
    this.signatureField = signatureField;
    this.doc = new PDFDocument({ size: pageSize, margin: 0, autoFirstPage: false, bufferPages: true });
    // El campo de firma del cliente usa Helvetica (fuente estándar del visor): una fuente
    // incrustada como subconjunto no tendría los glifos de lo que el cliente escriba.
    this.doc.font("Helvetica");
    if (signatureField) this.doc.initForm();
    this.doc.registerFont(FONT.regular, FONT_BUFFERS.regular);
    this.doc.registerFont(FONT.bold, FONT_BUFFERS.bold);
    this.doc.registerFont(FONT.italic, FONT_BUFFERS.italic);

    this.sideMargin = margins.side;
    this.topMargin = margins.top;
    this.bottomMargin = margins.bottom;
    this.doc.on("pageAdded", () => this.decoratePage());
    this.doc.addPage();
  }

  // --- escalas por densidad -------------------------------------------------------------
  space(points) {
    return Math.max(0, points * this.level.escalaEspaciado);
  }

  font(size) {
    return Math.max(MIN_FONT, size + this.level.deltaFuente);
  }

  // Interlineado estilo Word: 240 = sencillo. El piso de 220 evita texto amontonado.
  lineGap(size, wordLine = 240) {
    const line = Math.max(220, wordLine * this.level.escalaLinea);
    return size * 1.22 * (line / 240 - 1);
  }

  get contentWidth() {
    return this.doc.page.width - this.sideMargin * 2;
  }

  get left() {
    return this.sideMargin;
  }

  get bottomLimit() {
    return this.doc.page.height - this.bottomMargin;
  }

  ensureSpace(height) {
    if (this.doc.y + height > this.bottomLimit) this.doc.addPage();
  }

  // --- membrete y pie en cada página ----------------------------------------------------
  decoratePage() {
    const { doc } = this;
    doc.page.margins = { top: 0, bottom: this.bottomMargin, left: this.sideMargin, right: this.sideMargin };
    const top = HEADER_TOP;
    doc.image(LOGO, this.left, top, { width: LOGO_WIDTH, height: LOGO_HEIGHT });

    const { franquicia, fecha } = this.header;
    const infoLeft = this.left + this.contentWidth * 0.45;
    const infoWidth = this.contentWidth * 0.55;
    const razonSize = this.font(9);
    const fechaSize = this.font(10);
    const infoHeight = razonSize * 1.22 + this.space(1) + fechaSize * 1.22;
    let infoY = top + (LOGO_HEIGHT - infoHeight) / 2;
    doc.fillColor(COLORS.grisClaro);
    this.runsLine([
      { text: franquicia.razonSocial, bold: true },
      { text: `  ·  Sucursal ${franquicia.ciudadEstado.split(",")[0]}` },
    ], { x: infoLeft, y: infoY, width: infoWidth, size: razonSize, align: "right" });
    infoY += razonSize * 1.22 + this.space(1);
    doc.font(FONT.regular).fontSize(fechaSize).fillColor(COLORS.grisTexto)
      .text(`${franquicia.ciudadEstado}, a ${fecha}`, infoLeft, infoY, { width: infoWidth, align: "right" });

    const ruleY = top + LOGO_HEIGHT + this.space(5) + 8;
    doc.moveTo(this.left, ruleY).lineTo(this.left + this.contentWidth, ruleY)
      .lineWidth(0.5).strokeColor(COLORS.turquesa).stroke();

    const footerTop = doc.page.height - FOOTER_BOTTOM - FOOTER_HEIGHT;
    const footerRuleY = footerTop - 8;
    doc.moveTo(this.left, footerRuleY).lineTo(this.left + this.contentWidth, footerRuleY)
      .lineWidth(0.5).strokeColor(COLORS.turquesa).stroke();
    doc.image(FOOTER, (doc.page.width - FOOTER_WIDTH) / 2, footerTop, { width: FOOTER_WIDTH, height: FOOTER_HEIGHT });

    this.bottomMargin = Math.max(this.bottomMargin, doc.page.height - footerRuleY + this.space(10));
    doc.page.margins.bottom = this.bottomMargin;
    doc.x = this.left;
    doc.y = Math.max(this.topMargin, ruleY + this.space(10));
  }

  // --- bloques de texto -----------------------------------------------------------------
  spacer(points) {
    this.doc.y += this.space(points);
  }

  text(content, { size = 11, color = COLORS.grisTexto, font = FONT.regular, after = 10, line = 300, align = "left", x, width } = {}) {
    const fontSize = this.font(size);
    this.doc.font(font).fontSize(fontSize).fillColor(color)
      .text(content, x ?? this.left, this.doc.y, { width: width ?? this.contentWidth, align, lineGap: this.lineGap(fontSize, line) });
    this.doc.y += this.space(after);
  }

  titulo(content) {
    this.text(content.toUpperCase(), { size: 16, color: COLORS.grisOscuro, font: FONT.bold, after: 4, line: 240 });
  }

  subtitulo(content, { after = 12 } = {}) {
    this.text(content, { size: 10, color: COLORS.turquesa, font: FONT.bold, after: 0, line: 240 });
    const y = this.doc.y + 3;
    this.doc.moveTo(this.left, y).lineTo(this.left + this.contentWidth, y)
      .lineWidth(0.75).strokeColor(COLORS.turquesa).stroke();
    this.doc.y = y + this.space(after);
  }

  parrafo(content, { after = 10, line = 300, bold = false, italics = false } = {}) {
    const font = bold ? FONT.bold : italics ? FONT.italic : FONT.regular;
    this.text(content, { font, after, line });
  }

  // Una sola línea con tramos de distinto formato, alineada a mano: pdfkit encima los tramos
  // cuando se combina `continued` con alineación centrada o a la derecha.
  runsLine(runs, { x, y, width, size, align }) {
    const { doc } = this;
    doc.fontSize(size);
    const widths = runs.map((run) => doc.font(run.bold ? FONT.bold : FONT.regular).widthOfString(run.text));
    const total = widths.reduce((sum, value) => sum + value, 0);
    let cursor = align === "right" ? x + width - total : align === "center" ? x + (width - total) / 2 : x;
    runs.forEach((run, index) => {
      doc.font(run.bold ? FONT.bold : FONT.regular).text(run.text, cursor, y, { lineBreak: false });
      cursor += widths[index];
    });
    return total;
  }

  // Párrafo con varios tramos de formato ({ text, bold }). Si cabe en una línea y va centrado
  // o a la derecha se alinea a mano (ver runsLine); si no, fluye alineado a la izquierda.
  parrafoMixto(runs, { after = 10, line = 300, align = "left", x, width } = {}) {
    const fontSize = this.font(11);
    const lineWidth = width ?? this.contentWidth;
    if (align !== "left") {
      this.doc.fontSize(fontSize);
      const total = runs.reduce((sum, run) =>
        sum + this.doc.font(run.bold ? FONT.bold : FONT.regular).widthOfString(run.text), 0);
      if (total <= lineWidth) {
        const y = this.doc.y;
        this.doc.fillColor(COLORS.grisTexto);
        this.runsLine(runs, { x: x ?? this.left, y, width: lineWidth, size: fontSize, align });
        this.doc.x = this.left;
        this.doc.y = y + fontSize * 1.22 + this.lineGap(fontSize, line) + this.space(after);
        return;
      }
      align = "left";
    }
    const options = { width: lineWidth, align, lineGap: this.lineGap(fontSize, line) };
    this.doc.fontSize(fontSize).fillColor(COLORS.grisTexto);
    runs.forEach((run, index) => {
      const last = index === runs.length - 1;
      this.doc.font(run.bold ? FONT.bold : FONT.regular);
      if (index === 0) this.doc.text(run.text, x ?? this.left, this.doc.y, { ...options, continued: !last });
      else this.doc.text(run.text, { ...options, continued: !last });
    });
    this.doc.y += this.space(after);
  }

  seccion(content, { before = 12, after = 6 } = {}) {
    this.doc.y += this.space(before);
    this.ensureSpace(this.font(12) * 3);
    this.text(content, { size: 12, color: COLORS.grisOscuro, font: FONT.bold, after, line: 240 });
  }

  bullet(content, { after = 6, line = 280 } = {}) {
    const fontSize = this.font(11);
    const indent = 18;
    const y = this.doc.y;
    this.doc.font(FONT.regular).fontSize(fontSize).fillColor(COLORS.grisTexto)
      .text("•", this.left + 4, y, { lineBreak: false });
    this.doc.text(content, this.left + indent, y, {
      width: this.contentWidth - indent,
      lineGap: this.lineGap(fontSize, line),
    });
    this.doc.x = this.left;
    this.doc.y += this.space(after);
  }

  // Bloque de destinatario ("A la atención de: ...") -- aparece una sola vez, en el cuerpo.
  destinatario(destinatario, { compacto = false } = {}) {
    this.spacer(compacto ? 2 : 4);
    this.text("A la atención de:", { size: 10, color: COLORS.grisClaro, after: 0, line: 240 });
    this.text(destinatario.nombre, { size: 11, color: COLORS.grisOscuro, font: FONT.bold, after: 0, line: 240 });
    if (destinatario.direccion) this.text(destinatario.direccion, { size: 10, after: 0, line: 240 });
    this.spacer(compacto ? 5 : 10);
  }

  // --- recuadros destacados -------------------------------------------------------------
  // Monto destacado: la cifra se lee sin sumar ninguna tabla. Rojo en casos de alerta.
  montoDestacado(etiqueta, monto, { alerta = false, compacto = false } = {}) {
    const { doc } = this;
    const color = alerta ? COLORS.rojoAlerta : COLORS.turquesa;
    const padY = this.space(compacto ? 5 : 8);
    const padX = this.space(compacto ? 8 : 10);
    const labelSize = this.font(11);
    const amountSize = this.font(16);
    const height = padY * 2 + amountSize * 1.22;
    this.ensureSpace(height);
    const top = doc.y;
    doc.rect(this.left, top, this.contentWidth, height).lineWidth(0.5).fillAndStroke(COLORS.fondoDestacado, color);

    const baseline = top + padY + amountSize * 0.95;
    doc.font(FONT.regular).fontSize(labelSize).fillColor(COLORS.grisTexto);
    const labelText = `${etiqueta}  `;
    doc.text(labelText, this.left + padX, baseline - labelSize * 0.95, { lineBreak: false });
    const labelWidth = doc.widthOfString(labelText);
    doc.font(FONT.bold).fontSize(amountSize).fillColor(color)
      .text(monto, this.left + padX + labelWidth, baseline - amountSize * 0.95, { lineBreak: false });
    doc.x = this.left;
    doc.y = top + height;
  }

  // Recuadro de énfasis para un bloque de texto (usado en "Forma de pago" del aviso de deuda).
  cajaDestacada(lines) {
    const { doc } = this;
    const padY = this.space(7);
    const padX = this.space(10);
    const innerWidth = this.contentWidth - padX * 2;
    const fontSize = this.font(11);
    const lineHeight = (runs) => {
      doc.fontSize(fontSize);
      return doc.font(FONT.regular).heightOfString(runs.map((run) => run.text).join(""), {
        width: innerWidth,
        lineGap: this.lineGap(fontSize, 300),
      });
    };
    const heights = lines.map((line) => lineHeight(line.runs));
    const height = padY * 2 + heights.reduce((sum, value) => sum + value, 0)
      + lines.slice(0, -1).reduce((sum, line) => sum + this.space(line.after ?? 2), 0);
    this.ensureSpace(height);
    const top = doc.y;
    doc.rect(this.left, top, this.contentWidth, height).lineWidth(0.5).fillAndStroke(COLORS.fondoDestacado, COLORS.turquesa);
    doc.y = top + padY;
    lines.forEach((line, index) => {
      this.parrafoMixto(line.runs, {
        after: index === lines.length - 1 ? 0 : line.after ?? 2,
        align: "center",
        x: this.left + padX,
        width: innerWidth,
      });
    });
    doc.x = this.left;
    doc.y = top + height;
  }

  // --- tabla de datos -------------------------------------------------------------------
  // columns: [{ header, width (%), align }], rows: [[celda, ...]]
  tabla(columns, rows, { compacto = false, lastRowIsTotal = false } = {}) {
    const { doc } = this;
    const widths = columns.map((column) => (column.width / 100) * this.contentWidth);
    const padY = this.space(compacto ? 2.75 : 4.5);
    const padX = this.space(compacto ? 5 : 6);
    const headerSize = this.font(9);
    const bodySize = this.font(9.5);

    const rowHeight = (cells, font, size) => {
      doc.font(font).fontSize(size);
      return Math.max(...cells.map((cell, index) =>
        doc.heightOfString(String(cell ?? ""), { width: widths[index] - padX * 2 }))) + padY * 2;
    };

    const drawRow = (cells, { font, size, color, fill }) => {
      const height = rowHeight(cells, font, size);
      if (doc.y + height > this.bottomLimit) {
        doc.addPage();
        drawHeader();
      }
      const top = doc.y;
      let x = this.left;
      cells.forEach((cell, index) => {
        doc.rect(x, top, widths[index], height).fill(fill);
        doc.rect(x, top, widths[index], height).lineWidth(0.25).stroke(COLORS.bordeTabla);
        doc.font(font).fontSize(size).fillColor(color)
          .text(String(cell ?? ""), x + padX, top + padY, { width: widths[index] - padX * 2, align: columns[index].align ?? "left" });
        x += widths[index];
      });
      doc.x = this.left;
      doc.y = top + height;
    };

    const drawHeader = () => drawRow(columns.map((column) => column.header), {
      font: FONT.bold, size: headerSize, color: COLORS.blanco, fill: COLORS.grisOscuro,
    });

    this.ensureSpace(rowHeight(columns.map((column) => column.header), FONT.bold, headerSize) * 2);
    drawHeader();
    rows.forEach((cells, index) => {
      const isTotal = lastRowIsTotal && index === rows.length - 1;
      drawRow(cells, {
        font: isTotal ? FONT.bold : FONT.regular,
        size: bodySize,
        color: isTotal ? COLORS.turquesa : COLORS.grisTexto,
        fill: isTotal ? COLORS.fondoDestacado : index % 2 === 0 ? COLORS.blanco : COLORS.filaAlterna,
      });
    });
  }

  // --- bloque de firma ------------------------------------------------------------------
  // Dos columnas: Purifika (firma escaneada, o línea en blanco si no existe el archivo) y el
  // cliente (línea en blanco con un campo de firma electrónica rellenable encima, para que
  // pueda firmar en pantalla sin imprimir). Nunca se parte entre dos páginas.
  bloqueFirma({ nombrePurifika, puestoPurifika, nombreCliente, compacto = false }) {
    const { doc } = this;
    const columnWidth = this.contentWidth / 2;
    const innerWidth = columnWidth - this.space(10);
    const nameSize = this.font(10);
    const subtitleSize = this.font(9);
    const firmaWidth = Math.max(24, (compacto ? 36 : 48.75) * this.level.escalaEspaciado);
    const firmaHeight = FIRMA ? firmaWidth * FIRMA_RATIO : 0;
    const beforeLine = this.space(compacto ? 16 : 30);
    const imageBlock = FIRMA ? this.space(compacto ? 3 : 5) + firmaHeight + this.space(1) : beforeLine;
    const textBlock = (name, subtitle) => {
      doc.font(FONT.bold).fontSize(nameSize);
      const nameHeight = doc.heightOfString(name, { width: innerWidth });
      doc.font(FONT.regular).fontSize(subtitleSize);
      return nameHeight + doc.heightOfString(subtitle, { width: innerWidth });
    };
    const clienteName = nombreCliente || "Nombre y firma del cliente";
    const height = this.space(compacto ? 2 : 5) + imageBlock + 4
      + Math.max(textBlock(nombrePurifika, puestoPurifika), textBlock(clienteName, "Cliente — conformidad"));
    this.ensureSpace(height);

    const top = doc.y + this.space(compacto ? 2 : 5);
    const lineY = top + imageBlock;
    const drawColumn = (x, name, subtitle, { signatureImage }) => {
      if (signatureImage) {
        doc.image(FIRMA, x, top + this.space(compacto ? 3 : 5), { width: firmaWidth, height: firmaHeight });
      } else {
        doc.moveTo(x, lineY).lineTo(x + innerWidth, lineY).lineWidth(0.5).strokeColor(COLORS.grisClaro).stroke();
      }
      doc.font(FONT.bold).fontSize(nameSize).fillColor(COLORS.grisOscuro).text(name, x, lineY + 4, { width: innerWidth });
      doc.font(FONT.regular).fontSize(subtitleSize).fillColor(COLORS.grisClaro).text(subtitle, x, doc.y, { width: innerWidth });
      return doc.y;
    };

    const leftBottom = drawColumn(this.left, nombrePurifika, puestoPurifika, { signatureImage: Boolean(FIRMA) });
    const clienteX = this.left + columnWidth;
    const rightBottom = drawColumn(clienteX, clienteName, "Cliente — conformidad", { signatureImage: false });

    if (this.signatureField) {
      const fieldHeight = 22;
      const fieldTop = Math.max(top, lineY - 4 - fieldHeight);
      const previousFont = doc._font;
      doc.font("Helvetica");
      doc.formText(`firma_cliente_p${this.doc.bufferedPageRange().count}`, clienteX + 3, fieldTop, innerWidth - 6, lineY - 2 - fieldTop, {
        DA: new String(`/${doc._font.id} 11 Tf 0.227 0.227 0.235 rg`),
        TU: new String("Firma electrónica del cliente — escriba su nombre completo"),
        borderColor: COLORS.turquesa,
        BS: { W: 1, S: "U" },
      });
      doc._font = previousFont;
    }

    doc.x = this.left;
    doc.y = Math.max(leftBottom, rightBottom);
  }

  // --- salida ---------------------------------------------------------------------------
  pageCount() {
    return this.doc.bufferedPageRange().count;
  }

  async toBuffer() {
    const chunks = [];
    const finished = new Promise((resolve, reject) => {
      this.doc.on("data", (chunk) => chunks.push(chunk));
      this.doc.on("end", resolve);
      this.doc.on("error", reject);
    });
    this.doc.end();
    await finished;
    return Buffer.concat(chunks);
  }
}
