import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly apiBase = this.resolveApiBase();

  constructor(private readonly auth: AuthService) {}

  me = () => this.request('/me');
  dashboard = (franchise: string, signal?: AbortSignal) =>
    this.request(`/dashboard/${franchise}`, { signal });
  statusGestion = () => this.request('/status-gestion');
  managementGoals = () => this.request('/gestiones-mes/goals');

  actualizarStatus(value: string, body: { label: string; bg: string; efectiva: boolean; sortOrder: number }) {
    return this.request(`/status-gestion/${encodeURIComponent(value)}`, {
      method: 'PUT', body: JSON.stringify(body),
    });
  }

  actualizarMetaGestion(franchise: string, dailyGoal: number) {
    return this.request(`/gestiones-mes/goals/${encodeURIComponent(franchise)}`, {
      method: 'PUT', body: JSON.stringify({ dailyGoal }),
    });
  }
  cliente = (id: string, signal?: AbortSignal) => this.request(`/clientes/${id}`, { signal });
  seguimiento = (franchise: string, signal?: AbortSignal) =>
    this.request(`/seguimiento?franchise=${encodeURIComponent(franchise)}`, { signal });
  blacklist = (franchise: string, signal?: AbortSignal) =>
    this.request(`/blacklist?franchise=${encodeURIComponent(franchise)}`, { signal });
  syncData = () => this.request('/importaciones/sync', { method: 'POST' });

  prioridad(params: Record<string, string>, signal?: AbortSignal) {
    return this.request(`/clientes/prioridad?${this.query(params)}`, { signal });
  }

  gestionesMes = (month = '', signal?: AbortSignal) =>
    this.request(`/gestiones-mes${month ? `?month=${encodeURIComponent(month)}` : ''}`, { signal });

  guardarNota(id: string, nota: string) {
    return this.request(`/clientes/${id}/notas`, {
      method: 'PUT', body: JSON.stringify({ nota }),
    });
  }

  guardarIncidencia(franchise: string, date: string, note: string) {
    return this.request(`/gestiones-mes/incidents/${encodeURIComponent(franchise)}/${date}`, {
      method: 'PUT', body: JSON.stringify({ note }),
    });
  }

  quitarIncidencia(franchise: string, date: string) {
    return this.request(`/gestiones-mes/incidents/${encodeURIComponent(franchise)}/${date}`, {
      method: 'DELETE',
    });
  }

  clientes(params: Record<string, string>) {
    return this.request(`/clientes?${this.query(params)}`);
  }

  guardarGestion(id: string, body: unknown) {
    return this.request(`/clientes/${id}/gestion`, { method: 'POST', body: JSON.stringify(body) });
  }

  agregarBlacklist(id: string, motivo: string) {
    return this.request(`/clientes/${id}/blacklist`, {
      method: 'POST',
      body: JSON.stringify({ motivo }),
    });
  }

  quitarBlacklist(id: string) {
    return this.request(`/clientes/${id}/blacklist`, { method: 'DELETE' });
  }

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const token = await this.auth.getValidAccessToken();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort('timeout'), 15_000);
    const externalSignal = options.signal;
    const abortFromExternal = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted) abortFromExternal();
    else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
    let response: Response;
    try {
      response = await fetch(`${this.apiBase}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers ?? {}),
        },
      });
    } catch (error: any) {
      if (controller.signal.aborted && !externalSignal?.aborted) {
        throw new Error('La solicitud tardó demasiado. Revisa tu conexión e intenta nuevamente.');
      }
      if (error?.name === 'TypeError') {
        throw new Error('No fue posible conectar con el servicio de cartera. Intenta nuevamente.');
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromExternal);
    }

    if (response.status === 204) return null;

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new Error('La API de cartera no está conectada en este despliegue. Intenta nuevamente o revisa la configuración de Vercel.');
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        this.auth.clearSession();
        window.dispatchEvent(new CustomEvent('auth-required'));
      }
      throw new Error(payload.error ?? `Error ${response.status}`);
    }

    return payload;
  }

  private query(params: Record<string, string>): string {
    return new URLSearchParams(Object.entries(params).filter(([, value]) => Boolean(value))).toString();
  }

  private resolveApiBase(): string {
    const configured = String(window.__APP_CONFIG__?.apiBase ?? '').trim();
    if (configured) return configured.replace(/\/$/, '');
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:3001/api'
      : '/api';
  }
}
