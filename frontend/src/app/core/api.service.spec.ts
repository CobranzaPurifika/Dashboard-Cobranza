import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from './api.service';

describe('ApiService', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('termina una solicitud estancada con un mensaje recuperable', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => abortableFetch(options)));
    const api = new ApiService({ getValidAccessToken: async () => null } as any);

    const request = api.dashboard('todas');
    const assertion = expect(request).rejects.toThrow('La solicitud tardó demasiado');
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(15_001);

    await assertion;
  });

  it('respeta la cancelación solicitada por la pantalla', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => abortableFetch(options)));
    const api = new ApiService({ getValidAccessToken: async () => null } as any);
    const controller = new AbortController();

    const request = api.dashboard('todas', controller.signal);
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('detecta cuando el despliegue devuelve la SPA en lugar de la API', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })));
    const api = new ApiService({ getValidAccessToken: async () => null } as any);

    await expect(api.dashboard('todas')).rejects.toThrow('La API de cartera no está conectada');
  });
});

function abortableFetch(options: RequestInit): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    const fail = () => reject(new DOMException('Abortada', 'AbortError'));
    if (options.signal?.aborted) fail();
    else options.signal?.addEventListener('abort', fail, { once: true });
  });
}
