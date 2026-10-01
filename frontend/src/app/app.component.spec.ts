import { describe, expect, it } from 'vitest';
import { AppComponent } from './app.component';

describe('AppComponent: acceso', () => {
  it('alterna la visibilidad de la contraseña y la oculta al abrir el acceso', () => {
    const component = new AppComponent({} as any, {} as any, {} as any);

    component.toggleLoginPassword();
    expect(component.showLoginPassword).toBe(true);

    component.showLogin('Tu sesión terminó');
    expect(component.showLoginPassword).toBe(false);
    expect(component.loginVisible).toBe(true);
  });

  it('ofrece el selector histórico únicamente a admin y supervisor', () => {
    const component = new AppComponent({} as any, {} as any, {} as any);
    for (const role of ['admin', 'supervisor']) {
      component.user = { role };
      expect(component.canConfigure).toBe(true);
    }
    for (const role of ['gestor', 'lector']) {
      component.user = { role };
      expect(component.canConfigure).toBe(false);
    }
    expect(component.dashboardMonths.map((option) => option.label)).toEqual([
      'Mes en curso', expect.any(String), expect.any(String),
    ]);
  });
});
