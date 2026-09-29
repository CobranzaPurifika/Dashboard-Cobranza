import { DomSanitizer } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';
import { DashboardComponent } from './dashboard.component';

function component(rows: any[], isAnonymous = false): DashboardComponent {
  const dashboard = new DashboardComponent({} as DomSanitizer);
  dashboard.data = { recuperadoSemanal: { total: 0, count: 0, rows } };
  dashboard.isAnonymous = isAnonymous;
  return dashboard;
}

describe('DashboardComponent recovery ordering', () => {
  const rows = [
    { cliente_id: 'a', name: 'A', monto: 100, fecha_iso: '2026-09-20' },
    { cliente_id: 'a', name: 'A', monto: 50, fecha_iso: '2026-09-28' },
    { cliente_id: 'b', name: 'B', monto: 120, fecha_iso: '2026-09-29' },
    { cliente_id: 'c', name: 'C', monto: 110, fecha_iso: '2026-09-27' },
    { cliente_id: 'd', name: 'D', monto: 10, fecha_iso: '2026-09-30' },
  ];

  it('sorts clients by amount and each client payments by most recent date', () => {
    const dashboard = component(rows);

    expect(dashboard.recoveredClients().map((client) => client.key)).toEqual(['a', 'b', 'c', 'd']);
    expect(dashboard.recoveredClients()[0].payments.map((payment) => payment.fecha_iso)).toEqual([
      '2026-09-28',
      '2026-09-20',
    ]);
  });

  it('sorts by most recent payment while retaining the anonymous top three by amount', () => {
    const dashboard = component(rows, true);
    dashboard.recoverySort = 'fecha';

    expect(dashboard.recoveredClients().map((client) => client.key)).toEqual(['b', 'a', 'c']);
    expect(dashboard.recoveredClients().some((client) => client.key === 'd')).toBe(false);
  });
});
