const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function buildMonthlyManagement({ month, throughDate, franchises, goals, counts, incidents }) {
  const weekdays = businessDays(month, throughDate);
  const countMap = new Map(counts.map((row) => [
    `${row.franchise_id}|${dateOnly(row.fecha)}`,
    Number(row.count),
  ]));
  const incidentMap = new Map(incidents.map((row) => [
    `${row.franchise_id}|${dateOnly(row.fecha)}`,
    { note: row.note },
  ]));
  const goalMap = new Map(goals.map((row) => [row.franchise_id, Number(row.daily_goal)]));

  const franchiseRows = franchises.map((franchise) => {
    const goal = goalMap.get(franchise.id) ?? 0;
    const days = weekdays.map((date) => {
      const count = countMap.get(`${franchise.id}|${date}`) ?? 0;
      const incident = incidentMap.get(`${franchise.id}|${date}`) ?? null;
      const rawPct = goal > 0 ? Math.min(100, (count / goal) * 100) : 100;
      return { date, count, goal, pct: Math.round(rawPct), rawPct, incident };
    }).reverse();
    const eligible = days.filter((day) => !day.incident);
    const pct = eligible.length
      ? Math.round(eligible.reduce((sum, day) => sum + day.rawPct, 0) / eligible.length)
      : 0;
    return {
      id: franchise.id,
      label: franchise.label,
      goal,
      days,
      summary: {
        pct,
        fullDays: eligible.filter((day) => day.pct >= 100).length,
        eligibleDays: eligible.length,
        justifiedDays: days.length - eligible.length,
      },
    };
  });

  const daily = [...weekdays].reverse().map((date) => ({
    date,
    counts: Object.fromEntries(franchiseRows.map((franchise) => [
      franchise.id,
      countMap.get(`${franchise.id}|${date}`) ?? 0,
    ])),
  }));

  return {
    month,
    monthLabel: MONTHS[Number(month.slice(5, 7)) - 1],
    throughDate,
    franchises: franchiseRows,
    daily,
  };
}

export function parseDailyGoal(value) {
  const goal = Number(value);
  return Number.isInteger(goal) && goal >= 1 && goal <= 100 ? goal : null;
}

export function businessDays(month, throughDate) {
  const start = `${month}-01`;
  const end = throughDate.startsWith(month)
    ? throughDate
    : lastDayOfMonth(month);
  const days = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const weekday = new Date(`${cursor}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(cursor);
  }
  return days;
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function lastDayOfMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}
