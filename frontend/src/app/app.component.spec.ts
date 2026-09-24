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
});
