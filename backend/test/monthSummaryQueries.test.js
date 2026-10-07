import assert from "node:assert/strict";
import test from "node:test";
import { queryMonthActivity, queryMonthSummary, queryMonthPortfolio } from "../src/queries/monthSummary.js";
import { queryMonthlyManagement } from "../src/queries/monthlyManagement.js";

test("consultas históricas acotan el rango, consultan todas y conservan cumplidas sin corte", async () => {
  const calls = [];
  const db = { query: async (sql, params) => {
    calls.push({ sql, params });
    return { rows: sql.includes('from payment_promises') ? [{ franchise_id: "cancun", cumplidas: 2 }] : [] };
  } };
  const source = await queryMonthSummary({ month: "2026-09", franchiseIds: ["aguascalientes", "cancun", "merida"], now: new Date("2026-10-10T12:00:00Z") }, db);
  assert.equal(source.corte.find((r) => r.franchise_id === "todas").cumplidas, 2);
  assert.equal(source.corte.find((r) => r.franchise_id === "cancun").available, false);
  const snapshot = calls.find((c) => c.sql.includes('portfolio_snapshots'));
  assert.deepEqual(snapshot.params, [["aguascalientes", "cancun", "merida", "todas"], "2026-09-30"]);
  for (const call of calls.filter((c) => c.sql.includes('between $2::date'))) {
    assert.deepEqual(call.params.slice(1), ["2026-09-01", "2026-09-30"]);
  }
  assert.match(calls.find((c) => c.sql.includes('payment_promises')).sql, /pp.fulfilled_at between/);
  const detail = calls.find((c) => c.sql.includes('portfolio_snapshot_tramos'));
  assert.deepEqual(detail.params, [["aguascalientes", "cancun", "merida"], "2026-09-30", "Mensual"]);
  assert.deepEqual(source.detail, { tramos: [], segments: [] });
});

test("el mes en curso toma la representación de saldos en vivo", async () => {
  const calls = [];
  await queryMonthSummary({ month: "2026-10", franchiseIds: ["cancun"], now: new Date("2026-10-10T12:00:00Z") }, {
    query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; },
  });
  assert.equal(calls.some((c) => c.sql.includes('portfolio_snapshot_tramos')), false);
  assert.ok(calls.some((c) => c.sql.includes('from facturas f') && c.sql.includes('c.segment')));
});

test("el corte global no expone franquicias fuera del alcance", async () => {
  let params;
  await queryMonthPortfolio({ franchiseIds: ["cancun"], hasta: "2026-09-30", isCurrent: false }, {
    query: async (_sql, args) => { params = args; return { rows: [] }; },
  });
  assert.deepEqual(params[0], ["cancun"]);
});

test("mes inválido se rechaza antes de consultar", async () => {
  await assert.rejects(queryMonthSummary({ month: "2026-07", franchiseIds: [], now: new Date("2026-10-10T12:00:00Z") }, {
    query: () => assert.fail("No se debe consultar"),
  }), { statusCode: 400 });
});

test("Gestiones del mes: el reporte solo toma gestiones de la cuenta de cobranza", async () => {
  const calls = [];
  await queryMonthSummary({ month: "2026-10", franchiseIds: ["cancun"], now: new Date("2026-10-10T12:00:00Z"), cuentaGestiones: "cobranza.ags@purifika.com" }, {
    query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; },
  });
  const gestiones = calls.find((c) => c.sql.includes("from gestion_timeline"));
  assert.match(gestiones.sql, /gt\.created_by is null or gt\.created_by in \(select u\.id from app_users u where lower\(u\.email\) = \$4\)/);
  assert.deepEqual(gestiones.params, [["cancun"], "2026-10-01", "2026-10-10", "cobranza.ags@purifika.com"]);
});

test("sin cuenta (dashboard histórico) cuenta todas las gestiones", async () => {
  const calls = [];
  await queryMonthActivity({ franchiseIds: ["cancun"], desde: "2026-09-01", hasta: "2026-09-30" }, {
    query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; },
  });
  const gestiones = calls.find((c) => c.sql.includes("from gestion_timeline"));
  assert.doesNotMatch(gestiones.sql, /created_by/);
  assert.equal(gestiones.params.length, 3);
});

test("cumplimiento diario: solo cuenta clientes gestionados por la cuenta de cobranza", async () => {
  const calls = [];
  const result = await queryMonthlyManagement({ month: "2026-10", throughDate: "2026-10-07", franchiseIds: ["aguascalientes"] }, {
    query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; },
  });
  const counts = calls.find((c) => c.sql.includes("from gestion_timeline"));
  assert.match(counts.sql, /lower\(u\.email\) = \$4/);
  assert.equal(counts.params[3], "cobranza.ags@purifika.com");
  assert.equal(result.cuentaGestiones, "cobranza.ags@purifika.com");
});
