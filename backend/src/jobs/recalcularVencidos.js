import { pool } from "../db/pool.js";

// Reemplaza el patrón del artifact original (republicar el HTML completo + respaldo en
// Airtable + reconciliación manual) por una tarea real que corre en código, sola, todos
// los días: avanza los días de vencido de cada factura y reclasifica el tramo de cada
// cliente -- ya no depende de que alguien del equipo abra el dashboard y lo vuelva a
// publicar para que el semáforo de antigüedad de saldos se actualice.
//
// Regla: cada factura envejece 1 día por cada día real transcurrido desde la última
// corrida. El tramo del cliente se deriva del mayor `dias_vencida` entre sus facturas.
// Ajustar aquí si Purifika usa reglas de crédito distintas por franquicia/cliente.
export async function recalcularVencidos() {
  const client = await pool.connect();
  try {
    await client.query("begin");

    await client.query(
      `update facturas set dias_vencida = dias_vencida + 1
       where fecha_facturacion is not null`
    );

    await client.query(`
      with peor_factura as (
        select cliente_id, max(dias_vencida) as dias
        from facturas
        group by cliente_id
      ),
      tramos as (
        select cliente_id,
          case
            when dias <= 0 then 'good'
            when dias <= 30 then 'warning'
            when dias <= 60 then 'serious'
            else 'critical'
          end as tramo,
          case
            when dias <= 0 then 'Al corriente'
            when dias <= 30 then '1-30 días'
            when dias <= 60 then '31-60 días'
            else '+60 días'
          end as tramo_label
        from peor_factura
      )
      update clientes c
      set tramo = t.tramo, tramo_label = t.tramo_label, updated_at = now()
      from tramos t
      where t.cliente_id = c.id
    `);

    await client.query("commit");
    console.log(`[recalcularVencidos] ok — ${new Date().toISOString()}`);
  } catch (err) {
    await client.query("rollback");
    console.error("[recalcularVencidos] error:", err);
    throw err;
  } finally {
    client.release();
  }
}
