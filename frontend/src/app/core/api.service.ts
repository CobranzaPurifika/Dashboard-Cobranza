import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly apiBase = window.__APP_CONFIG__?.apiBase ?? 'http://localhost:3001/api';

  constructor(private readonly auth: AuthService) {}

  me = () => this.request('/me');
  dashboard = (franchise: string, signal?: AbortSignal) =>
    this.request(`/dashboard/${franchise}`, { signal });
  statusGestion = () => this.request('/status-gestion');
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
    const response = await fetch(`${this.apiBase}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        this.auth.clearSession();
        window.dispatchEvent(new CustomEvent('auth-required'));
      }
      throw new Error(payload.error ?? `Error ${response.status}`);
    }

    return response.status === 204 ? null : response.json();
  }

  private query(params: Record<string, string>): string {
    return new URLSearchParams(Object.entries(params).filter(([, value]) => Boolean(value))).toString();
  }
}
