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
        `update payment_promises set status = 'cancelled'
         where cliente_id = $1 and status = 'active'`,
        [id]
      );

      if (isPaymentPromise) {
        await client.query(
          `insert into payment_promises
             (cliente_id, gestion_iso, deadline_iso, created_by)
           values ($1, $2, $3, $4)`,
          [id, nowISO, promiseDeadlineISO, req.user.id]
        );
      }

      await client.query(
        `insert into gestion_timeline (cliente_id, fecha_iso, descripcion, dot_color, estatus_value, created_by)
         values ($1, $2, $3, $4, $5, $6)`,
        [id, nowISO, descripcion, bg, estatusValue, req.user.id]
      );

      const updated = await client.query(
        `update clientes
         set estatus_value = $1, last_gestion_iso = $2,
             promise_gestion_iso = $3, promise_deadline_iso = $4,
             agenda_active = $5, agenda_fecha_iso = $6, agenda_hora = $7,
             agenda_nota = $8, agenda_detail = $9, agenda_updated_by = $10,
             updated_at = now()
         where id = $11
         returning *`,
        [
          estatusValue,
          nowISO,
          isPaymentPromise ? nowISO : null,
          promiseDeadlineISO,
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

// DELETE /api/clientes/:id/promise
// Descarta la promesa de pago incumplida sin abrir la ficha (botón ✕ de "Pendientes" en
// Gestión). Cancela la promesa activa en la bitácora igual que al registrar una nueva
// gestión, pero sin crear un evento nuevo -- el gestor simplemente la está quitando de la
// lista de pendientes.
gestionRouter.delete(
  "/:id/promise",
  requireRole("admin", "gestor"),
  requireClientAccess(),
  async (req, res, next) => {
    const { id } = req.params;
    try {
      await pool.query(
        `update payment_promises set status = 'cancelled'
         where cliente_id = $1 and status = 'active'`,
        [id]
      );

      const { rows } = await pool.query(
        `update clientes
         set promise_gestion_iso = null, promise_deadline_iso = null, updated_at = now()
         where id = $1
         returning *`,
        [id]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Cliente no encontrado" });
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  }
);
