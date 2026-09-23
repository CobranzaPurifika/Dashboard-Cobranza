import { pool } from "../db/pool.js";
import { FRANCHISE_IDS } from "../auth/franchiseScope.js";
import { mexicoTodayISO } from "../domain/dates.js";
import { currentMonthISO, round1, weeksTouchedInMonth } from "../domain/monthlySnapshots.js";

// Pipeline de cierre de mes: kpi_snapshots y vencida_snapshots alimentan "Histórico de
// recuperación" y "Tendencia de cartera vencida" (ver frontend/src/app/core/charts.ts). Antes de
// esto nada en el repo escribía en esas tablas -- el mes en curso se quedaba en cero/ausente y
// los meses anteriores nunca se marcaban como cerrados (provisional=false), así que las dos
// gráficas se congelaban en el último corte manual.
//
// Cada corrida (pensada para una vez por noche):
//   1. Recalcula el mes en curso para cada franquicia con datos en vivo (provisional=true).
//   2. Cierra cualquier mes anterior que se haya quedado provisional=true, sin recalcular su
//      valor -- el último corte tomado esa noche antes de que terminara el mes ya es el cierre.
export async function runMonthlySnapshots() {
  const today = mexicoTodayISO();
  const month = currentMonthISO(today);

  for (const franchiseId of FRANCHISE_IDS) {
    await upsertCurrentMonth(franchiseId, month, today);
  }
  await finalizePastMonths(month);
}

async function upsertCurrentMonth(franchiseId, month, today) {
  const [recuperado, cobertura, vencida] = await Promise.all([
    pool.query(
      `select coalesce(sum(p.monto), 0)::float as monto_recuperado
       from pagos p left join clientes c on c.id = p.cliente_id
       where coalesce(p.franchise_id, c.franchise_id) = $1
         and p.fecha_iso >= date_trunc('month', now() at time zone 'America/Mexico_City')::date
         and p.fecha_iso < (date_trunc('month', now() at time zone 'America/Mexico_City') + interval '1 month')::date`,
      [franchiseId]
    ),
    pool.query(
      `select
         (select count(*) from clientes where franchise_id = $1 and portfolio_status != 'settled') as total,
         (select count(distinct gt.cliente_id)
          from gestion_timeline gt join clientes c on c.id = gt.cliente_id
          where c.franchise_id = $1 and c.portfolio_status != 'settled'
            and date_trunc('month', gt.fecha_iso) = date_trunc('month', now() at time zone 'America/Mexico_City')
         ) as gestionados`,
      [franchiseId]
    ),
    pool.query(
      `select
         coalesce(sum(f.monto) filter (where f.dias_vencida > 0), 0)::float as vencida_monto,
         coalesce(sum(f.monto), 0)::float as total
       from facturas f join clientes c on c.id = f.cliente_id
       where c.franchise_id = $1 and c.portfolio_status != 'settled'`,
      [franchiseId]
    ),
  ]);

  const montoRecuperado = recuperado.rows[0].monto_recuperado;
  const coberturaRow = cobertura.rows[0];
  const pctCobertura = coberturaRow.total > 0
    ? round1((coberturaRow.gestionados / coberturaRow.total) * 100)
    : null;
  const weeks = weeksTouchedInMonth(month, today);

  const vencidaRow = vencida.rows[0];
  const pctVencida = vencidaRow.total > 0 ? round1((vencidaRow.vencida_monto / vencidaRow.total) * 100) : null;

  await pool.query(
    `insert into kpi_snapshots (franchise_id, month, monto_recuperado, pct_cobertura, weeks)
     values ($1, $2, $3, $4, $5)
     on conflict (franchise_id, month) do update
       set monto_recuperado = excluded.monto_recuperado,
           pct_cobertura = excluded.pct_cobertura,
           weeks = excluded.weeks`,
    [franchiseId, month, montoRecuperado, pctCobertura, weeks]
  );

  await pool.query(
    `insert into vencida_snapshots (franchise_id, month, pct, provisional)
     values ($1, $2, $3, true)
     on conflict (franchise_id, month) do update
       set pct = excluded.pct, provisional = true`,
    [franchiseId, month, pctVencida]
  );
}

async function finalizePastMonths(currentMonth) {
  await pool.query(
    `update vencida_snapshots set provisional = false
     where provisional = true and month < $1::date`,
    [currentMonth]
  );
}
