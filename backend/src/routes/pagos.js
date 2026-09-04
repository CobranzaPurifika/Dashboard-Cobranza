import { Router } from "express";

export const pagosRouter = Router();

// Los pagos son eventos importados desde el archivo de Pagos. No se capturan de forma
// manual y nunca modifican clientes.saldo: BDD es la única fuente de verdad de cartera.
pagosRouter.post("/:id/pagos", (_req, res) => {
  res.status(405).json({
    error: "Los pagos se importan desde la fuente de Pagos; BDD conserva el saldo vigente",
  });
});
