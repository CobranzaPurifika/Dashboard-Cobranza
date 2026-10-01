import { describe, expect, it } from 'vitest';
import { reportMonthOptions } from './report-months';

describe('meses del reporte', () => {
  it('ofrece exactamente tres meses y cruza el año', () => {
    expect(reportMonthOptions(new Date('2026-10-01T12:00:00Z'))).toEqual([
      { value: '2026-10', label: 'Octubre 2026 (en curso)' },
      { value: '2026-09', label: 'Septiembre 2026' },
      { value: '2026-08', label: 'Agosto 2026' },
    ]);
    expect(reportMonthOptions(new Date('2026-01-02T12:00:00Z')).map((o) => o.value)).toEqual(['2026-01', '2025-12', '2025-11']);
  });
  it('usa el día de CDMX en el límite UTC del mes', () => {
    expect(reportMonthOptions(new Date('2026-10-01T05:59:00Z'))[0].value).toBe('2026-09');
  });
});
