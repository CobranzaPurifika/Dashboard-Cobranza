import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
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
export class ManagementComponent implements OnChanges {
  @Input() franchise = 'todas';
  @Input() user: any;
  @Input() statusCatalog: any[] = [];
  @Input() dashboardData: any;
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
  loaded = false;
  detailLoading = false;
  detail: any = null;
  error = '';
  showStats = false;

  gestionStatus = '';
  gestionComment = '';
  agendaDate = '';
  agendaHour = '12:00';
  agendaNote = '';
  blacklistReason = '';
  saving = false;
  private queryTimer?: ReturnType<typeof setTimeout>;

  readonly hours = Array.from({ length: 10 }, (_, index) => `${String(index + 9).padStart(2, '0')}:00`);

  constructor(private readonly api: ApiService) {}

  ngOnChanges(): void {
    void this.loadAll();
  }

  get canManage(): boolean {
    return ['admin', 'gestor'].includes(this.user?.role);
  }

  get callLaterSelected(): boolean {
    return this.isCallLater(this.statusCatalog.find((status) => status.value === this.gestionStatus));
  }

  setSegment(value: string): void {
    this.segment = value;
    void this.loadPriority();
  }

  onSearch(): void {
    clearTimeout(this.queryTimer);
    this.queryTimer = setTimeout(() => void this.loadPriority(), 300);
  }

  async loadAll(): Promise<void> {
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
    this.error = [...new Set(failures)].join(' · ');
    this.loaded = true;
    this.loading = false;
  }

  async loadPriority(): Promise<void> {
    const result = await this.api.prioridad({
      franchise: this.franchise,
      segment: this.segment,
      q: this.query,
    });
    this.priority = result.rows;
    this.priorityShown = result.shown;
    this.priorityTotal = result.total;
  }

  async loadFollowup(): Promise<void> {
    const data = await this.api.seguimiento(this.franchise);
    this.overdue = data.overdue;
    this.scheduled = data.scheduled;
  }

  async loadBlacklist(): Promise<void> {
    this.blacklist = await this.api.blacklist(this.franchise);
  }

  async openDetail(id: string): Promise<void> {
    this.detailLoading = true;
    this.error = '';
    try {
      this.detail = await this.api.cliente(id);
      this.gestionStatus = this.detail.estatus_value || this.statusCatalog[0]?.value || '';
      this.gestionComment = '';
      this.blacklistReason = '';
      this.agendaDate = this.dateOnly(this.detail.agenda_fecha_iso) || this.todayMexico();
      this.agendaHour = this.hours.includes(this.detail.agenda_hora) ? this.detail.agenda_hora : this.suggestedHour();
      this.agendaNote = this.detail.agenda_nota ?? '';
    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.detailLoading = false;
    }
  }

  closeDetail(): void {
    this.detail = null;
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

  salesExecutives(): string {
    return [...new Set((this.detail?.invoices ?? []).map((invoice: any) => invoice.ejecutivo_ventas).filter(Boolean))].join(', ');
  }

  private async refreshContext(id: string): Promise<void> {
    await Promise.all([this.openDetail(id), this.loadAll()]);
    this.refreshRequested.emit();
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
