import test from "node:test";
import assert from "node:assert/strict";

import { slugifyStatusValue } from "../src/domain/statusGestion.js";

test("genera una llave en snake_case a partir del nombre", () => {
  assert.equal(slugifyStatusValue("Contacto Prioritario"), "contacto_prioritario");
});

test("quita acentos y símbolos", () => {
  assert.equal(slugifyStatusValue("¡Número equivocado!"), "numero_equivocado");
});

test("evita colisiones agregando un sufijo", () => {
  assert.equal(slugifyStatusValue("Nuevo", ["nuevo"]), "nuevo_2");
  assert.equal(slugifyStatusValue("Nuevo", ["nuevo", "nuevo_2"]), "nuevo_3");
});

test("cae a un valor por defecto si el nombre no deja caracteres válidos", () => {
  assert.equal(slugifyStatusValue("!!!"), "estatus");
});
