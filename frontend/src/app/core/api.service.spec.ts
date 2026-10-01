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

  it('agrega el mes al dashboard solo cuando se selecciona un histórico', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const api = new ApiService({ getValidAccessToken: async () => null } as any);
    await api.dashboard('todas', undefined, '2026-09');
    expect(fetchMock.mock.calls[0][0]).toContain('/dashboard/todas?month=2026-09');
  });
});

it('descarga XLSX con el mes y el nombre de Content-Disposition', async () => {
  const fetchMock = vi.fn(async (_url: string, _options?: RequestInit) => new Response('xlsx', { headers: { 'Content-Disposition': 'attachment; filename="Reporte_Gestiones_2026-09.xlsx"' } }));
  vi.stubGlobal('fetch', fetchMock);
  try {
    const api = new ApiService({ getValidAccessToken: async () => 'token' } as any);
    const result = await api.reporteGestionesMes('2026-09');
    expect(fetchMock.mock.calls[0][0]).toContain('/gestiones-mes/report.xlsx?month=2026-09');
    expect(result.fileName).toBe('Reporte_Gestiones_2026-09.xlsx');
    expect(result.blob.size).toBe(4);
  } finally { vi.unstubAllGlobals(); }
});
