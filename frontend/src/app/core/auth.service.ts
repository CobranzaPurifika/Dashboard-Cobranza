import { Injectable } from '@angular/core';

declare global {
  interface Window {
    __APP_CONFIG__?: {
      apiBase?: string;
      supabaseUrl?: string;
      supabaseAnonKey?: string;
    };
  }
}

interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in?: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storageKey = 'cobranza-purifika.session';

  hasSession(): boolean {
    return Boolean(this.readSession()?.refresh_token);
  }

  async signIn(email: string, password: string): Promise<void> {
    this.assertConfigured();
    const session = await this.authRequest('/token?grant_type=password', {
      email: email.trim().toLowerCase(),
      password,
    });
    this.writeSession(session);
  }

  async getValidAccessToken(): Promise<string | null> {
    const session = this.readSession();
    if (!session) return null;

    if (session.access_token && session.expires_at * 1000 > Date.now() + 30_000) {
      return session.access_token;
    }

    if (!session.refresh_token) {
      this.clearSession();
      return null;
    }

    try {
      this.assertConfigured();
      const refreshed = await this.authRequest('/token?grant_type=refresh_token', {
        refresh_token: session.refresh_token,
      });
      this.writeSession(refreshed);
      return refreshed.access_token;
    } catch (error) {
      this.clearSession();
      window.dispatchEvent(new CustomEvent('auth-required'));
      throw error;
    }
  }

  async signOut(): Promise<void> {
    const session = this.readSession();
    this.clearSession();
    const { supabaseUrl, supabaseAnonKey } = window.__APP_CONFIG__ ?? {};
    if (!session?.access_token || !supabaseUrl || !supabaseAnonKey) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    await fetch(`${this.normalizeUrl(supabaseUrl)}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${session.access_token}` },
      signal: controller.signal,
    }).catch(() => undefined).finally(() => window.clearTimeout(timeout));
  }

  clearSession(): void {
    localStorage.removeItem(this.storageKey);
  }

  private assertConfigured(): void {
    const { supabaseUrl, supabaseAnonKey } = window.__APP_CONFIG__ ?? {};
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Falta configurar SUPABASE_URL o SUPABASE_ANON_KEY en el despliegue');
    }
  }

  private async authRequest(path: string, body: Record<string, string>): Promise<StoredSession> {
    const { supabaseUrl, supabaseAnonKey } = window.__APP_CONFIG__ ?? {};
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetch(`${this.normalizeUrl(supabaseUrl!)}/auth/v1${path}`, {
        method: 'POST',
        headers: { apikey: supabaseAnonKey!, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error: any) {
      if (controller.signal.aborted) {
        throw new Error('El inicio de sesión tardó demasiado. Intenta nuevamente.');
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = payload.error_description ?? payload.msg ?? 'No fue posible iniciar sesión';
      if (/invalid login credentials/i.test(message)) {
        throw new Error('Correo o contraseña incorrectos');
      }
      throw new Error(message);
    }

    if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
      throw new Error('El servicio de autenticación no está configurado correctamente.');
    }

    return response.json();
  }

  private readSession(): StoredSession | null {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) ?? 'null');
    } catch {
      this.clearSession();
      return null;
    }
  }

  private writeSession(session: StoredSession): void {
    const expiresAt = session.expires_at ?? Math.floor(Date.now() / 1000) + Number(session.expires_in ?? 3600);
    localStorage.setItem(this.storageKey, JSON.stringify({ ...session, expires_at: expiresAt }));
  }

  private normalizeUrl(url: string): string {
    return String(url).replace(/\/$/, '');
  }
}
