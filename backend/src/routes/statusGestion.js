import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireRole } from "../auth/authorization.js";

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
