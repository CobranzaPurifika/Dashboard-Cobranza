import assert from "node:assert/strict";
import test from "node:test";
import { summarizePayments } from "../src/routes/dashboard.js";

test("summarizePayments removes period flags without changing totals", () => {
  const result = summarizePayments([
    { cliente_id: "a", monto: "100", is_weekly: true, is_monthly: false },
    { cliente_id: "a", monto: 25, is_weekly: true, is_monthly: true },
    { cliente_id: "b", monto: 50, is_weekly: false, is_monthly: true },
  ]);

  assert.equal(result.total, 175);
  assert.equal(result.count, 2);
  assert.deepEqual(result.rows, [
    { cliente_id: "a", monto: "100" },
    { cliente_id: "a", monto: 25 },
    { cliente_id: "b", monto: 50 },
  ]);
});
