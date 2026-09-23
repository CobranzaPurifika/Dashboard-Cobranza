// "weeks" en kpi_snapshots no lo consume ningún gráfico hoy (ver frontend/src/app/core/charts.ts,
// buildLineChartRecuperado) -- se conserva por compatibilidad con las filas ya existentes. Se
// calcula como semanas de calendario (lunes a domingo) que toca el mes, hasta la fecha de corte.
export function weeksTouchedInMonth(monthISO, asOfISO) {
  const [year, month] = monthISO.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));
  const asOf = new Date(`${asOfISO}T00:00:00Z`);
  const cutoff = asOf < monthEnd ? asOf : monthEnd;
  if (cutoff < monthStart) return 0;

  const startWeekday = (monthStart.getUTCDay() + 6) % 7; // 0 = lunes
  const daysElapsed = Math.floor((cutoff - monthStart) / 86400000) + 1;
  return Math.ceil((daysElapsed + startWeekday) / 7);
}

export function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

export function currentMonthISO(todayISO) {
  return `${todayISO.slice(0, 7)}-01`;
}
