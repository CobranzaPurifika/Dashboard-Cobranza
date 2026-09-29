import { DomSanitizer } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';
import { DashboardComponent } from './dashboard.component';

function component(rows: any[], isAnonymous = false): DashboardComponent {
  const dashboard = new DashboardComponent({} as DomSanitizer);
  dashboard.data = { recuperadoSemanal: { total: 390, count: 4, rows } };
  dashboard.isAnonymous = isAnonymous;
  return dashboard;
}

const rows = [
  { cliente_id: 'alvaro', name: 'Álvaro', monto: 100, fecha_iso: '2026-09-20' },
  { cliente_id: 'alvaro', name: 'Álvaro', monto: 50, fecha_iso: '2026-09-28' },
  { cliente_id: 'beatriz', name: 'Beatriz', monto: 120, fecha_iso: '2026-09-29' },
  { cliente_id: 'alberto', name: 'Alberto', monto: 110, fecha_iso: '2026-09-27' },
  { cliente_id: 'diana', name: 'Diana', monto: 10, fecha_iso: '2026-09-30' },
];

describe('DashboardComponent recovery ordering', () => {
  it('defaults to amount descending and keeps payments newest first', () => {
    const dashboard = component(rows);

    expect(dashboard.recoverySort).toEqual({ key: 'monto', dir: 'desc' });
    expect(dashboard.recoveredClients().map((client) => client.key)).toEqual([
      'alvaro', 'beatriz', 'alberto', 'diana',
    ]);
    expect(dashboard.recoveredClients()[0].payments.map((payment) => payment.fecha_iso)).toEqual([
      '2026-09-28', '2026-09-20',
    ]);
  });

  it('sorts names in Spanish in both directions, including accents', () => {
    const dashboard = component(rows);

    dashboard.setRecoverySort('nombre');
    expect(dashboard.recoveredClients().map((client) => client.name)).toEqual([
      'Alberto', 'Álvaro', 'Beatriz', 'Diana',
    ]);
    dashboard.setRecoverySort('nombre');
    expect(dashboard.recoveredClients().map((client) => client.name)).toEqual([
      'Diana', 'Beatriz', 'Álvaro', 'Alberto',
    ]);
  });

  it('sorts amounts ascending', () => {
    const dashboard = component(rows);
    dashboard.setRecoverySort('monto');

    expect(dashboard.recoveredClients().map((client) => client.key)).toEqual([
      'diana', 'alberto', 'beatriz', 'alvaro',
    ]);
  });

  it('sorts clients and their payments by date ascending and descending', () => {
    const dashboard = component(rows);

    dashboard.setRecoverySort('fecha');
    expect(dashboard.recoveredClients().map((client) => client.key)).toEqual([
      'diana', 'beatriz', 'alvaro', 'alberto',
    ]);
    expect(dashboard.recoveredClients()[2].payments.map((payment) => payment.fecha_iso)).toEqual([
      '2026-09-28', '2026-09-20',
    ]);

    dashboard.setRecoverySort('fecha');
    expect(dashboard.recoveredClients().map((client) => client.key)).toEqual([
      'alberto', 'alvaro', 'beatriz', 'diana',
    ]);
    expect(dashboard.recoveredClients()[1].payments.map((payment) => payment.fecha_iso)).toEqual([
      '2026-09-20', '2026-09-28',
    ]);
  });

  it('toggles repeated clicks and restores the default direction when changing criterion', () => {
    const dashboard = component(rows);

    dashboard.setRecoverySort('monto');
    expect(dashboard.recoverySort).toEqual({ key: 'monto', dir: 'asc' });
    dashboard.setRecoverySort('monto');
    expect(dashboard.recoverySort).toEqual({ key: 'monto', dir: 'desc' });
    dashboard.setRecoverySort('nombre');
    expect(dashboard.recoverySort).toEqual({ key: 'nombre', dir: 'asc' });
    dashboard.setRecoverySort('fecha');
    expect(dashboard.recoverySort).toEqual({ key: 'fecha', dir: 'desc' });
  });

  it('selects the anonymous top three by amount before applying the chosen order', () => {
    const dashboard = component(rows, true);
    dashboard.setRecoverySort('nombre');

    expect(dashboard.recoveredClients().map((client) => client.key)).toEqual([
      'alberto', 'alvaro', 'beatriz',
    ]);
    expect(dashboard.recoveredClients().some((client) => client.key === 'diana')).toBe(false);
  });

  it('does not change the recovery total or count when sorting', () => {
    const dashboard = component(rows);
    const recoveryData = dashboard.recoveryData();

    dashboard.setRecoverySort('fecha');
    dashboard.recoveredClients();
    expect(dashboard.recoveryData().total).toBe(recoveryData.total);
    expect(dashboard.recoveryData().count).toBe(recoveryData.count);
    expect(dashboard.data.recuperadoSemanal.rows).toEqual(rows);
  });
});

describe('DashboardComponent segmentation', () => {
  it('calculates segment and tramo percentages, preserves order, and assigns colors', () => {
    const dashboard = component([]);
    dashboard.data.segmentacion = [
      { segment: 'residencial', label: 'Residencial', monto: 100, tramos: [
        { tramo: 'good', label: 'Al corriente', monto: 25 },
        { tramo: 'critical', label: '+60 días', monto: 75 },
      ] },
      { segment: 'comercial', label: 'Comercial', monto: 0, tramos: [
        { tramo: 'warning', label: '1-30 días', monto: 0 },
      ] },
    ];

    const result = dashboard.segmentRows();
    expect(result[0].pct).toBe('100.0');
    expect(result[0].tramos.map((tramo: any) => tramo.pct)).toEqual(['25.0', '75.0']);
    expect(result[0].tramos.map((tramo: any) => tramo.tramo)).toEqual(['good', 'critical']);
    expect(result[0].tramos.map((tramo: any) => tramo.color)).toEqual(['#2FA84F', '#C0392B']);
    expect(result[1].pct).toBe('0.0');
    expect(result[1].tramos[0].pct).toBe('0.0');
  });

  it('toggles segments immutably and resets expansion on input changes', () => {
    const dashboard = component([]);
    const empty = dashboard.expandedSegments;
    dashboard.toggleSegment('comercial');
    expect(dashboard.expandedSegments).not.toBe(empty);
    expect(dashboard.isSegmentExpanded('comercial')).toBe(true);
    dashboard.toggleSegment('comercial');
    expect(dashboard.isSegmentExpanded('comercial')).toBe(false);
    dashboard.toggleSegment('residencial');
    (dashboard as any).renderCharts = () => undefined;
    dashboard.ngOnChanges();
    expect(dashboard.expandedSegments.size).toBe(0);
  });
});
