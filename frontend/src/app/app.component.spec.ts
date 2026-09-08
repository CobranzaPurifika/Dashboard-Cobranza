import { describe, expect, it } from 'vitest';
import { AppComponent } from './app.component';
import { DEFAULT_PREFERENCES } from './core/preferences';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('AppComponent', () => {
  it('abre Dashboard por defecto y respeta la franquicia configurada', async () => {
    const api = {
      me: async () => ({ role: 'admin', allFranchises: true, isAnonymous: false }),
      statusGestion: async () => [],
      dashboard: async (franchise: string) => ({ franchise }),
    } as any;
    const component = new AppComponent(api, { hasSession: () => true } as any);
    component.preferences = { ...DEFAULT_PREFERENCES, defaultFranchise: 'cancun' };

    await component.openApp();

    expect(component.view).toBe('dashboard');
    expect(component.franchise).toBe('cancun');
    expect(component.dashboardData.franchise).toBe('cancun');
  });

  it('no adelanta la franquicia activa mientras conserva los datos anteriores', async () => {
    const nextDashboard = deferred<any>();
    const component = new AppComponent({ dashboard: () => nextDashboard.promise } as any, {} as any);
    component.franchise = 'merida';
    component.dashboardData = { franchise: 'merida' };

    const change = component.selectFranchise('cancun');

    expect(component.franchise).toBe('merida');
    expect(component.pendingFranchise).toBe('cancun');
    expect(component.dashboardData.franchise).toBe('merida');

    nextDashboard.resolve({ franchise: 'cancun' });
    await change;

    expect(component.franchise).toBe('cancun');
    expect(component.pendingFranchise).toBe('');
    expect(component.dashboardData.franchise).toBe('cancun');
  });
});
