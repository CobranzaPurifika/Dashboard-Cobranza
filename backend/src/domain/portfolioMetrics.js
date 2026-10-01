export function mas60PctFromBaseline(row) {
  return row && row.tramo_60_mas_monto != null && Number(row.saldo_total) > 0
    ? Number(row.tramo_60_mas_monto) / Number(row.saldo_total) * 100
    : null;
}
