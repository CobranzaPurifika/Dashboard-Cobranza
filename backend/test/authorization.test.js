import test from "node:test";
import assert from "node:assert/strict";

import { hasRole, parseBearer } from "../src/auth/roles.js";

test("extrae únicamente tokens Bearer", () => {
  assert.equal(parseBearer("Bearer token-seguro"), "token-seguro");
  assert.equal(parseBearer("Basic abc"), null);
  assert.equal(parseBearer(), null);
});

test("los lectores no pueden ejecutar acciones de gestor o administrador", () => {
  assert.equal(hasRole("lector", ["admin", "gestor"]), false);
  assert.equal(hasRole("gestor", ["admin", "gestor"]), true);
  assert.equal(hasRole("admin", ["admin"]), true);
});
