import test from "node:test";
import assert from "node:assert/strict";

import { hasRole, isAuthenticatedUser, parseBearer } from "../src/auth/roles.js";
import { canAccessFranchise, resolveFranchiseScope } from "../src/auth/franchiseScope.js";
import { sanitizeDashboardForViewer } from "../src/domain/publicDashboard.js";
import { addCalendarDays, mexicoTodayISO } from "../src/domain/dates.js";
import {
  buildAgendaDetail,
  isCallLaterStatus,
  validateAgenda,
} from "../src/domain/agenda.js";
import { normalizeBlacklistReason } from "../src/domain/blacklist.js";

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

test("el lector público no puede consultar datos identificables", () => {
  assert.equal(isAuthenticatedUser({ id: null, role: "lector", isAnonymous: true }), false);
  assert.equal(isAuthenticatedUser({ id: "user-1", role: "admin", isAnonymous: false }), true);
});

test("el dashboard público elimina nombres y pagos individuales", () => {
  const source = {
    distribucion: [{ key: "contactado", count: 1, names: ["Cliente privado"] }],
    recuperadoSemanal: {
      total: 100,
      count: 1,
      rows: [{ cliente_id: "cliente-1", name: "Cliente privado", monto: 100 }],
    },
  };

  const publicResult = sanitizeDashboardForViewer(source, { isAnonymous: true });
  assert.deepEqual(publicResult.distribucion[0].names, []);
  assert.deepEqual(publicResult.recuperadoSemanal.rows, []);
  assert.equal(publicResult.recuperadoSemanal.total, 100);
  assert.equal(sanitizeDashboardForViewer(source, { isAnonymous: false }), source);
});

test("las fechas operativas usan Ciudad de México y días naturales", () => {
  assert.equal(mexicoTodayISO(new Date("2026-09-05T03:30:00.000Z")), "2026-09-04");
  assert.equal(addCalendarDays("2026-09-04", 4), "2026-09-08");
});

test("Llamar más tarde exige una agenda válida y reconoce el catálogo editable", () => {
  assert.equal(isCallLaterStatus({ value: "llamar_mas_tarde", label: "Otro texto" }), true);
  assert.equal(isCallLaterStatus({ value: "otro", label: "Llamar más tarde" }), true);
  assert.equal(isCallLaterStatus({ value: "promesa_pago", label: "Promesa de pago" }), false);
  assert.equal(validateAgenda({ fechaISO: "2026-09-04", hora: "17:00" }), null);
  assert.match(validateAgenda({ fechaISO: "2026-02-30", hora: "17:00" }), /fecha válida/);
  assert.match(validateAgenda({ fechaISO: "2026-09-04", hora: "17:30" }), /bloque/);
  assert.equal(
    buildAgendaDetail({ fechaISO: "2026-09-04", hora: "17:00", nota: "Confirmar factura" }),
    "Contactar el 04 sep, 17:00 hrs — Confirmar factura"
  );
});

test("Lista negra exige un motivo con contenido real", () => {
  assert.equal(normalizeBlacklistReason("  Sin respuesta después de varios intentos  "), "Sin respuesta después de varios intentos");
  assert.equal(normalizeBlacklistReason("   "), null);
  assert.equal(normalizeBlacklistReason(null), null);
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
