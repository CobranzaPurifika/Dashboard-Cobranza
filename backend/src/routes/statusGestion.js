import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireRole } from "../auth/authorization.js";
import { slugifyStatusValue } from "../domain/statusGestion.js";

export const statusGestionRouter = Router();

statusGestionRouter.get("/", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      "select * from status_gestion order by sort_order asc"
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/status-gestion
// Crea un estatus nuevo. La llave (value) se genera a partir del nombre y no se puede editar
// después -- los demás campos arrancan con valores neutros y se ajustan con el PUT normal.
statusGestionRouter.post("/", requireRole("admin"), async (req, res, next) => {
  const label = String(req.body?.label ?? "").trim();
  if (!label || label.length > 80) {
    return res.status(400).json({ error: "El nombre del estatus debe tener entre 1 y 80 caracteres" });
  }

  try {
    const existing = await pool.query("select value, sort_order from status_gestion");
    const value = slugifyStatusValue(label, existing.rows.map((row) => row.value));
    const nextSortOrder = existing.rows.reduce((max, row) => Math.max(max, row.sort_order), -1) + 1;

    const { rows } = await pool.query(
      `insert into status_gestion (value, label, bg, fg, efectiva, sort_order)
       values ($1, $2, '#6b7280', '#ffffff', false, $3)
       returning *`,
      [value, label, nextSortOrder]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /api/status-gestion/reorder
// Recibe el nuevo orden completo (lista de value en el orden deseado) y reescribe sort_order
// para todos en una sola transacción, en vez de mandar un PUT por fila desde el cliente.
statusGestionRouter.put("/reorder", requireRole("admin"), async (req, res, next) => {
  const order = Array.isArray(req.body?.order) ? req.body.order.map(String) : [];
  if (!order.length) {
    return res.status(400).json({ error: "Falta el nuevo orden" });
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    for (let i = 0; i < order.length; i += 1) {
      await client.query("update status_gestion set sort_order = $1 where value = $2", [i, order[i]]);
    }
    const { rows } = await client.query("select * from status_gestion order by sort_order asc");
    await client.query("commit");
    res.json(rows);
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});

// DELETE /api/status-gestion/:value
// Falla con 409 si algún cliente todavía tiene este estatus asignado (restricción de llave
// foránea) -- hay que reasignarlos antes de poder borrar la clave.
statusGestionRouter.delete("/:value", requireRole("admin"), async (req, res, next) => {
  try {
    const { rowCount } = await pool.query("delete from status_gestion where value = $1", [req.params.value]);
    if (rowCount === 0) return res.status(404).json({ error: "Estatus no encontrado" });
    res.status(204).end();
  } catch (error) {
    if (error?.code === "23503") {
      return res.status(409).json({ error: "No se puede eliminar: hay clientes con este estatus asignado" });
    }
    next(error);
  }
});

// PUT /api/status-gestion/:value
// El valor es una llave estable para no romper los clientes ya gestionados. La configuración
// operativa puede ajustar etiqueta, color, efectividad y orden sin republicar la aplicación.
statusGestionRouter.put("/:value", requireRole("admin"), async (req, res, next) => {
  const label = String(req.body?.label ?? "").trim();
  const bg = String(req.body?.bg ?? "").trim();
  const efectiva = req.body?.efectiva === true;
  const sortOrder = Number(req.body?.sortOrder);

  if (!label || label.length > 80) {
    return res.status(400).json({ error: "El nombre del estatus debe tener entre 1 y 80 caracteres" });
  }
  if (!/^#[0-9a-f]{6}$/i.test(bg)) {
    return res.status(400).json({ error: "El color debe tener formato hexadecimal, por ejemplo #1ea97a" });
  }
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 999) {
    return res.status(400).json({ error: "El orden debe ser un entero entre 0 y 999" });
  }

  try {
    const { rows } = await pool.query(
      `update status_gestion
       set label = $1, bg = $2, efectiva = $3, sort_order = $4
       where value = $5
       returning *`,
      [label, bg, efectiva, sortOrder, req.params.value]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Estatus no encontrado" });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});
