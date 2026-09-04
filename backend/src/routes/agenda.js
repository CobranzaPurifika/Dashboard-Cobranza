import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireClientAccess, requireRole } from "../auth/authorization.js";
import {
  buildAgendaDetail,
  isCallLaterStatus,
  validateAgenda,
} from "../domain/agenda.js";
import { mexicoTodayISO } from "../domain/dates.js";

export const agendaRouter = Router();

// POST /api/clientes/:id/agenda  body: { fechaISO, hora, nota }
agendaRouter.post("/:id/agenda", requireRole("admin", "gestor"), requireClientAccess(), async (req, res, next) => {
  const { id } = req.params;
  const { fechaISO, hora, nota } = req.body;
  const agendaError = validateAgenda({ fechaISO, hora });
  if (agendaError) return res.status(400).json({ error: agendaError });
  if (fechaISO < mexicoTodayISO()) {
    return res.status(400).json({ error: "La fecha para contactar no puede estar vencida" });
  }

  try {
    const current = await pool.query(
      `select c.id, c.estatus_value, s.label
       from clientes c
       left join status_gestion s on s.value = c.estatus_value
       where c.id = $1`,
      [id]
    );
    if (current.rows.length === 0) return res.status(404).json({ error: "Cliente no encontrado" });
    if (!isCallLaterStatus({ value: current.rows[0].estatus_value, label: current.rows[0].label })) {
      return res.status(409).json({ error: "Solo se puede agendar con el estatus Llamar más tarde" });
    }

    const detail = buildAgendaDetail({ fechaISO, hora, nota });

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
agendaRouter.delete("/:id/agenda", requireRole("admin", "gestor"), requireClientAccess(), async (req, res, next) => {
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
