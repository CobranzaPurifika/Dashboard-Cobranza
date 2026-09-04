import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireRole } from "../auth/authorization.js";

export const agendaRouter = Router();

// POST /api/clientes/:id/agenda  body: { fechaISO, hora, nota }
agendaRouter.post("/:id/agenda", requireRole("admin", "gestor"), async (req, res, next) => {
  const { id } = req.params;
  const { fechaISO, hora, nota } = req.body;
  if (!fechaISO) {
    return res.status(400).json({ error: "fechaISO es requerido" });
  }
  try {
    const fechaFmt = new Date(fechaISO + "T00:00:00").toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
    });
    const detail = `Contactar el ${fechaFmt}${hora ? `, ${hora} hrs` : ""}${nota ? ` — ${nota}` : ""}`;

    const { rows } = await pool.query(
      `update clientes
       set agenda_active = true, agenda_fecha_iso = $1, agenda_hora = $2,
           agenda_nota = $3, agenda_detail = $4, agenda_updated_by = $5, updated_at = now()
       where id = $6
       returning *`,
      [fechaISO, hora ?? null, nota ?? null, detail, req.user.id, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Cliente no encontrado" });
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/clientes/:id/agenda
agendaRouter.delete("/:id/agenda", requireRole("admin", "gestor"), async (req, res, next) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `update clientes
       set agenda_active = false, agenda_fecha_iso = null, agenda_hora = null,
           agenda_nota = null, agenda_detail = null, agenda_updated_by = $1, updated_at = now()
       where id = $2
       returning *`,
      [req.user.id, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Cliente no encontrado" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});
