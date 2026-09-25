import { pool } from "../db/pool.js";
import { mexicoTodayISO, addCalendarDays } from "../domain/dates.js";

// Corte semanal para "vs semana anterior" en las tarjetas de KPI del dashboard (cartera al
// corriente/vencida/+60 días) -- mismo cálculo que captureMonthlyPortfolioBaseline en
// rawImport.js (duplicado a propósito: ese vive en el pipeline de importación y este en el cron
// nocturno, disparadores distintos), pero cada lunes en vez de cada mes. La gestión es de lunes
// a viernes, así que los totales en vivo del lunes por la noche son un buen sustituto del cierre
// del domingo anterior -- no hay actividad de fin de semana que los distorsione.
export async function captureWeeklyPortfolioBaseline() {
  const today = mexicoTodayISO();
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  if (weekday !== 1) return; // solo lunes

  const fechaCorte = addCalendarDays(today, -1);

  await pool.query(
    `with client_totals as (
       select franchise_id, coalesce(sum(saldo), 0)::numeric as saldo_total
       from clientes
       where portfolio_status = 'active'
       group by franchise_id
     ), invoice_totals as (
       select c.franchise_id,
         coalesce(sum(f.monto), 0)::numeric as total_facturado,
         coalesce(sum(f.monto) filter (where f.dias_vencida <= 0), 0)::numeric as al_corriente,
         coalesce(sum(f.monto) filter (where f.dias_vencida > 0), 0)::numeric as vencida,
         coalesce(sum(f.monto) filter (where f.dias_vencida > 60), 0)::numeric as mas60
       from facturas f
       join clientes c on c.id = f.cliente_id
       where c.portfolio_status = 'active'
       group by c.franchise_id
     ), detail as (
       select c.franchise_id, c.saldo_total, i.total_facturado,
              i.al_corriente, i.vencida, i.mas60
       from client_totals c
       join invoice_totals i using (franchise_id)
       where i.total_facturado > 0
     ), snapshots as (
       select franchise_id,
              round(al_corriente / total_facturado * 100, 1) as al_corriente_pct,
              round(vencida / total_facturado * 100, 1) as cartera_vencida_pct,
              mas60 as tramo_60_mas_monto, saldo_total
       from detail
       union all
       select 'todas',
              round(sum(al_corriente) / nullif(sum(total_facturado), 0) * 100, 1),
              round(sum(vencida) / nullif(sum(total_facturado), 0) * 100, 1),
              sum(mas60), sum(saldo_total)
       from detail
     )
     insert into portfolio_snapshots
       (franchise_id, fecha_corte, tipo_corte, al_corriente_pct,
        cartera_vencida_pct, tramo_60_mas_monto, saldo_total)
     select franchise_id, $1, 'Semanal', al_corriente_pct, cartera_vencida_pct,
            tramo_60_mas_monto, saldo_total
     from snapshots
     on conflict do nothing`,
    [fechaCorte]
  );
}
