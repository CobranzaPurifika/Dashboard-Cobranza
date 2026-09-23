import test from "node:test";
import assert from "node:assert/strict";

import { currentMonthISO, round1, weeksTouchedInMonth } from "../src/domain/monthlySnapshots.js";

test("currentMonthISO trunca el día al primero del mes", () => {
  assert.equal(currentMonthISO("2026-09-23"), "2026-09-01");
  assert.equal(currentMonthISO("2026-01-01"), "2026-01-01");
});

test("round1 redondea a un decimal", () => {
  assert.equal(round1(28.049), 28);
  assert.equal(round1(28.05), 28.1);
  assert.equal(round1(0), 0);
});

test("weeksTouchedInMonth cuenta semanas de calendario hasta la fecha de corte", () => {
  // Septiembre 2026 empieza en martes; el 23 (miércoles) cae en la 4a semana de calendario.
  assert.equal(weeksTouchedInMonth("2026-09-01", "2026-09-23"), 4);
  // Un corte del día 1 siempre cae en la primera semana.
  assert.equal(weeksTouchedInMonth("2026-09-01", "2026-09-01"), 1);
});

test("weeksTouchedInMonth se limita al fin de mes aunque la fecha de corte sea posterior", () => {
  const full = weeksTouchedInMonth("2026-06-01", "2026-06-30");
  assert.equal(weeksTouchedInMonth("2026-06-01", "2026-07-15"), full);
});

test("weeksTouchedInMonth devuelve 0 si la fecha de corte es anterior al mes", () => {
  assert.equal(weeksTouchedInMonth("2026-09-01", "2026-08-15"), 0);
});
