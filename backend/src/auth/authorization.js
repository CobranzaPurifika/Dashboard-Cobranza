import { createRemoteJWKSet, jwtVerify } from "jose";
import { pool } from "../db/pool.js";
import { hasRole, parseBearer } from "./roles.js";

let cachedJwks;
let cachedIssuer;

export async function authenticate(req, res, next) {
  try {
    const token = parseBearer(req.get("authorization"));
    if (!token) return res.status(401).json({ error: "Autenticación requerida" });

    const { payload } = await verifySupabaseToken(token);
    const { rows } = await pool.query(
      `select id, email, display_name, role
       from app_users where id = $1 and active = true`,
      [payload.sub]
    );
    if (rows.length === 0) {
      return res.status(403).json({ error: "El usuario no tiene acceso a esta aplicación" });
    }

    req.user = rows[0];
    next();
  } catch (_error) {
    res.status(401).json({ error: "Sesión inválida o vencida" });
  }
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
