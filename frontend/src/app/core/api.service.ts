import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly apiBase = window.__APP_CONFIG__?.apiBase ?? 'http://localhost:3001/api';

  constructor(private readonly auth: AuthService) {}

  me = () => this.request('/me');
  dashboard = (franchise: string) => this.request(`/dashboard/${franchise}`);
  statusGestion = () => this.request('/status-gestion');
  cliente = (id: string) => this.request(`/clientes/${id}`);
  seguimiento = (franchise: string) => this.request(`/seguimiento?franchise=${encodeURIComponent(franchise)}`);
  blacklist = (franchise: string) => this.request(`/blacklist?franchise=${encodeURIComponent(franchise)}`);
  syncData = () => this.request('/importaciones/sync', { method: 'POST' });

  prioridad(params: Record<string, string>) {
    return this.request(`/clientes/prioridad?${this.query(params)}`);
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
