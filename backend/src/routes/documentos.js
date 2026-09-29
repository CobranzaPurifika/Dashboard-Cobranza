import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireClientAccess } from "../auth/authorization.js";
import { buildDocumentData, DOCUMENT_TYPES } from "../domain/documentos.js";
import { generateDocumentPdf } from "../documents/generate.js";

export const documentosRouter = Router();

// La fecha de vencimiento no se guarda en `facturas`: se toma de la fila más reciente de la
// BDD cruda (columna J, "DD/MM/AAAA") para ese folio y franquicia. Si no hay fila o el valor
// no tiene ese formato, el documento muestra "—" y avisa.
async function fetchInvoices(clienteId, franchiseId) {
  const { rows } = await pool.query(
    `select f.id, f.folio, f.monto::float as monto, f.dias_vencida,
            to_char(f.fecha_facturacion, 'YYYY-MM-DD') as fecha_facturacion_iso,
            to_char(f.fecha_facturacion, 'DD/MM/YYYY') as fecha_facturacion_texto,
            (select case when r.payload->>9 ~ '^\\d{2}/\\d{2}/\\d{4}$' then r.payload->>9 end
             from import_raw_rows r
             where r.source_type = 'bdd' and r.franchise_id = $2 and r.payload->>5 = f.folio
             order by r.imported_at desc, r.id desc
             limit 1) as fecha_vencimiento_texto
     from facturas f
     where f.cliente_id = $1`,
    [clienteId, franchiseId]
  );
  return rows;
}

// POST /api/clientes/:id/documentos/:tipo  -> PDF (aviso_deuda | aviso_retiro | acuerdo_pagos)
// Solo lee datos: generar un documento no registra gestión ni modifica al cliente.
documentosRouter.post("/:id/documentos/:tipo", requireClientAccess(), async (req, res, next) => {
  try {
    const { id, tipo } = req.params;
    if (!DOCUMENT_TYPES.includes(tipo)) return res.status(404).json({ error: "Tipo de documento desconocido" });

    const { rows } = await pool.query(`select id, name, franchise_id from clientes where id = $1`, [id]);
    const cliente = rows[0];
    const invoices = await fetchInvoices(cliente.id, cliente.franchise_id);
    const { data, warnings, fileName } = buildDocumentData(tipo, cliente, invoices, req.body ?? {});
    const pdf = await generateDocumentPdf(tipo, data);
    if (!pdf.fitsOnePage) {
      warnings.push(`El documento quedó en ${pdf.pages} páginas: tiene demasiadas facturas o parcialidades para una sola hoja aun con la letra al mínimo legible.`);
    }

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "X-Documento-Nombre": encodeURIComponent(fileName),
      "X-Documento-Avisos": encodeURIComponent(JSON.stringify(warnings)),
      "Cache-Control": "no-store",
    });
    res.send(pdf.buffer);
  } catch (err) {
    next(err);
  }
});
