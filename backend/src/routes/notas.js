import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireClientAccess, requireRole } from "../auth/authorization.js";

export const notasRouter = Router();

// PUT /api/clientes/:id/notas  body: { nota }
// Las notas son contexto operativo, no una gestión: no crean timeline, no cambian
// estatus y tampoco modifican la fecha de última gestión.
notasRouter.put(
  "/:id/notas",
  requireRole("admin", "gestor"),
  requireClientAccess(),
  async (req, res, next) => {
    const nota = String(req.body?.nota ?? "").trim();
    if (nota.length > 4_000) {
      return res.status(400).json({ error: "La nota no puede exceder 4,000 caracteres" });
    }

    try {
      const { rows } = await pool.query(
        `update clientes set notas = $1, updated_at = now()
         where id = $2 returning id, notas`,
        [nota || null, req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Cliente no encontrado" });
      res.json(rows[0]);
    } catch (error) {
      next(error);
    }
  }
);
