import { createRemoteJWKSet, jwtVerify } from "jose";
import { pool } from "../db/pool.js";
import { hasRole, parseBearer } from "./roles.js";
import { resolveFranchiseScope } from "./franchiseScope.js";

let cachedJwks;
let cachedIssuer;

export async function authenticate(req, res, next) {
  try {
    const token = parseBearer(req.get("authorization"));
    if (!token) {
      req.user = {
        id: null,
        email: null,
        display_name: "Lector",
        role: "lector",
        active: true,
        franchise_ids: [],
        isAnonymous: true,
      };
      return next();
    }

    const { payload } = await verifySupabaseToken(token);
    const { rows } = await pool.query(
      `select u.id, u.email, u.display_name, u.role,
              coalesce(array_agg(uf.franchise_id order by uf.franchise_id)
                filter (where uf.franchise_id is not null), '{}') as franchise_ids
       from app_users u
       left join user_franchises uf on uf.user_id = u.id
       where u.id = $1 and u.active = true
       group by u.id, u.email, u.display_name, u.role`,
      [payload.sub]
    );
    if (rows.length === 0) {
      return res.status(403).json({ error: "El usuario no tiene acceso a esta aplicación" });
    }

    req.user = { ...rows[0], isAnonymous: false };
    next();
  } catch (_error) {
    res.status(401).json({ error: "Sesión inválida o vencida" });
  }
}

export function requireClientAccess(paramName = "id") {
  return async (req, res, next) => {
    try {
      const allowed = resolveFranchiseScope(req.user, "todas");
      const { rows } = await pool.query(
        `select 1 from clientes where id = $1 and franchise_id = any($2::text[])`,
        [req.params[paramName], allowed]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Cliente no encontrado" });
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !hasRole(req.user.role, allowedRoles)) {
      return res.status(403).json({ error: "No tienes permisos para realizar esta acción" });
    }
    next();
  };
}

async function verifySupabaseToken(token) {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  if (!supabaseUrl) throw new Error("SUPABASE_URL no está configurada");

  const issuer = `${supabaseUrl}/auth/v1`;
  if (!cachedJwks || cachedIssuer !== issuer) {
    cachedIssuer = issuer;
    cachedJwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  }

  return jwtVerify(token, cachedJwks, {
    issuer,
    audience: "authenticated",
  });
}
