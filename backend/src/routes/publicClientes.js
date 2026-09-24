import { Router } from "express";
import { pool } from "../db/pool.js";
import { resolveFranchiseScope } from "../auth/franchiseScope.js";
import { fetchClienteDetail } from "../domain/clienteDetail.js";

export const publicClientesRouter = Router();

// GET /api/public-clientes?q=texto&franchise=cancun
// Buscador para el Lector (sin sesión, ver server.js): mismo criterio de nombre que la
// búsqueda interna de Prioridad, más la columna "Cliente" del BDD (facturas.cliente_nombre) --
// esa columna a veces trae el nombre completo o una variante distinta a Grupo de facturación
// (verificado contra datos reales antes de agregarla).
publicClientesRouter.get("/", async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return res.json({ rows: [] });
    const allowed = resolveFranchiseScope(req.user, req.query.franchise || "todas");
    const { rows } = await pool.query(
      `select distinct c.id, c.name, c.franchise_id, c.saldo::float, c.tramo, c.tramo_label
       from clientes c
       where c.franchise_id = any($1::text[])
         and (
           c.name ilike $2
           or exists (
             select 1 from facturas f
             where f.cliente_id = c.id and f.cliente_nombre ilike $2
           )
         )
       order by c.name asc
       limit 25`,
      [allowed, `%${q}%`]
    );
    res.json({ rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/public-clientes/:id -- mismo detalle que /api/clientes/:id; no se recorta nada
// aquí (el negocio confirmó que este enlace lo usan compañeros de trabajo, no el público
// externo -- el recorte de "últimas N" es solo de presentación, lo hace el frontend).
publicClientesRouter.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowed = resolveFranchiseScope(req.user, "todas");
    const detail = await fetchClienteDetail(id, allowed);
    if (!detail) return res.status(404).json({ error: "Cliente no encontrado" });
    res.json(detail);
  } catch (err) {
    next(err);
  }
});
