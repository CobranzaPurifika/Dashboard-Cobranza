// Detalle de un corte (franquicia x segmento x tramo) para reconstruir la Representación
// de saldos y la Segmentación de meses pasados. Se captura junto con portfolio_snapshots,
// con la misma clasificación de tramos que el dashboard en vivo.
const TRAMO_SQL = `case when f.dias_vencida <= 0 then 'good' when f.dias_vencida <= 30 then 'warning'
  when f.dias_vencida <= 60 then 'serious' else 'critical' end`;

export async function capturePortfolioDetail(db, fechaCorte, tipoCorte) {
  await db.query(
    `insert into portfolio_snapshot_tramos
       (franchise_id, fecha_corte, tipo_corte, segment, tramo, monto, clientes)
     select c.franchise_id, $1::date, $2, c.segment, ${TRAMO_SQL},
            coalesce(sum(f.monto), 0), count(distinct f.cliente_id)
     from facturas f join clientes c on c.id = f.cliente_id
     where c.portfolio_status = 'active'
     group by 1, 2, 3, 4, 5
     on conflict do nothing`,
    [fechaCorte, tipoCorte]
  );
  await db.query(
    `insert into portfolio_snapshot_segments
       (franchise_id, fecha_corte, tipo_corte, segment, label, clientes, saldo)
     select franchise_id, $1::date, $2, segment, max(segment_label), count(*), coalesce(sum(saldo), 0)
     from clientes
     where portfolio_status = 'active'
     group by franchise_id, segment
     on conflict do nothing`,
    [fechaCorte, tipoCorte]
  );
}

/** Rows of a saved corte, one per franchise x segment (x tramo). Empty when not captured. */
export async function queryPortfolioDetail({ franchiseIds, fechaCorte, tipoCorte = "Mensual" }, db) {
  db ??= (await import("../db/pool.js")).pool;
  const params = [franchiseIds, fechaCorte, tipoCorte];
  const [tramos, segments] = await Promise.all([
    db.query(`select franchise_id, segment, tramo, monto::float as monto, clientes
      from portfolio_snapshot_tramos
      where franchise_id = any($1::text[]) and fecha_corte = $2::date and tipo_corte = $3`, params),
    db.query(`select franchise_id, segment, label, clientes, saldo::float as saldo
      from portfolio_snapshot_segments
      where franchise_id = any($1::text[]) and fecha_corte = $2::date and tipo_corte = $3`, params),
  ]);
  return { tramos: tramos.rows, segments: segments.rows };
}

/** Live equivalent of queryPortfolioDetail, for the month in progress. */
export async function queryLivePortfolioDetail({ franchiseIds }, db) {
  db ??= (await import("../db/pool.js")).pool;
  const [tramos, segments] = await Promise.all([
    db.query(`select c.franchise_id, c.segment, ${TRAMO_SQL} as tramo,
        coalesce(sum(f.monto), 0)::float as monto, count(distinct f.cliente_id)::int as clientes
      from facturas f join clientes c on c.id = f.cliente_id
      where c.franchise_id = any($1::text[]) and c.portfolio_status = 'active'
      group by 1, 2, 3`, [franchiseIds]),
    db.query(`select franchise_id, segment, max(segment_label) as label, count(*)::int as clientes,
        coalesce(sum(saldo), 0)::float as saldo
      from clientes where franchise_id = any($1::text[]) and portfolio_status = 'active'
      group by franchise_id, segment`, [franchiseIds]),
  ]);
  return { tramos: tramos.rows, segments: segments.rows };
}
