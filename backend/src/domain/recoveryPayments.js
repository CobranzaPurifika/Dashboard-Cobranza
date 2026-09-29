export function summarizePayments(rows) {
  return {
    total: rows.reduce((sum, row) => sum + Number(row.monto), 0),
    count: new Set(rows.map((row) =>
      row.cliente_id || `${row.franchise_id}|${String(row.name ?? "").toLowerCase()}`
    )).size,
    rows: rows.map(({ is_weekly: _isWeekly, is_monthly: _isMonthly, ...row }) => row),
  };
}
