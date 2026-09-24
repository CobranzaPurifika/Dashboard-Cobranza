// Helpers de formato compartidos entre Gestión (ficha con edición) y el buscador del Lector
// (ficha de solo lectura) -- misma presentación de dinero/fechas/tramo en los dos lugares.

export const TRAMO_LABEL: Record<string, string> = {
  good: 'Al corriente',
  warning: '1-30 días',
  serious: '31-60 días',
  critical: '+60 días',
};

export function money(value: unknown): string {
  return `$${Number(value ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
}

export function moneyExact(value: unknown): string {
  return `$${Number(value ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function tramoLabel(tramo: string): string {
  return TRAMO_LABEL[tramo] ?? tramo;
}

export function shortDate(value: string): string {
  if (!value) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)))
    .replace('.', '')
    .replace(/[-/]/g, ' ');
}
