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
