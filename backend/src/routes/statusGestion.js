import { Router } from "express";
import { pool } from "../db/pool.js";

export const statusGestionRouter = Router();

statusGestionRouter.get("/", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      "select * from status_gestion order by sort_order asc"
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});
