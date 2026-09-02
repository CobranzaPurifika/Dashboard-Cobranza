import { Router } from "express";
import { pool } from "../db/pool.js";

export const pagosRouter = Router();

// POST /api/clientes/:id/pagos
// body: { monto, forma, folio?, factura? }
pagosRouter.post("/:id/pagos", async (req, res, next) => {
  const { id } = req.params;
  const { monto, forma, folio, factura } = req.body;

  if (!monto || Number(monto) <= 0) {
    return res.status(400).json({ error: "monto debe ser mayor a 0" });
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const nowISO = new Date().toISOString().slice(0, 10);
    await client.query(
      `insert into pagos (cliente_id, fecha_iso, monto, forma, folio, factura)
       values ($1, $2, $3, $4, $5, $6)`,
      [id, nowISO, monto, forma ?? "Transferencia bancaria", folio ?? null, factura ?? null]
    );

    const montoFmt = Number(monto).toLocaleString("es-MX", { minimumFractionDigits: 2 });
    await client.query(
      `insert into gestion_timeline (cliente_id, fecha_iso, descripcion, dot_color)
       values ($1, $2, $3, '#1E8E4F')`,
      [id, nowISO, `Pago aplicado — $${montoFmt} (${forma ?? "Transferencia bancaria"}${factura ? `, factura ${factura}` : ""})`]
    );

    const updated = await client.query(
      `update clientes set saldo = greatest(saldo - $1, 0), updated_at = now()
       where id = $2 returning *`,
      [monto, id]
    );

    if (updated.rows.length === 0) {
      await client.query("rollback");
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    await client.query("commit");
    res.status(201).json(updated.rows[0]);
  } catch (err) {
    await client.query("rollback");
    next(err);
  } finally {
    client.release();
  }
});
