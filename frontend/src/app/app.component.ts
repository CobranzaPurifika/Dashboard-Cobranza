import { CommonModule } from '@angular/common';
import { Component, HostBinding, HostListener, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonApp, IonContent, IonIcon, IonSpinner } from '@ionic/angular';
import { ApiService } from './core/api.service';
import { AuthService } from './core/auth.service';
import { AppPreferences, DEFAULT_PREFERENCES, loadPreferences, savePreferences } from './core/preferences';
import { DashboardComponent } from './pages/dashboard.component';
import { ManagementComponent } from './pages/management.component';
import { PresentationComponent } from './pages/presentation.component';

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
  imports: [CommonModule, FormsModule, IonApp, IonContent, IonIcon, IonSpinner, DashboardComponent, ManagementComponent, PresentationComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  @HostBinding('class.dark-theme') darkTheme = true;
  @HostBinding('class.presentation-mode') presentationMode = false;

  user: any = null;
  franchises: FranchiseOption[] = [];
  franchise = 'todas';
  view: 'dashboard' | 'management' = 'dashboard';
  dashboardData: any = null;
  statusCatalog: any[] = [];
  loading = true;
  loginVisible = false;
  loginEmail = '';
  loginPassword = '';
  loginError = '';
  loginLoading = false;
  syncLoading = false;
  syncStatus = '';
  statusSaving = '';
  statusError = '';
  newStatusLabel = '';
  settingsVisible = false;
  appError = '';
  preferences: AppPreferences = { ...DEFAULT_PREFERENCES };
  expandedSettingsSections = new Set<string>();
  dailyGoals: any[] = [];
  goalsLoaded = false;
  goalsLoading = false;
  goalsError = '';
  goalSaving = '';
  private dashboardAbort?: AbortController;
  private dashboardRequest = 0;

  constructor(private readonly api: ApiService, private readonly auth: AuthService) {}

  ngOnInit(): void {
    const savedTheme = localStorage.getItem('cobranza-purifika.theme');
    this.darkTheme = savedTheme ? savedTheme === 'dark' : true;
    this.preferences = loadPreferences(localStorage);
    window.addEventListener('auth-required', () => this.showLogin('Tu sesión terminó. Ingresa nuevamente.'));
    void this.openApp();
  }

  presentationFranchises: FranchiseOption[] = [];

  get isAnonymous(): boolean { return this.user?.isAnonymous === true; }
  get isAdmin(): boolean { return this.user?.role === 'admin'; }

  async openApp(): Promise<void> {
    this.loading = true;
    this.appError = '';
    try {
      this.user = await this.api.me();
      this.franchises = this.franchisesForUser(this.user);
      this.applyPresentationFranchises();
      if (!this.franchises.length) throw new Error('Tu cuenta todavía no tiene franquicias asignadas');
      const preferred = this.preferences.defaultFranchise;
      this.franchise = this.franchises.some((option) => option.id === preferred) ? preferred : this.franchises[0].id;
      // Al recargar se conserva el Dashboard como pantalla de entrada. Antes se cambiaba
      // a Gestión mientras aún llegaban las respuestas; junto con el render diferido eso
      // hacía que un clic en tema revelara una vista distinta a la esperada.
      if (this.isAnonymous) this.view = 'dashboard';
      this.statusCatalog = this.isAnonymous ? [] : await this.api.statusGestion();
      this.loginVisible = false;
      await this.loadDashboard();
    } catch (error: any) {
      if (this.auth.hasSession()) {
        this.auth.clearSession();
        this.showLogin(error.message);
      } else {
        this.appError = error.message;
      }
    } finally {
      this.loading = false;
    }
  }

  async signIn(): Promise<void> {
    if (this.loginLoading) return;
    this.loginLoading = true;
    this.loginError = '';
    try {
      await this.auth.signIn(this.loginEmail, this.loginPassword);
      this.view = 'management';
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

  async setView(view: 'dashboard' | 'management'): Promise<void> {
    if (view === 'management' && this.isAnonymous) return;
    this.view = view;
    if (!this.dashboardData) await this.loadDashboard();
  }

  selectFranchise(id: string): void {
    if (this.franchise === id) return;
    this.franchise = id;
    void this.loadDashboard();
  }

  async loadDashboard(): Promise<void> {
    const requestId = ++this.dashboardRequest;
    this.dashboardAbort?.abort();
    const controller = new AbortController();
    this.dashboardAbort = controller;
    this.loading = true;
    this.appError = '';
    try {
      const data = await this.api.dashboard(this.franchise, controller.signal);
      if (requestId === this.dashboardRequest) this.dashboardData = data;
    } catch (error: any) {
      if (error?.name !== 'AbortError' && requestId === this.dashboardRequest) {
        this.appError = error.message;
      }
    } finally {
      if (requestId === this.dashboardRequest) this.loading = false;
    }
  }

  retry(): void {
    if (this.user) void this.loadDashboard();
    else void this.openApp();
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

  async moveStatus(index: number, direction: -1 | 1): Promise<void> {
    const target = index + direction;
    if (this.statusSaving || target < 0 || target >= this.statusCatalog.length) return;
    const reordered = [...this.statusCatalog];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    this.statusCatalog = reordered;
    this.statusSaving = 'reorder';
    this.statusError = '';
    try {
      this.statusCatalog = await this.api.reordenarStatus(reordered.map((item) => item.value));
    } catch (error: any) {
      this.statusError = error.message;
    } finally {
      this.statusSaving = '';
    }
  }

  async deleteStatus(status: any): Promise<void> {
    if (this.statusSaving) return;
    this.statusSaving = status.value;
    this.statusError = '';
    try {
      await this.api.eliminarStatus(status.value);
      this.statusCatalog = this.statusCatalog.filter((item) => item.value !== status.value);
    } catch (error: any) {
      this.statusError = error.message;
    } finally {
      this.statusSaving = '';
    }
  }

  async addStatus(): Promise<void> {
    const label = this.newStatusLabel.trim();
    if (!label || this.statusSaving) return;
    this.statusSaving = 'new';
    this.statusError = '';
    try {
      const created = await this.api.crearStatus(label);
      this.statusCatalog = [...this.statusCatalog, created];
      this.newStatusLabel = '';
    } catch (error: any) {
      this.statusError = error.message;
    } finally {
      this.statusSaving = '';
    }
  }

  toggleTheme(): void {
    this.darkTheme = !this.darkTheme;
    localStorage.setItem('cobranza-purifika.theme', this.darkTheme ? 'dark' : 'light');
  }

  togglePresentation(): void {
    this.presentationMode = !this.presentationMode;
    if (this.presentationMode) this.view = 'dashboard';
  }

  isSectionExpanded(section: string): boolean {
    return this.expandedSettingsSections.has(section);
  }

  toggleSettingsSection(section: string): void {
    const next = new Set(this.expandedSettingsSections);
    if (next.has(section)) {
      next.delete(section);
    } else {
      next.add(section);
      if (section === 'goals' && !this.goalsLoaded) void this.loadGoals();
    }
    this.expandedSettingsSections = next;
  }

  setDefaultFranchise(id: string): void {
    this.preferences = { ...this.preferences, defaultFranchise: id };
    savePreferences(localStorage, this.preferences);
  }

  setPriorityDensity(density: 'comfortable' | 'compact'): void {
    this.preferences = { ...this.preferences, priorityDensity: density };
    savePreferences(localStorage, this.preferences);
  }

  setPresentationDuration(seconds: number): void {
    const durationSeconds = Number.isFinite(seconds) && seconds >= 5 ? Math.round(seconds) : this.preferences.presentation.durationSeconds;
    this.preferences = { ...this.preferences, presentation: { ...this.preferences.presentation, durationSeconds } };
    savePreferences(localStorage, this.preferences);
  }

  setPresentationAutoStart(autoStart: boolean): void {
    this.preferences = { ...this.preferences, presentation: { ...this.preferences.presentation, autoStart } };
    savePreferences(localStorage, this.preferences);
  }

  setPresentationHideControls(hideControls: boolean): void {
    this.preferences = { ...this.preferences, presentation: { ...this.preferences.presentation, hideControls } };
    savePreferences(localStorage, this.preferences);
  }

  togglePresentationFranchise(id: string): void {
    const current = this.preferences.presentation.franchiseIds;
    const allIds = this.franchises.filter((option) => option.id !== 'todas').map((option) => option.id);
    const selected = new Set(current ?? allIds);
    selected.has(id) ? selected.delete(id) : selected.add(id);
    const franchiseIds = selected.size && selected.size < allIds.length ? [...selected] : null;
    this.preferences = { ...this.preferences, presentation: { ...this.preferences.presentation, franchiseIds } };
    savePreferences(localStorage, this.preferences);
    this.applyPresentationFranchises();
  }

  isPresentationFranchiseIncluded(id: string): boolean {
    const ids = this.preferences.presentation.franchiseIds;
    return !ids || ids.includes(id);
  }

  async loadGoals(): Promise<void> {
    this.goalsLoading = true;
    this.goalsError = '';
    try {
      this.dailyGoals = await this.api.metasGestion();
      this.goalsLoaded = true;
    } catch (error: any) {
      this.goalsError = error.message;
    } finally {
      this.goalsLoading = false;
    }
  }

  async saveGoal(row: any): Promise<void> {
    if (this.goalSaving) return;
    this.goalSaving = row.franchise_id;
    this.goalsError = '';
    try {
      const updated = await this.api.guardarMeta(row.franchise_id, Number(row.daily_goal));
      this.dailyGoals = this.dailyGoals.map((item) => item.franchise_id === updated.franchise_id ? { ...item, daily_goal: updated.daily_goal } : item);
    } catch (error: any) {
      this.goalsError = error.message;
    } finally {
      this.goalSaving = '';
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.presentationMode) this.togglePresentation();
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
    return email || (this.isAnonymous ? 'Acceso' : 'Salir');
  }

  private applyPresentationFranchises(): void {
    const all = this.franchises.filter((option) => option.id !== 'todas');
    const ids = this.preferences.presentation.franchiseIds;
    this.presentationFranchises = ids ? all.filter((option) => ids.includes(option.id)) : all;
  }

  private franchisesForUser(user: any): FranchiseOption[] {
    if (user.allFranchises) return FRANCHISES;
    const assigned = new Set(user.franchise_ids ?? []);
    const choices = FRANCHISES.filter((item) => item.id !== 'todas' && assigned.has(item.id));
    return choices.length ? [{ id: 'todas', label: 'Mis franquicias' }, ...choices] : [];
  }
}
