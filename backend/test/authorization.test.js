import test from "node:test";
import assert from "node:assert/strict";

import { hasRole, parseBearer } from "../src/auth/roles.js";
import { canAccessFranchise, resolveFranchiseScope } from "../src/auth/franchiseScope.js";

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

test("administradores y lectores pueden consultar todas las franquicias", () => {
  assert.deepEqual(resolveFranchiseScope({ role: "admin" }, "todas"), [
    "aguascalientes",
    "cancun",
    "merida",
  ]);
  assert.equal(canAccessFranchise({ role: "lector" }, "merida"), true);
});

test("un gestor solo puede consultar sus franquicias asignadas", () => {
  const gestor = { role: "gestor", franchise_ids: ["aguascalientes", "merida"] };
  assert.deepEqual(resolveFranchiseScope(gestor, "todas"), ["aguascalientes", "merida"]);
  assert.equal(canAccessFranchise(gestor, "merida"), true);
  assert.equal(canAccessFranchise(gestor, "cancun"), false);
});
