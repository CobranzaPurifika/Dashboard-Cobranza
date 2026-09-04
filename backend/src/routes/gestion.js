import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireClientAccess, requireRole } from "../auth/authorization.js";
import { addCalendarDays, mexicoTodayISO } from "../domain/dates.js";
import {
  buildAgendaDetail,
  isCallLaterStatus,
  validateAgenda,
} from "../domain/agenda.js";

export const gestionRouter = Router();

// POST /api/clientes/:id/gestion
// body: { estatusValue, comentario, agenda?: { fechaISO, hora, nota } }
// Reemplaza el flujo del artifact (mutar CLIENTS en memoria + republicar todo el HTML):
// una sola transacción que inserta el evento en la bitácora y actualiza el estado vivo del cliente.
gestionRouter.post(
  "/:id/gestion",
  requireRole("admin", "gestor"),
  requireClientAccess(),
  async (req, res, next) => {
    const { id } = req.params;
    const { estatusValue, comentario, agenda } = req.body;

    if (!estatusValue) {
      return res.status(400).json({ error: "estatusValue es requerido" });
    }

    const client = await pool.connect();
    try {
      await client.query("begin");

      const status = await client.query(
        "select value, label, bg, efectiva from status_gestion where value = $1",
        [estatusValue]
      );
      if (status.rows.length === 0) {
        await client.query("rollback");
        return res.status(400).json({ error: "estatusValue desconocido" });
      }
      const selectedStatus = status.rows[0];
      const { label, bg, efectiva } = selectedStatus;

      const nowISO = mexicoTodayISO();
      const isPaymentPromise = estatusValue === "promesa_pago" && efectiva === true;
      const promiseDeadlineISO = isPaymentPromise ? addCalendarDays(nowISO, 4) : null;
      const isCallLater = isCallLaterStatus(selectedStatus);
      const agendaError = isCallLater ? validateAgenda(agenda) : null;
      if (agendaError) {
        await client.query("rollback");
        return res.status(400).json({ error: agendaError });
      }
      if (isCallLater && agenda.fechaISO < nowISO) {
        await client.query("rollback");
        return res.status(400).json({ error: "La fecha para contactar no puede estar vencida" });
      }
      const agendaDetail = isCallLater ? buildAgendaDetail(agenda) : null;
      const descripcion = comentario ? `${label} — ${comentario}` : label;

      await client.query(
        `insert into gestion_timeline (cliente_id, fecha_iso, descripcion, dot_color, created_by)
         values ($1, $2, $3, $4, $5)`,
        [id, nowISO, descripcion, bg, req.user.id]
      );

      const updated = await client.query(
        `update clientes
         set estatus_value = $1, last_gestion_iso = $2,
             promise_gestion_iso = $3, promise_deadline_iso = $4,
             notas = coalesce($5, notas),
             agenda_active = $6, agenda_fecha_iso = $7, agenda_hora = $8,
             agenda_nota = $9, agenda_detail = $10, agenda_updated_by = $11,
             updated_at = now()
         where id = $12
         returning *`,
        [
          estatusValue,
          nowISO,
          isPaymentPromise ? nowISO : null,
          promiseDeadlineISO,
          comentario ?? null,
          isCallLater,
          isCallLater ? agenda.fechaISO : null,
          isCallLater ? agenda.hora : null,
          isCallLater ? agenda.nota ?? null : null,
          agendaDetail,
          req.user.id,
          id,
        ]
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
  }
);
