import { describe, expect, it } from 'vitest';
import { ManagementComponent } from './management.component';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('ManagementComponent', () => {
  it('conserva el resultado del último filtro aunque una respuesta previa llegue después', async () => {
    const commercial = deferred<any>();
    const residential = deferred<any>();
    const api = {
      prioridad: () => commercial.promise,
    } as any;
    const component = new ManagementComponent(api);

    const first = component.loadPriority();
    api.prioridad = () => residential.promise;
    component.segment = 'residencial';
    const second = component.loadPriority();

    residential.resolve({ rows: [{ id: 'residencial' }], shown: 1, total: 1 });
    await second;
    commercial.resolve({ rows: [{ id: 'comercial' }], shown: 1, total: 1 });
    await first;

    expect(component.priority).toEqual([{ id: 'residencial' }]);
  });

  it('muestra el error de Gestiones del mes y deja de cargar', async () => {
    const api = {
      gestionesMes: async () => { throw new Error('Falta aplicar la migración'); },
    } as any;
    const component = new ManagementComponent(api);

    await component.openMonthlyStats();

    expect(component.monthlyLoading).toBe(false);
    expect(component.monthlyError).toBe('Falta aplicar la migración');
  });
});
