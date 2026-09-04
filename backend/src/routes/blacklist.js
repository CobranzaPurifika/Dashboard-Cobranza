import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireClientAccess, requireRole } from "../auth/authorization.js";
import { resolveFranchiseScope } from "../auth/franchiseScope.js";

export const blacklistRouter = Router();

// GET /api/blacklist
blacklistRouter.get("/blacklist", async (req, res, next) => {
  try {
    const allowed = resolveFranchiseScope(req.user, "todas");
    const { rows } = await pool.query(
      `select b.*, c.name, c.franchise_id
       from blacklist b join clientes c on c.id = b.id
       where c.franchise_id = any($1::text[])
       order by b.fecha desc nulls last`,
      [allowed]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/clientes/:id/blacklist  body: { motivo }
blacklistRouter.post("/clientes/:id/blacklist", requireRole("admin", "gestor"), requireClientAccess(), async (req, res, next) => {
  const { id } = req.params;
  const { motivo } = req.body;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const hoy = new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "short" });

    await client.query(
      `insert into blacklist (id, motivo, fecha, created_by) values ($1, $2, $3, $4)
       on conflict (id) do update
         set motivo = excluded.motivo, fecha = excluded.fecha, created_by = excluded.created_by`,
      [id, motivo ?? null, hoy, req.user.id]
    );
    const updated = await client.query(
      `update clientes set is_blacklisted = true, updated_at = now() where id = $1 returning *`,
      [id]
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

// DELETE /api/clientes/:id/blacklist
blacklistRouter.delete("/clientes/:id/blacklist", requireRole("admin", "gestor"), requireClientAccess(), async (req, res, next) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`delete from blacklist where id = $1`, [id]);
    const updated = await client.query(
      `update clientes set is_blacklisted = false, updated_at = now() where id = $1 returning *`,
      [id]
    );
    if (updated.rows.length === 0) {
      await client.query("rollback");
      return res.status(404).json({ error: "Cliente no encontrado" });
    }
    await client.query("commit");
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query("rollback");
    next(err);
  } finally {
    client.release();
  }
});
