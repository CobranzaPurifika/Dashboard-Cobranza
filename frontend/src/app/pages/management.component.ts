import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { ApiService } from '../core/api.service';

const TRAMO_LABEL: Record<string, string> = {
  good: 'Al corriente',
  warning: '1-30 días',
  serious: '31-60 días',
  critical: '+60 días',
};

@Component({
  selector: 'app-management',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon, IonSpinner],
  templateUrl: './management.component.html',
  styleUrl: './management.component.scss',
})
export class ManagementComponent implements OnChanges, OnDestroy {
  @Input() franchise = 'todas';
  @Input() user: any;
  @Input() statusCatalog: any[] = [];
  @Output() refreshRequested = new EventEmitter<void>();

  priority: any[] = [];
  priorityShown = 0;
  priorityTotal = 0;
  overdue: any[] = [];
  scheduled: any[] = [];
  blacklist: any[] = [];
  segment = '';
  query = '';
  loading = false;
  priorityLoading = false;
  loaded = false;
  detailLoading = false;
  detailLoadError = '';
  pendingDetailId = '';
  detail: any = null;
  error = '';
  showStats = false;
  overdueExpanded = true;
  scheduledExpanded = true;
  monthlyLoading = false;
  monthlyError = '';
  monthlyData: any = null;

  gestionStatus = '';
  gestionComment = '';
  agendaDate = '';
  agendaHour = '12:00';
  agendaNote = '';
  blacklistReason = '';
  saving = false;
  noteSaving = false;
  clientNotes = '';
  showAllTimeline = false;
  showAgendaModal = false;
  showInvoicesModal = false;
  selectedInvoiceIds = new Set<string>();
  private queryTimer?: ReturnType<typeof setTimeout>;
  private priorityAbort?: AbortController;
  private detailAbort?: AbortController;
  private followupAbort?: AbortController;
  private blacklistAbort?: AbortController;
  private monthlyAbort?: AbortController;
  private loadRequest = 0;
  private priorityRequest = 0;
  private detailRequest = 0;
  private followupRequest = 0;
  private blacklistRequest = 0;
  private monthlyRequest = 0;

  readonly hours = Array.from({ length: 10 }, (_, index) => `${String(index + 9).padStart(2, '0')}:00`);

  constructor(private readonly api: ApiService) {}

  ngOnChanges(changes: SimpleChanges): void {
    // Los cambios de franquicia son el único disparador de las tres consultas. Evitar
    // recargas por referencias de usuario/catálogo elimina abortos cruzados al arrancar.
    if (changes['franchise']) {
      this.priority = [];
      this.overdue = [];
      this.scheduled = [];
      this.blacklist = [];
      this.loaded = false;
      this.closeDetail();
    }
    if (changes['franchise']) void this.loadAll();
  }

  ngOnDestroy(): void {
    clearTimeout(this.queryTimer);
    this.priorityAbort?.abort();
    this.detailAbort?.abort();
    this.followupAbort?.abort();
    this.blacklistAbort?.abort();
    this.monthlyAbort?.abort();
  }

  get canManage(): boolean {
    return ['admin', 'gestor'].includes(this.user?.role);
  }

  get callLaterSelected(): boolean {
    return this.isCallLater(this.statusCatalog.find((status) => status.value === this.gestionStatus));
  }

  setSegment(value: string): void {
    if (this.segment === value) return;
    this.segment = value;
    this.priority = [];
    void this.reloadPriority();
  }

  onSearch(): void {
    clearTimeout(this.queryTimer);
    this.priorityLoading = true;
    this.priority = [];
    this.queryTimer = setTimeout(() => void this.reloadPriority(), 300);
  }

  async loadAll(): Promise<void> {
    const requestId = ++this.loadRequest;
    this.loading = true;
    this.error = '';
    const results = await Promise.allSettled([
      this.loadPriority(),
      this.loadFollowup(),
      this.loadBlacklist(),
    ]);
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason?.message ?? 'No fue posible cargar una sección');
    if (requestId === this.loadRequest) {
      this.error = [...new Set(failures)].join(' · ');
      this.loaded = true;
      this.loading = false;
    }
  }

  async loadPriority(): Promise<void> {
    this.priorityAbort?.abort();
    const controller = new AbortController();
    this.priorityAbort = controller;
    const requestId = ++this.priorityRequest;
    this.priorityLoading = true;
    try {
      const result = await this.api.prioridad({
        franchise: this.franchise,
        segment: this.segment,
        q: this.query,
      }, controller.signal);
      if (!controller.signal.aborted && requestId === this.priorityRequest) {
        this.priority = result.rows;
        this.priorityShown = result.shown;
        this.priorityTotal = result.total;
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') throw error;
    } finally {
      if (requestId === this.priorityRequest) this.priorityLoading = false;
    }
  }

  async loadFollowup(): Promise<void> {
    this.followupAbort?.abort();
    const controller = new AbortController();
    this.followupAbort = controller;
    const requestId = ++this.followupRequest;
    try {
      const data = await this.api.seguimiento(this.franchise, controller.signal);
      if (!controller.signal.aborted && requestId === this.followupRequest) {
        this.overdue = data.overdue;
        this.scheduled = data.scheduled;
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') throw error;
    }
  }

  async loadBlacklist(): Promise<void> {
    this.blacklistAbort?.abort();
    const controller = new AbortController();
    this.blacklistAbort = controller;
    const requestId = ++this.blacklistRequest;
    try {
      const blacklist = await this.api.blacklist(this.franchise, controller.signal);
      if (!controller.signal.aborted && requestId === this.blacklistRequest) this.blacklist = blacklist;
    } catch (error: any) {
      if (error?.name !== 'AbortError') throw error;
    }
  }

  async openDetail(id: string): Promise<void> {
    this.detailAbort?.abort();
    const controller = new AbortController();
    this.detailAbort = controller;
    const requestId = ++this.detailRequest;
    this.pendingDetailId = id;
    this.detailLoading = true;
    this.detailLoadError = '';
    if (this.detail?.id !== id) this.detail = null;
    this.error = '';
    try {
      const detail = await this.api.cliente(id, controller.signal);
      if (controller.signal.aborted || requestId !== this.detailRequest) return;
      this.detail = detail;
      this.gestionStatus = this.detail.estatus_value || this.statusCatalog[0]?.value || '';
      this.gestionComment = '';
      this.blacklistReason = '';
      this.agendaDate = this.dateOnly(this.detail.agenda_fecha_iso) || this.todayMexico();
      this.agendaHour = this.hours.includes(this.detail.agenda_hora) ? this.detail.agenda_hora : this.suggestedHour();
      this.agendaNote = this.detail.agenda_nota ?? '';
      this.clientNotes = this.detail.notas ?? '';
      this.showAllTimeline = false;
      this.showAgendaModal = false;
      this.showInvoicesModal = false;
      this.selectedInvoiceIds = new Set();
      this.pendingDetailId = '';
    } catch (error: any) {
      if (error?.name !== 'AbortError') this.detailLoadError = error.message;
    } finally {
      if (!controller.signal.aborted && requestId === this.detailRequest) this.detailLoading = false;
    }
  }

  closeDetail(): void {
    this.detailAbort?.abort();
    this.detailRequest += 1;
    this.detailLoading = false;
    this.detailLoadError = '';
    this.pendingDetailId = '';
    this.detail = null;
    this.showAgendaModal = false;
    this.showInvoicesModal = false;
  }

  async openMonthlyStats(): Promise<void> {
    this.monthlyAbort?.abort();
    const controller = new AbortController();
    this.monthlyAbort = controller;
    const requestId = ++this.monthlyRequest;
    this.showStats = true;
    this.monthlyLoading = true;
    this.monthlyError = '';
    try {
      const data = await this.api.gestionesMes('', controller.signal);
      if (!controller.signal.aborted && requestId === this.monthlyRequest) this.monthlyData = data;
    } catch (error: any) {
      if (error?.name !== 'AbortError' && requestId === this.monthlyRequest) this.monthlyError = error.message;
    } finally {
      if (!controller.signal.aborted && requestId === this.monthlyRequest) this.monthlyLoading = false;
    }
  }

  closeMonthlyStats(): void {
    this.monthlyAbort?.abort();
    this.monthlyRequest += 1;
    this.monthlyLoading = false;
    this.showStats = false;
  }

  async markIncident(franchise: string, date: string, currentNote = ''): Promise<void> {
    const note = window.prompt('Describe la incidencia que justifica este día:', currentNote)?.trim();
    if (!note) return;
    try {
      await this.api.guardarIncidencia(franchise, date, note);
      this.monthlyData = await this.api.gestionesMes(this.monthlyData?.month ?? '');
    } catch (error: any) {
      this.monthlyError = error.message;
    }
  }

  async removeIncident(franchise: string, date: string): Promise<void> {
    try {
      await this.api.quitarIncidencia(franchise, date);
      this.monthlyData = await this.api.gestionesMes(this.monthlyData?.month ?? '');
    } catch (error: any) {
      this.monthlyError = error.message;
    }
  }

  async saveManagement(): Promise<void> {
    if (!this.detail || !this.gestionStatus || this.saving) return;
    this.saving = true;
    this.error = '';
    try {
      const body: any = { estatusValue: this.gestionStatus, comentario: this.gestionComment };
      if (this.callLaterSelected) {
        body.agenda = { fechaISO: this.agendaDate, hora: this.agendaHour, nota: this.agendaNote };
      }
      await this.api.guardarGestion(this.detail.id, body);
      await this.refreshContext(this.detail.id);
    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.saving = false;
    }
  }

  retryDetail(): void {
    if (this.pendingDetailId) void this.openDetail(this.pendingDetailId);
  }

  openAgenda(): void {
    if (!this.detail) return;
    this.showAgendaModal = true;
  }

  closeAgenda(): void { this.showAgendaModal = false; }

  openInvoices(): void {
    this.selectedInvoiceIds = new Set();
    this.showInvoicesModal = true;
  }

  toggleInvoice(id: string): void {
    const next = new Set(this.selectedInvoiceIds);
    next.has(id) ? next.delete(id) : next.add(id);
    this.selectedInvoiceIds = next;
  }

  toggleAllInvoices(): void {
    const invoices = this.detail?.invoices ?? [];
    this.selectedInvoiceIds = this.selectedInvoiceIds.size === invoices.length
      ? new Set()
      : new Set(invoices.map((invoice: any) => String(invoice.id)));
  }

  selectedInvoicesTotal(): number {
    return (this.detail?.invoices ?? [])
      .filter((invoice: any) => this.selectedInvoiceIds.has(String(invoice.id)))
      .reduce((sum: number, invoice: any) => sum + Number(invoice.monto ?? 0), 0);
  }

  async saveNote(): Promise<void> {
    if (!this.detail || this.noteSaving) return;
    this.noteSaving = true;
    this.error = '';
    try {
      const updated = await this.api.guardarNota(this.detail.id, this.clientNotes);
      if (this.detail?.id === updated.id) this.detail = { ...this.detail, notas: updated.notas };
    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.noteSaving = false;
    }
  }

  async addBlacklist(): Promise<void> {
    const reason = this.blacklistReason.trim();
    if (!this.detail || !reason || this.saving) return;
    this.saving = true;
    try {
      await this.api.agregarBlacklist(this.detail.id, reason);
      await this.refreshContext(this.detail.id);
    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.saving = false;
    }
  }

  async removeBlacklist(): Promise<void> {
    if (!this.detail || !window.confirm(`¿Quitar a ${this.detail.name} de Lista negra?`)) return;
    this.saving = true;
    try {
      await this.api.quitarBlacklist(this.detail.id);
      await this.refreshContext(this.detail.id);
    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.saving = false;
    }
  }

  money(value: unknown): string {
    return `$${Number(value ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
  }

  tramoLabel(tramo: string): string {
    return TRAMO_LABEL[tramo] ?? tramo;
  }

  shortDate(value: string): string {
    if (!value) return '';
    const [year, month, day] = this.dateOnly(value).split('-').map(Number);
    return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', timeZone: 'UTC' })
      .format(new Date(Date.UTC(year, month - 1, day)))
      .replace('.', '')
      .replace(/[-/]/g, ' ');
  }

  compactDaily(day: any): string {
    const counts = day?.counts ?? {};
    return `AGS: ${counts.aguascalientes ?? 0} - CUN: ${counts.cancun ?? 0} - MID: ${counts.merida ?? 0}`;
  }

  salesExecutives(): string {
    return [...new Set((this.detail?.invoices ?? []).map((invoice: any) => invoice.ejecutivo_ventas).filter(Boolean))].join(', ');
  }

  private async refreshContext(id: string): Promise<void> {
    await Promise.all([this.openDetail(id), this.loadAll()]);
    this.refreshRequested.emit();
  }

  private async reloadPriority(): Promise<void> {
    this.error = '';
    try {
      await this.loadPriority();
    } catch (error: any) {
      this.error = error.message;
    }
  }

  private isCallLater(status: any): boolean {
    const value = this.normalized(status?.value).replace(/[^a-z0-9]+/g, '_');
    return value === 'llamar_mas_tarde' || this.normalized(status?.label) === 'llamar mas tarde';
  }

  private normalized(value: unknown): string {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  }

  private dateOnly(value: unknown): string {
    return value ? String(value).slice(0, 10) : '';
  }

  private todayMexico(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  private suggestedHour(): string {
    const hour = Number(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City', hour: '2-digit', hourCycle: 'h23',
    }).format(new Date()));
    return `${String(Math.max(9, Math.min(18, hour + 3))).padStart(2, '0')}:00`;
  }
}
