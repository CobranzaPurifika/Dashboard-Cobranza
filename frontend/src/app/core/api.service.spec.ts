import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from './api.service';

describe('ApiService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detecta cuando el despliegue devuelve HTML en vez de JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })));
    const api = new ApiService({ getValidAccessToken: async () => null } as any);

    await expect(api.dashboard('todas')).rejects.toThrow('La API de cartera no está conectada');
  });
});
