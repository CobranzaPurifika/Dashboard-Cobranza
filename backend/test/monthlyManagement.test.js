import test from "node:test";
import assert from "node:assert/strict";

import { buildMonthlyManagement, businessDays, parseDailyGoal } from "../src/domain/monthlyManagement.js";

test("omite sábados y domingos del acumulado mensual", () => {
  assert.deepEqual(businessDays("2026-09", "2026-09-07"), [
    "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07",
  ]);
});

test("promedia por día, limita a 100 y excluye incidencias", () => {
  const result = buildMonthlyManagement({
    month: "2026-09",
    throughDate: "2026-09-04",
    franchises: [{ id: "aguascalientes", label: "Aguascalientes" }],
    goals: [{ franchise_id: "aguascalientes", daily_goal: 3 }],
    counts: [
      { franchise_id: "aguascalientes", fecha: "2026-09-01", count: 0 },
      { franchise_id: "aguascalientes", fecha: "2026-09-02", count: 4 },
      { franchise_id: "aguascalientes", fecha: "2026-09-03", count: 3 },
      { franchise_id: "aguascalientes", fecha: "2026-09-04", count: 1 },
    ],
    incidents: [{ franchise_id: "aguascalientes", fecha: "2026-09-01", note: "Capacitación" }],
  });

  assert.deepEqual(result.franchises[0].summary, {
    pct: 78,
    fullDays: 2,
    eligibleDays: 3,
    justifiedDays: 1,
  });
  assert.equal(result.franchises[0].days.at(-1).incident.note, "Capacitación");
});

test("valida las metas diarias configurables", () => {
  assert.equal(parseDailyGoal(9), 9);
  assert.equal(parseDailyGoal("3"), 3);
  assert.equal(parseDailyGoal(0), null);
  assert.equal(parseDailyGoal(101), null);
  assert.equal(parseDailyGoal("3.5"), null);
});
