import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireRole } from "../auth/authorization.js";
import { FRANCHISE_IDS } from "../auth/franchiseScope.js";
import { createAuthUser, deleteAuthUser } from "../auth/supabaseAdmin.js";

export const usersRouter = Router();

const ROLES = ["admin", "supervisor", "gestor"];

// GET /api/users -- lista de cuentas para el apartado de Usuarios en Configuración.
usersRouter.get("/", requireRole("admin"), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select u.id, u.email, u.display_name, u.role, u.active,
              coalesce(array_agg(uf.franchise_id order by uf.franchise_id)
                filter (where uf.franchise_id is not null), '{}') as franchise_ids
       from app_users u
       left join user_franchises uf on uf.user_id = u.id
       group by u.id, u.email, u.display_name, u.role, u.active
       order by u.role, u.display_name`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// POST /api/users  body: { displayName, email, password, role, franchiseIds? }
// Crea la cuenta en Supabase Auth (Admin API, requiere SUPABASE_SERVICE_ROLE_KEY) y la
// referencia en app_users/user_franchises -- si el segundo paso falla, se borra la cuenta de
// Auth para no dejarla huérfana (existiría en Auth sin poder usarse dentro de la app).
usersRouter.post("/", requireRole("admin"), async (req, res, next) => {
  const displayName = String(req.body?.displayName ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const role = String(req.body?.role ?? "");
  const franchiseIds = Array.isArray(req.body?.franchiseIds) ? req.body.franchiseIds : [];

  if (!displayName || displayName.length > 120) {
    return res.status(400).json({ error: "El nombre debe tener entre 1 y 120 caracteres" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Correo inválido" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: "Rol inválido" });
  }
  const assignedFranchises = [...new Set(franchiseIds)].filter((id) => FRANCHISE_IDS.includes(id));
  if (role === "gestor" && assignedFranchises.length === 0) {
    return res.status(400).json({ error: "Un Gestor necesita al menos una franquicia asignada" });
  }

  let authUser;
  try {
    authUser = await createAuthUser({ email, password });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into app_users (id, email, display_name, role, active)
       values ($1, $2, $3, $4, true)`,
      [authUser.id, email, displayName, role]
    );
    if (role === "gestor") {
      for (const franchiseId of assignedFranchises) {
        await client.query(
          "insert into user_franchises (user_id, franchise_id) values ($1, $2)",
          [authUser.id, franchiseId]
        );
      }
    }
    await client.query("commit");
    res.status(201).json({
      id: authUser.id,
      email,
      display_name: displayName,
      role,
      active: true,
      franchise_ids: role === "gestor" ? assignedFranchises : [],
    });
  } catch (error) {
    await client.query("rollback");
    await deleteAuthUser(authUser.id);
    next(error);
  } finally {
    client.release();
  }
});
