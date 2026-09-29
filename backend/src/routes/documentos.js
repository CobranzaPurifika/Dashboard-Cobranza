import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireClientAccess } from "../auth/authorization.js";
import { buildDocumentData, DOCUMENT_TYPES, invoiceSchedule } from "../domain/documentos.js";
import { generateDocumentPdf } from "../documents/generate.js";

export const documentosRouter = Router();

// Los días de crédito no se guardan en `facturas`: se toman de la fila más reciente de la BDD
// cruda (columna K) para ese folio y franquicia. Con ellos y la fecha de facturación se
// calculan el vencimiento y los días de atraso del documento (ver invoiceSchedule).
async function fetchInvoices(clienteId, franchiseId) {
  const { rows } = await pool.query(
    `select f.id, f.folio, f.monto::float as monto, f.dias_vencida,
            to_char(f.fecha_facturacion, 'YYYY-MM-DD') as fecha_facturacion_iso,
            (select case when r.payload->>10 ~ '^\\d{1,4}$' then (r.payload->>10)::int end
             from import_raw_rows r
             where r.source_type = 'bdd' and r.franchise_id = $2 and r.payload->>5 = f.folio
             order by r.imported_at desc, r.id desc
             limit 1) as dias_credito
     from facturas f
     where f.cliente_id = $1
     order by f.fecha_facturacion asc nulls last, f.folio asc`,
    [clienteId, franchiseId]
  );
  return rows;
}

async function fetchCliente(id) {
  const { rows } = await pool.query(`select id, name, franchise_id from clientes where id = $1`, [id]);
  return rows[0];
}

// GET /api/clientes/:id/documentos/facturas -> facturas con vencimiento calculado para el
// formulario (los días de atraso se cuentan en el navegador contra la fecha del documento).
documentosRouter.get("/:id/documentos/facturas", requireClientAccess(), async (req, res, next) => {
  try {
    const cliente = await fetchCliente(req.params.id);
    const invoices = await fetchInvoices(cliente.id, cliente.franchise_id);
    res.json(invoices.map((invoice) => ({
      id: invoice.id,
      folio: invoice.folio,
      monto: invoice.monto,
      fecha_facturacion_iso: invoice.fecha_facturacion_iso,
      dias_credito: invoice.dias_credito,
      vencimiento_iso: invoiceSchedule(invoice, invoice.fecha_facturacion_iso ?? "1970-01-01").vencimientoISO,
      dias_vencida_bdd: invoice.dias_vencida,
    })));
  } catch (err) {
    next(err);
  }
});

// POST /api/clientes/:id/documentos/:tipo  -> PDF (aviso_deuda | aviso_retiro | acuerdo_pagos)
// Solo lee datos: generar un documento no registra gestión ni modifica al cliente.
documentosRouter.post("/:id/documentos/:tipo", requireClientAccess(), async (req, res, next) => {
  try {
    const { id, tipo } = req.params;
    if (!DOCUMENT_TYPES.includes(tipo)) return res.status(404).json({ error: "Tipo de documento desconocido" });

    const cliente = await fetchCliente(id);
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
