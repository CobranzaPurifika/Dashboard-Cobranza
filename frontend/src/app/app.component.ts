import { CommonModule } from '@angular/common';
import { Component, HostBinding, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonApp, IonContent, IonIcon, IonSpinner } from '@ionic/angular';
import { ApiService } from './core/api.service';
import { AuthService } from './core/auth.service';
import { DashboardComponent } from './pages/dashboard.component';
import { ManagementComponent } from './pages/management.component';
import {
  AppPreferences,
  AppView,
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
} from './core/preferences';

interface FranchiseOption { id: string; label: string }

const FRANCHISES: FranchiseOption[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'aguascalientes', label: 'Aguascalientes' },
  { id: 'cancun', label: 'Cancún' },
  { id: 'merida', label: 'Mérida' },
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, IonApp, IonContent, IonIcon, IonSpinner, DashboardComponent, ManagementComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  @HostBinding('class.dark-theme') darkTheme = true;
  @HostBinding('class.presentation-mode') presentationMode = false;
  @HostBinding('class.compact-density') compactDensity = false;

  user: any = null;
  franchises: FranchiseOption[] = [];
  franchise = 'todas';
  pendingFranchise = '';
  view: AppView = 'dashboard';
  dashboardData: any = null;
  statusCatalog: any[] = [];
  bootstrapping = true;
  dashboardLoading = false;
  loginVisible = false;
  loginEmail = '';
  loginPassword = '';
  loginError = '';
  loginLoading = false;
  syncLoading = false;
  syncStatus = '';
  statusSaving = '';
  statusError = '';
  settingsVisible = false;
  settingsTab: 'preferences' | 'management' | 'data' = 'preferences';
  settingsLoading = false;
  preferencesStatus = '';
  preferences: AppPreferences = { ...DEFAULT_PREFERENCES };
  settingsDraft: AppPreferences = { ...DEFAULT_PREFERENCES };
  managementGoals: any[] = [];
  goalSaving = '';
  goalError = '';
  appError = '';
  bootstrapSlow = false;
  private dashboardAbort?: AbortController;
  private dashboardRequest = 0;
  private bootstrapTimer?: number;

  constructor(private readonly api: ApiService, private readonly auth: AuthService) {}

  ngOnInit(): void {
    this.preferences = loadPreferences(localStorage);
    this.settingsDraft = { ...this.preferences };
    this.applyPreferences();
    window.addEventListener('auth-required', () => this.showLogin('Tu sesión terminó. Ingresa nuevamente.'));
    void this.openApp();
  }

  get isAnonymous(): boolean { return this.user?.isAnonymous === true; }
  get isAdmin(): boolean { return this.user?.role === 'admin'; }

  async openApp(): Promise<void> {
    this.bootstrapping = true;
    this.bootstrapSlow = false;
    this.appError = '';
    window.clearTimeout(this.bootstrapTimer);
    this.bootstrapTimer = window.setTimeout(() => { this.bootstrapSlow = true; }, 6_000);
    try {
      this.user = await this.api.me();
      this.franchises = this.franchisesForUser(this.user);
      if (!this.franchises.length) throw new Error('Tu cuenta todavía no tiene franquicias asignadas');
      const preferredFranchise = this.preferences.defaultFranchise;
      this.franchise = this.franchises.some((option) => option.id === preferredFranchise)
        ? preferredFranchise
        : this.franchises[0].id;
      this.view = this.isAnonymous ? 'dashboard' : this.preferences.initialView;
      this.loginVisible = false;
      this.bootstrapping = false;

      const statusPromise = this.isAnonymous ? Promise.resolve([]) : this.api.statusGestion();
      const [statusResult] = await Promise.allSettled([statusPromise, this.loadDashboard()]);
      if (statusResult.status === 'fulfilled') {
        this.statusCatalog = statusResult.value;
      } else {
        this.appError = statusResult.reason?.message ?? 'No fue posible cargar los estatus de gestión';
      }
    } catch (error: any) {
      if (!this.loginVisible) {
        this.appError = error.message;
      }
    } finally {
      window.clearTimeout(this.bootstrapTimer);
      this.bootstrapping = false;
    }
  }

  retryOpenApp(): void {
    void this.openApp();
  }

  async signIn(): Promise<void> {
    if (this.loginLoading) return;
    this.loginLoading = true;
    this.loginError = '';
    try {
      await this.auth.signIn(this.loginEmail, this.loginPassword);
      await this.openApp();
      this.loginPassword = '';
    } catch (error: any) {
      this.auth.clearSession();
      this.loginError = error.message;
    } finally {
      this.loginLoading = false;
    }
  }

  async accountAction(): Promise<void> {
    if (this.isAnonymous) {
      this.showLogin();
      return;
    }
    await this.auth.signOut();
    this.user = null;
    this.franchise = 'todas';
    await this.openApp();
  }

  showLogin(message = ''): void {
    this.loginError = message;
    this.loginVisible = true;
  }

  async setView(view: AppView): Promise<void> {
    if (view === 'management' && this.isAnonymous) return;
    this.view = view;
    if (!this.dashboardData) await this.loadDashboard();
  }

  async selectFranchise(id: string): Promise<void> {
    if (this.franchise === id || this.pendingFranchise) return;
    this.pendingFranchise = id;
    const loaded = await this.loadDashboard(id);
    if (loaded) this.franchise = id;
    this.pendingFranchise = '';
  }

  async loadDashboard(franchise = this.franchise): Promise<boolean> {
    const requestId = ++this.dashboardRequest;
    this.dashboardAbort?.abort();
    const controller = new AbortController();
    this.dashboardAbort = controller;
    this.dashboardLoading = true;
    this.appError = '';
    try {
      const data = await this.api.dashboard(franchise, controller.signal);
      if (requestId === this.dashboardRequest) this.dashboardData = data;
      return requestId === this.dashboardRequest;
    } catch (error: any) {
      if (error?.name !== 'AbortError' && requestId === this.dashboardRequest) {
        this.appError = error.message;
      }
      return false;
    } finally {
      if (requestId === this.dashboardRequest) this.dashboardLoading = false;
    }
  }

  async syncData(): Promise<void> {
    if (this.syncLoading) return;
    this.syncLoading = true;
    this.syncStatus = 'Leyendo BDD y Pagos…';
    try {
      const result = await this.api.syncData();
      this.syncStatus = result.bdd.status === 'skipped'
        ? `Sin cambios: ${result.bdd.details.reason}`
        : `Actualizado: ${result.bdd.rowsApplied} BDD · ${result.pagos?.rowsApplied ?? 0} pagos`;
      await this.loadDashboard();
    } catch (error: any) {
      this.syncStatus = error.message;
    } finally {
      this.syncLoading = false;
    }
  }

  async saveStatus(status: any): Promise<void> {
    if (this.statusSaving) return;
    this.statusSaving = status.value;
    this.statusError = '';
    try {
      const updated = await this.api.actualizarStatus(status.value, {
        label: String(status.label ?? '').trim(),
        bg: String(status.bg ?? '').trim(),
        efectiva: status.efectiva === true,
        sortOrder: Number(status.sort_order),
      });
      this.statusCatalog = this.statusCatalog
        .map((item) => item.value === updated.value ? updated : item)
        .sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
    } catch (error: any) {
      this.statusError = error.message;
    } finally {
      this.statusSaving = '';
    }
  }

  async openSettings(): Promise<void> {
    this.settingsVisible = true;
    this.settingsTab = 'preferences';
    this.settingsDraft = { ...this.preferences };
    this.preferencesStatus = '';
    this.goalError = '';
    this.settingsLoading = true;
    try {
      this.managementGoals = await this.api.managementGoals();
    } catch (error: any) {
      this.goalError = error.message;
    } finally {
      this.settingsLoading = false;
    }
  }

  saveAppPreferences(): void {
    const defaultFranchise = this.franchises.some((option) => option.id === this.settingsDraft.defaultFranchise)
      ? this.settingsDraft.defaultFranchise
      : this.franchises[0]?.id ?? 'todas';
    this.preferences = { ...this.settingsDraft, defaultFranchise };
    savePreferences(localStorage, this.preferences);
    this.applyPreferences();
    this.preferencesStatus = 'Preferencias guardadas en este dispositivo.';
  }

  async saveGoal(goal: any): Promise<void> {
    if (this.goalSaving) return;
    this.goalSaving = goal.franchise_id;
    this.goalError = '';
    try {
      const updated = await this.api.actualizarMetaGestion(goal.franchise_id, Number(goal.daily_goal));
      goal.daily_goal = updated.daily_goal;
    } catch (error: any) {
      this.goalError = error.message;
    } finally {
      this.goalSaving = '';
    }
  }

  toggleTheme(): void {
    this.darkTheme = !this.darkTheme;
    this.preferences = { ...this.preferences, theme: this.darkTheme ? 'dark' : 'light' };
    this.settingsDraft.theme = this.preferences.theme;
    savePreferences(localStorage, this.preferences);
  }

  togglePresentation(): void {
    this.presentationMode = !this.presentationMode;
    if (this.presentationMode) this.view = 'dashboard';
  }

  portfolioSummary(): string {
    if (!this.dashboardData?.portfolio) return '';
    const count = Number(this.dashboardData.portfolio.clientes ?? 0).toLocaleString('es-MX');
    const balance = Number(this.dashboardData.portfolio.saldo ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
    return `${count} clientes · $${balance}`;
  }

  accountLabel(): string {
    const displayName = String(this.user?.display_name ?? '').trim();
    if (displayName) return displayName;
    const email = String(this.user?.email ?? '').trim();
    return email || (this.isAnonymous ? 'Acceso' : 'Cuenta');
  }

  private franchisesForUser(user: any): FranchiseOption[] {
    if (user.allFranchises) return FRANCHISES;
    const assigned = new Set(user.franchise_ids ?? []);
    const choices = FRANCHISES.filter((item) => item.id !== 'todas' && assigned.has(item.id));
    return choices.length ? [{ id: 'todas', label: 'Mis franquicias' }, ...choices] : [];
  }

  private applyPreferences(): void {
    this.darkTheme = this.preferences.theme === 'dark';
    this.compactDensity = this.preferences.density === 'compact';
  }
}
