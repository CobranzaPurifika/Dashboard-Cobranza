import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
    delete window.__APP_CONFIG__;
  });

  it('detiene un inicio de sesión que tarda demasiado', async () => {
    window.__APP_CONFIG__ = {
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'public-key',
    };
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      (options.signal as AbortSignal).addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    })));

    const signIn = new AuthService().signIn('usuario@purifika.com', 'secreto');
    const assertion = expect(signIn).rejects.toThrow('La solicitud de acceso tardó demasiado');

    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });
});
