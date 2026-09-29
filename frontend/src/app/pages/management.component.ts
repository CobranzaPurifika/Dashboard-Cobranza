import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { ApiService } from '../core/api.service';
import { DatePickerComponent } from './date-picker.component';
import { money as formatMoney, moneyExact as formatMoneyExact, shortDate as formatShortDate, tramoLabel as formatTramoLabel } from '../core/format';

type DocumentType = 'aviso_deuda' | 'aviso_retiro' | 'acuerdo_pagos';

// Los tres documentos formales de cobranza (misma plantilla de marca que la skill
// "documentos-purifika"); el PDF se arma en el backend con los montos de la BDD.
const DOCUMENT_TYPES: { value: DocumentType; label: string; description: string; icon: string; paper: 'carta' | 'oficio' }[] = [
  { value: 'aviso_deuda', label: 'Aviso de deuda', description: 'Recordatorio formal del saldo vencido', icon: 'receipt-outline', paper: 'carta' },
  { value: 'aviso_retiro', label: 'Aviso de retiro de equipos', description: 'Notificación de retiro, con acuse firmable', icon: 'cube-outline', paper: 'oficio' },
  { value: 'acuerdo_pagos', label: 'Acuerdo de pagos', description: 'Propuesta o convenio por parcialidades, firmable', icon: 'calendar-outline', paper: 'oficio' },
];

// Nota sugerida para el aviso de deuda cuando el equipo tiene mantenimiento pendiente; se
// incluye solo si se marca la casilla y se puede editar antes de generar.
const NOTA_MANTENIMIENTO = 'Le recordamos que su equipo purificador tiene un mantenimiento pendiente. Una vez regularizada su cuenta, con gusto lo programamos para mantener la calidad de su servicio de purificación.';

interface Parcialidad {
  fechaISO: string;
  facturaIds: Set<number>;
}

interface DocumentForm {
  tipo: DocumentType;
  label: string;
  fechaISO: string;
  nombre: string;
  direccion: string;
  facturaIds: Set<number>;
  incluirNota: boolean;
  notaAdicional: string;
  retiroFechaISO: string;
  equipos: string;
  esBorrador: boolean;
  parcialidades: Parcialidad[];
  condiciones: string;
}

@Component({
  selector: 'app-management',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon, IonSpinner, DatePickerComponent],
  templateUrl: './management.component.html',
  styleUrl: './management.component.scss',
})
export class ManagementComponent implements OnChanges, OnDestroy {
  @Input() franchise = 'todas';
  @Input() user: any;
  @Input() statusCatalog: any[] = [];
  @Input() priorityDensity: 'comfortable' | 'compact' = 'comfortable';
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
  detail: any = null;
  error = '';
  showStats = false;
  overdueExpanded = true;
  scheduledExpanded = true;
  monthlyLoading = false;
  monthlyError = '';
  monthlyData: any = null;
  dailyCountExpanded = false;
  expandedFranchiseDetails = new Set<string>();
  showBulkIncidentModal = false;
  bulkFranchiseIds = new Set<string>();
  bulkSelectedDates = new Set<string>();
  bulkNote = '';
  bulkSaving = false;
  bulkError = '';
  bulkDragPreviewEnd = '';
  private bulkDragStart: string | null = null;
  private bulkDragMoved = false;

  gestionStatus = '';
  statusMenuOpen = false;
  // Animación de cierre (gota) al guardar una gestión -- ver closeDetailWithDropAnimation().
  closingDrawer = false;
  gestionComment = '';
  agendaDate = '';
  agendaHour = '12:00';
  agendaNote = '';
  blacklistReason = '';
  blacklistPanelOpen = false;
  saving = false;
  noteSaving = false;
  clientNotes = '';
  noteEditing = false;
  timelineTier: 'min' | 'mid' | 'all' = 'min';
  showInvoicesModal = false;
  selectedInvoiceIds = new Set<number>();
  documentMenuOpen = false;
  documentForm: DocumentForm | null = null;
  documentGenerating = false;
  documentError = '';
  documentResult: { fileName: string; warnings: string[] } | null = null;
  readonly documentTypes = DOCUMENT_TYPES;
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

  constructor(private readonly api: ApiService, private readonly cdr: ChangeDetectorRef) {}

  // Works around a change-detection gap in this build: Angular's zone-driven autorun does not
  // reach this component's own view on its own (see frontend/src/main.ts for the root-level
  // half of this workaround, and its comment for why). Call after any async method updates
  // component state so the template actually reflects it.
  private refresh(): void {
    this.cdr.detectChanges();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Los cambios de franquicia son el único disparador de las tres consultas. Evitar
    // recargas por referencias de usuario/catálogo elimina abortos cruzados al arrancar.
    if (changes['franchise'] || !this.loaded) void this.loadAll();
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
    this.segment = value;
    void this.loadPriority();
  }

  onSearch(): void {
    clearTimeout(this.queryTimer);
    this.queryTimer = setTimeout(() => void this.loadPriority(), 300);
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
      this.refresh();
    }
  }

  async loadPriority(): Promise<void> {
    this.priorityAbort?.abort();
    const controller = new AbortController();
    this.priorityAbort = controller;
    const requestId = ++this.priorityRequest;
    this.priorityLoading = true;
    this.refresh();
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
      if (requestId === this.priorityRequest) {
        this.priorityLoading = false;
        this.refresh();
      }
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

  // Descartan un pendiente directamente desde la lista, sin abrir la ficha del cliente
  // (event.stopPropagation evita que el clic también dispare el botón de abrir detalle,
  // ya que ambos comparten fila).
  async discardPromise(client: any, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.api.descartarPromesa(client.id);
      this.overdue = this.overdue.filter((c) => c.id !== client.id);
    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.refresh();
    }
  }

  async discardAgenda(client: any, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.api.quitarAgenda(client.id);
      this.scheduled = this.scheduled.filter((c) => c.id !== client.id);
    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.refresh();
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
    this.detailLoading = true;
    this.error = '';
    try {
      const detail = await this.api.cliente(id, controller.signal);
      if (controller.signal.aborted || requestId !== this.detailRequest) return;
      this.detail = detail;
      // Sin valor por defecto: registrar gestión es una acción nueva cada vez, no debe
      // heredar en silencio el último estatus guardado.
      this.gestionStatus = '';
      this.statusMenuOpen = false;
      this.gestionComment = '';
      this.blacklistReason = '';
      this.agendaDate = this.dateOnly(this.detail.agenda_fecha_iso) || this.todayMexico();
      this.agendaHour = this.hours.includes(this.detail.agenda_hora) ? this.detail.agenda_hora : this.suggestedHour();
      this.agendaNote = this.detail.agenda_nota ?? '';
      this.clientNotes = this.detail.notas ?? '';
      this.noteEditing = false;
      this.timelineTier = 'min';
      this.blacklistPanelOpen = false;
      this.showInvoicesModal = false;
      this.selectedInvoiceIds = new Set();
      this.documentMenuOpen = false;
      this.closeDocumentForm();
    } catch (error: any) {
      if (error?.name !== 'AbortError') this.error = error.message;
    } finally {
      if (!controller.signal.aborted && requestId === this.detailRequest) {
        this.detailLoading = false;
        this.refresh();
      }
    }
  }

  closeDetail(): void {
    this.detailAbort?.abort();
    this.detailRequest += 1;
    this.detailLoading = false;
    this.detail = null;
    this.confirmDialog = null;
    this.closingDrawer = false;
    this.documentMenuOpen = false;
    this.closeDocumentForm();
  }

  // Deja la ficha visible mientras cae la gota (900ms) y luego se desliza/desvanece (400ms
  // más, con animation-delay) -- ver .drop-fall/.detail-drawer.closing en
  // management.component.scss. 1300 = la suma de ambas duraciones.
  private closeDetailWithDropAnimation(): void {
    this.closingDrawer = true;
    setTimeout(() => {
      this.closeDetail();
      this.refresh();
    }, 1300);
  }

  // Deslizar para cerrar en móvil: el panel de detalle vive a la derecha, así que solo se
  // arrastra hacia la derecha para cerrarlo; "Gestiones del mes" vive a la izquierda, en la
  // dirección contraria -- misma dirección en la que cada uno "sale" de la pantalla.
  // Se activa solo si el gesto es claramente horizontal, para no interferir con el scroll
  // vertical normal del contenido.
  private dragStartX: number | null = null;
  private dragStartY: number | null = null;
  private dragEl: HTMLElement | null = null;
  private dragSide: 'left' | 'right' | null = null;
  private dragActive = false;
  private dragDeltaX = 0;

  onDrawerTouchStart(event: TouchEvent, side: 'left' | 'right'): void {
    const touch = event.touches[0];
    this.dragStartX = touch.clientX;
    this.dragStartY = touch.clientY;
    this.dragEl = event.currentTarget as HTMLElement;
    this.dragSide = side;
    this.dragActive = false;
    this.dragDeltaX = 0;
  }

  onDrawerTouchMove(event: TouchEvent): void {
    if (this.dragStartX === null || this.dragStartY === null || !this.dragEl) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - this.dragStartX;
    const deltaY = touch.clientY - this.dragStartY;
    if (!this.dragActive) {
      if (Math.abs(deltaX) < 12 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
      this.dragActive = true;
      this.dragEl.style.transition = 'none';
    }
    this.dragDeltaX = this.dragSide === 'right' ? Math.max(0, deltaX) : Math.min(0, deltaX);
    this.dragEl.style.transform = `translateX(${this.dragDeltaX}px)`;
  }

  onDrawerTouchEnd(): void {
    const el = this.dragEl;
    const side = this.dragSide;
    const wasActive = this.dragActive;
    const dragDeltaX = this.dragDeltaX;
    if (el) {
      el.style.transition = '';
      el.style.transform = '';
    }
    this.dragStartX = null;
    this.dragStartY = null;
    this.dragEl = null;
    this.dragSide = null;
    this.dragActive = false;
    this.dragDeltaX = 0;
    if (!wasActive || Math.abs(dragDeltaX) <= 90) return;
    if (side === 'right') this.closeDetail();
    else this.closeMonthlyStats();
  }

  async openMonthlyStats(): Promise<void> {
    this.monthlyAbort?.abort();
    const controller = new AbortController();
    this.monthlyAbort = controller;
    const requestId = ++this.monthlyRequest;
    this.showStats = true;
    this.monthlyLoading = true;
    this.monthlyError = '';
    this.dailyCountExpanded = false;
    this.expandedFranchiseDetails = new Set();
    try {
      const data = await this.api.gestionesMes('', controller.signal);
      if (!controller.signal.aborted && requestId === this.monthlyRequest) this.monthlyData = data;
    } catch (error: any) {
      if (error?.name !== 'AbortError' && requestId === this.monthlyRequest) this.monthlyError = error.message;
    } finally {
      if (!controller.signal.aborted && requestId === this.monthlyRequest) {
        this.monthlyLoading = false;
        this.refresh();
      }
    }
  }

  closeMonthlyStats(): void {
    this.monthlyAbort?.abort();
    this.monthlyRequest += 1;
    this.monthlyLoading = false;
    this.showStats = false;
  }

  isFranchiseDetailExpanded(id: string): boolean {
    return this.expandedFranchiseDetails.has(id);
  }

  toggleFranchiseDetail(id: string): void {
    const next = new Set(this.expandedFranchiseDetails);
    next.has(id) ? next.delete(id) : next.add(id);
    this.expandedFranchiseDetails = next;
  }

  get bulkAvailableDates(): string[] {
    const dates = new Set<string>();
    for (const franchise of this.monthlyData?.franchises ?? []) {
      for (const day of franchise.days ?? []) dates.add(day.date);
    }
    return [...dates].sort();
  }

  // Vista de calendario del cumplimiento diario por franquicia -- mismo generador de
  // cuadrícula que bulkCalendarWeeks, pero cada celda trae el día de gestiones (o null en
  // fines de semana/fuera del mes/días aún no alcanzados) en vez de un flag de disponibilidad.
  franchiseCalendarWeeks(franchise: any): { date: string; day: number; inMonth: boolean; data: any | null }[][] {
    const month = this.monthlyData?.month;
    if (!month) return [];
    const [year, mon] = month.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    const firstWeekday = (new Date(Date.UTC(year, mon - 1, 1)).getUTCDay() + 6) % 7;
    const dayMap = new Map((franchise?.days ?? []).map((day: any) => [day.date, day]));

    const cells: { date: string; day: number; inMonth: boolean; data: any | null }[] = [];
    for (let i = firstWeekday; i > 0; i -= 1) {
      const d = new Date(Date.UTC(year, mon - 1, 1 - i));
      cells.push({ date: this.isoDate(d), day: d.getUTCDate(), inMonth: false, data: null });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const d = new Date(Date.UTC(year, mon - 1, day));
      const iso = this.isoDate(d);
      cells.push({ date: iso, day, inMonth: true, data: dayMap.get(iso) ?? null });
    }
    while (cells.length % 7 !== 0) {
      const d = new Date(`${cells[cells.length - 1].date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      cells.push({ date: this.isoDate(d), day: d.getUTCDate(), inMonth: false, data: null });
    }

    const weeks: { date: string; day: number; inMonth: boolean; data: any | null }[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }

  calendarDayStatus(data: any): 'complete' | 'partial' | 'incomplete' | 'justified' {
    if (data.incident) return 'justified';
    if (data.pct >= 100) return 'complete';
    if (data.pct > 0) return 'partial';
    return 'incomplete';
  }

  calendarDayTitle(data: any): string {
    if (data.incident) return `Justificado — ${data.incident.note}`;
    return `${data.count}/${data.goal} clientes únicos · ${data.pct}%`;
  }

  // Cuadrícula del mes de monthlyData (único mes con datos disponibles para incidencias),
  // con los días fuera de rango de la semana rellenados para completar filas de 7 -- igual
  // que un calendario normal, pero sin navegación entre meses porque no hay datos que mostrar
  // fuera de este mes.
  get bulkCalendarWeeks(): { date: string; day: number; inMonth: boolean; available: boolean }[][] {
    const month = this.monthlyData?.month;
    if (!month) return [];
    const [year, mon] = month.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    const firstWeekday = (new Date(Date.UTC(year, mon - 1, 1)).getUTCDay() + 6) % 7; // 0 = lunes
    const available = new Set(this.bulkAvailableDates);

    const cells: { date: string; day: number; inMonth: boolean; available: boolean }[] = [];
    for (let i = firstWeekday; i > 0; i -= 1) {
      const d = new Date(Date.UTC(year, mon - 1, 1 - i));
      cells.push({ date: this.isoDate(d), day: d.getUTCDate(), inMonth: false, available: false });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const d = new Date(Date.UTC(year, mon - 1, day));
      const iso = this.isoDate(d);
      cells.push({ date: iso, day, inMonth: true, available: available.has(iso) });
    }
    while (cells.length % 7 !== 0) {
      const d = new Date(`${cells[cells.length - 1].date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      cells.push({ date: this.isoDate(d), day: d.getUTCDate(), inMonth: false, available: false });
    }

    const weeks: { date: string; day: number; inMonth: boolean; available: boolean }[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }

  get bulkCalendarLabel(): string {
    if (!this.monthlyData?.monthLabel) return '';
    const year = this.monthlyData.month?.slice(0, 4) ?? '';
    return `${this.monthlyData.monthLabel} ${year}`.toUpperCase();
  }

  openBulkIncidentModal(): void {
    this.bulkFranchiseIds = new Set((this.monthlyData?.franchises ?? []).map((franchise: any) => franchise.id));
    this.bulkSelectedDates = new Set();
    this.bulkDragPreviewEnd = '';
    this.bulkNote = '';
    this.bulkError = '';
    this.showBulkIncidentModal = true;
  }

  closeBulkIncidentModal(): void {
    this.showBulkIncidentModal = false;
  }

  toggleBulkFranchise(id: string): void {
    const next = new Set(this.bulkFranchiseIds);
    next.has(id) ? next.delete(id) : next.add(id);
    this.bulkFranchiseIds = next;
  }

  // Un solo clic (sin arrastre) alterna ese día suelto -- así se seleccionan días salteados.
  // Clic y arrastre a otro día rellena todo el rango entre ambos -- así se selecciona un rango.
  // Ambas interacciones comparten el mismo conjunto de días seleccionados.
  onCalendarPointerDown(cell: { date: string; available: boolean }, event: PointerEvent): void {
    if (!cell.available) return;
    // En touch, el navegador captura implícitamente el puntero en el elemento donde inició
    // el toque: pointerenter deja de disparar en las demás celdas al arrastrar el dedo (solo
    // pasa con mouse), así que el rango nunca se rellenaba en móvil. Liberar la captura hace
    // que el resto de la celdas vuelvan a recibir pointerenter igual que con el mouse.
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    this.bulkDragStart = cell.date;
    this.bulkDragMoved = false;
    this.bulkDragPreviewEnd = cell.date;
  }

  onCalendarPointerEnter(cell: { date: string; available: boolean }): void {
    if (!this.bulkDragStart || !cell.available) return;
    this.bulkDragMoved = true;
    this.bulkDragPreviewEnd = cell.date;
    this.refresh();
  }

  onCalendarPointerUp(cell: { date: string; available: boolean }): void {
    const start = this.bulkDragStart;
    this.bulkDragStart = null;
    this.bulkDragPreviewEnd = '';
    if (!start || !cell.available) { this.refresh(); return; }

    const next = new Set(this.bulkSelectedDates);
    if (this.bulkDragMoved && cell.date !== start) {
      const [from, to] = [start, cell.date].sort();
      for (const date of this.bulkAvailableDates) {
        if (date >= from && date <= to) next.add(date);
      }
    } else {
      next.has(start) ? next.delete(start) : next.add(start);
    }
    this.bulkSelectedDates = next;
    this.refresh();
  }

  @HostListener('document:pointerup')
  onDocumentPointerUp(): void {
    this.bulkDragStart = null;
    this.bulkDragPreviewEnd = '';
  }

  isInBulkDragPreview(date: string): boolean {
    if (!this.bulkDragStart || !this.bulkDragPreviewEnd) return false;
    const [from, to] = [this.bulkDragStart, this.bulkDragPreviewEnd].sort();
    return date >= from && date <= to;
  }

  bulkSelectionSummary(): string {
    const count = this.bulkSelectedDates.size;
    if (!count) return 'Ningún día seleccionado';
    const sorted = [...this.bulkSelectedDates].sort();
    const inRange = this.bulkAvailableDates.filter((date) => date >= sorted[0] && date <= sorted[sorted.length - 1]);
    const isContiguous = inRange.length === sorted.length && inRange.every((date, i) => date === sorted[i]);
    if (isContiguous && count > 1) return `${this.shortDate(sorted[0])} — ${this.shortDate(sorted[sorted.length - 1])}`;
    return `${count} día${count === 1 ? '' : 's'} seleccionado${count === 1 ? '' : 's'}`;
  }

  private isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  async confirmBulkIncident(): Promise<void> {
    if (this.bulkSaving) return;
    const note = this.bulkNote.trim();
    const dates = [...this.bulkSelectedDates];
    const franchiseIds = [...this.bulkFranchiseIds];
    if (!note) { this.bulkError = 'Describe la incidencia que justifica estos días.'; this.refresh(); return; }
    if (!dates.length) { this.bulkError = 'Selecciona al menos un día hábil.'; this.refresh(); return; }
    if (!franchiseIds.length) { this.bulkError = 'Selecciona al menos una franquicia.'; this.refresh(); return; }
    this.bulkSaving = true;
    this.bulkError = '';
    this.refresh();
    try {
      const results = await Promise.allSettled(
        franchiseIds.flatMap((franchiseId) => dates.map((date) => this.api.guardarIncidencia(franchiseId, date, note))),
      );
      const failed = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      this.monthlyData = await this.api.gestionesMes(this.monthlyData?.month ?? '');
      if (failed.length) {
        this.bulkError = `${failed.length} de ${results.length} registros no se pudieron guardar.`;
      } else {
        this.showBulkIncidentModal = false;
      }
    } catch (error: any) {
      this.bulkError = error.message;
    } finally {
      this.bulkSaving = false;
      this.refresh();
    }
  }

  async removeIncident(franchise: string, date: string): Promise<void> {
    try {
      await this.api.quitarIncidencia(franchise, date);
      this.monthlyData = await this.api.gestionesMes(this.monthlyData?.month ?? '');
    } catch (error: any) {
      this.monthlyError = error.message;
    } finally {
      this.refresh();
    }
  }

  async saveManagement(): Promise<void> {
    if (!this.detail || !this.gestionStatus || this.saving) return;
    this.saving = true;
    this.error = '';
    try {
      // Con "Llamar más tarde" el campo Comentario se oculta y solo se pide la Nota de
      // agenda -- esa misma nota alimenta el comentario del historial, para no pedir el
      // mismo contexto dos veces en dos campos que antes se guardaban por separado.
      const comentario = this.callLaterSelected ? this.agendaNote : this.gestionComment;
      const body: any = { estatusValue: this.gestionStatus, comentario };
      if (this.callLaterSelected) {
        body.agenda = { fechaISO: this.agendaDate, hora: this.agendaHour, nota: this.agendaNote };
      }
      await this.api.guardarGestion(this.detail.id, body);
      // A diferencia de agregar/quitar de Lista negra (que sí se quedan viendo la ficha ya
      // actualizada), guardar una gestión cierra la ficha -- loadAll() + el aviso al padre
      // refrescan Prioridad/Dashboard igual que refreshContext, solo que sin reabrir el detalle.
      await this.loadAll();
      this.refreshRequested.emit();
      this.closeDetailWithDropAnimation();
    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.saving = false;
      this.refresh();
    }
  }

  async saveNote(): Promise<void> {
    if (!this.detail || this.noteSaving) return;
    this.noteSaving = true;
    this.error = '';
    try {
      const updated = await this.api.guardarNota(this.detail.id, this.clientNotes);
      if (this.detail?.id === updated.id) this.detail = { ...this.detail, notas: updated.notas };
      this.clientNotes = updated.notas ?? '';
      this.noteEditing = false;
    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.noteSaving = false;
      this.refresh();
    }
  }

  cancelNoteEdit(): void {
    this.clientNotes = this.detail?.notas ?? '';
    this.noteEditing = false;
  }

  deleteNote(): void {
    if (!this.detail || this.noteSaving) return;
    this.askConfirm('¿Borrar esta nota?', async () => {
      this.clientNotes = '';
      await this.saveNote();
    });
  }

  // Diálogo de confirmación propio (mismo patrón .dialog-card que el resto de la app) en vez
  // de window.confirm -- se usa para cualquier acción destructiva de esta ficha.
  confirmDialog: { message: string; onConfirm: () => void | Promise<void> } | null = null;

  private askConfirm(message: string, onConfirm: () => void | Promise<void>): void {
    this.confirmDialog = { message, onConfirm };
  }

  async confirmDialogAccept(): Promise<void> {
    const action = this.confirmDialog?.onConfirm;
    this.confirmDialog = null;
    await action?.();
  }

  confirmDialogCancel(): void {
    this.confirmDialog = null;
  }

  // 3 visibles de entrada; "Ver más" pasa a 15; si aún hay más, un segundo "Ver más" muestra
  // todas -- evita cargar de golpe un historial largo cuando solo interesan los últimos eventos.
  timelineVisibleCount(): number {
    if (this.timelineTier === 'min') return 3;
    if (this.timelineTier === 'mid') return 15;
    return this.detail?.timeline?.length ?? 0;
  }

  expandTimeline(): void {
    this.timelineTier = this.timelineTier === 'min' ? 'mid' : 'all';
  }

  collapseTimeline(): void {
    this.timelineTier = 'min';
  }

  // Colorea sutilmente cada opción del estatus con el mismo color asignado en Configuración
  // (status.bg), a baja opacidad -- referencia visual rápida sin la saturación plena del
  // artifact original.
  statusOptionBg(status: any): string {
    const hex = String(status?.bg ?? '').trim();
    return hex ? `color-mix(in srgb, ${hex} 18%, var(--input))` : '';
  }

  // Select de Estatus construido a mano (no <select> nativo): en móvil, sobre todo iOS, el
  // navegador reemplaza el <select> por su propio picker del sistema e ignora por completo
  // cualquier estilo puesto en <option> -- el color nunca llegaba a verse ahí. Con un botón +
  // lista propia el color se controla igual en cualquier plataforma.
  selectedStatusOption(): any {
    return this.statusCatalog.find((status) => status.value === this.gestionStatus) ?? null;
  }

  toggleStatusMenu(): void {
    this.statusMenuOpen = !this.statusMenuOpen;
  }

  selectStatus(value: string): void {
    this.gestionStatus = value;
    this.statusMenuOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClickForStatusMenu(event: MouseEvent): void {
    if (!this.statusMenuOpen) return;
    if (!(event.target as HTMLElement).closest('.status-select')) this.statusMenuOpen = false;
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
      this.refresh();
    }
  }

  removeBlacklist(): void {
    if (!this.detail) return;
    const id = this.detail.id;
    const name = this.detail.name;
    this.askConfirm(`¿Quitar a ${name} de Lista negra?`, async () => {
      this.saving = true;
      try {
        await this.api.quitarBlacklist(id);
        await this.refreshContext(id);
      } catch (error: any) {
        this.error = error.message;
      } finally {
        this.saving = false;
        this.refresh();
      }
    });
  }

  money(value: unknown): string {
    return formatMoney(value);
  }

  // Solo para "Ver facturas": ahí sí importa el monto real, no el redondeado a entero que
  // se usa en el resto de la ficha.
  moneyExact(value: unknown): string {
    return formatMoneyExact(value);
  }

  tramoLabel(tramo: string): string {
    return formatTramoLabel(tramo);
  }

  shortDate(value: string): string {
    return formatShortDate(value);
  }

  compactDaily(day: any): string {
    const counts = day?.counts ?? {};
    return `AGS: ${counts.aguascalientes ?? 0} - CUN: ${counts.cancun ?? 0} - MID: ${counts.merida ?? 0}`;
  }

  openInvoicesModal(): void {
    this.showInvoicesModal = true;
  }

  closeInvoicesModal(): void {
    this.showInvoicesModal = false;
  }

  toggleInvoiceSelection(id: number): void {
    const next = new Set(this.selectedInvoiceIds);
    next.has(id) ? next.delete(id) : next.add(id);
    this.selectedInvoiceIds = next;
  }

  allInvoicesSelected(): boolean {
    const invoices = this.detail?.invoices ?? [];
    return invoices.length > 0 && invoices.every((invoice: any) => this.selectedInvoiceIds.has(invoice.id));
  }

  toggleSelectAllInvoices(): void {
    const invoices = this.detail?.invoices ?? [];
    this.selectedInvoiceIds = this.allInvoicesSelected() ? new Set() : new Set(invoices.map((invoice: any) => invoice.id));
  }

  selectedInvoicesTotal(): number {
    const invoices = this.detail?.invoices ?? [];
    return invoices
      .filter((invoice: any) => this.selectedInvoiceIds.has(invoice.id))
      .reduce((sum: number, invoice: any) => sum + Number(invoice.monto ?? 0), 0);
  }

  // --- Generar documento -----------------------------------------------------------------
  // "Generar documento" y "Lista negra" abren su propio panel bajo los botones; solo uno a
  // la vez para no apilar dos paneles en la ficha.
  toggleDocumentMenu(): void {
    this.documentMenuOpen = !this.documentMenuOpen;
    if (this.documentMenuOpen) this.blacklistPanelOpen = false;
  }

  toggleBlacklistPanel(): void {
    this.blacklistPanelOpen = !this.blacklistPanelOpen;
    if (this.blacklistPanelOpen) this.documentMenuOpen = false;
  }

  openDocumentForm(tipo: DocumentType): void {
    if (!this.detail) return;
    const type = DOCUMENT_TYPES.find((option) => option.value === tipo)!;
    const invoices: any[] = this.detail.invoices ?? [];
    // El aviso de deuda parte de las facturas vencidas (todas si ninguna lo está); retiro y
    // acuerdo parten del adeudo completo. En los tres casos se puede ajustar la selección.
    const overdue = invoices.filter((invoice) => Number(invoice.dias_vencida) > 0);
    const initial = tipo === 'aviso_deuda' && overdue.length ? overdue : invoices;
    this.documentForm = {
      tipo,
      label: type.label,
      fechaISO: this.todayMexico(),
      nombre: this.detail.name ?? '',
      direccion: '',
      facturaIds: new Set(initial.map((invoice) => invoice.id)),
      incluirNota: false,
      notaAdicional: NOTA_MANTENIMIENTO,
      retiroFechaISO: '',
      equipos: '',
      esBorrador: true,
      parcialidades: [],
      condiciones: '',
    };
    if (tipo === 'acuerdo_pagos') this.addParcialidad();
    this.documentMenuOpen = false;
    this.documentError = '';
    this.documentResult = null;
  }

  closeDocumentForm(): void {
    this.documentForm = null;
    this.documentGenerating = false;
    this.documentError = '';
    this.documentResult = null;
  }

  documentInvoices(): any[] {
    return this.detail?.invoices ?? [];
  }

  toggleDocumentInvoice(id: number): void {
    const form = this.documentForm;
    if (!form) return;
    const next = new Set(form.facturaIds);
    next.has(id) ? next.delete(id) : next.add(id);
    form.facturaIds = next;
    this.distributeParcialidades();
  }

  allDocumentInvoicesSelected(): boolean {
    const invoices = this.documentInvoices();
    return invoices.length > 0 && invoices.every((invoice) => this.documentForm?.facturaIds.has(invoice.id));
  }

  toggleAllDocumentInvoices(): void {
    const form = this.documentForm;
    if (!form) return;
    const all = this.allDocumentInvoicesSelected();
    form.facturaIds = all ? new Set() : new Set(this.documentInvoices().map((invoice) => invoice.id));
    this.distributeParcialidades();
  }

  documentTotal(): number {
    const form = this.documentForm;
    if (!form) return 0;
    return this.roundCents(this.documentInvoices()
      .filter((invoice) => form.facturaIds.has(invoice.id))
      .reduce((sum, invoice) => sum + Number(invoice.monto ?? 0), 0));
  }

  documentSelectedInvoices(): any[] {
    return this.documentInvoices().filter((invoice) => this.documentForm?.facturaIds.has(invoice.id));
  }

  paperLabel(tipo: DocumentType): string {
    return DOCUMENT_TYPES.find((option) => option.value === tipo)?.paper === 'carta' ? 'tamaño carta' : 'tamaño oficio';
  }

  // Importe de cada parcialidad = suma de las facturas que cubre (se calcula solo).
  parcialidadImporte(parcialidad: Parcialidad): number {
    return this.roundCents(this.documentInvoices()
      .filter((invoice) => parcialidad.facturaIds.has(invoice.id))
      .reduce((sum, invoice) => sum + Number(invoice.monto ?? 0), 0));
  }

  canAddParcialidad(): boolean {
    const form = this.documentForm;
    return Boolean(form) && form!.parcialidades.length < form!.facturaIds.size;
  }

  // Cada parcialidad nueva va dos semanas después de la anterior (la primera, a una semana) y
  // las facturas se vuelven a repartir entre todas las filas.
  addParcialidad(): void {
    const form = this.documentForm;
    if (!form || (form.parcialidades.length && !this.canAddParcialidad())) return;
    const last = form.parcialidades[form.parcialidades.length - 1];
    form.parcialidades = [...form.parcialidades, {
      fechaISO: this.addDays(last?.fechaISO || this.todayMexico(), last ? 14 : 7),
      facturaIds: new Set(),
    }];
    this.distributeParcialidades();
  }

  removeParcialidad(index: number): void {
    const form = this.documentForm;
    if (!form || form.parcialidades.length <= 1) return;
    form.parcialidades = form.parcialidades.filter((_, position) => position !== index);
    this.distributeParcialidades();
  }

  // Mueve una factura a esta parcialidad (cada factura pertenece a una sola fila, así las
  // parcialidades siempre suman el monto del documento).
  toggleParcialidadInvoice(parcialidad: Parcialidad, id: number): void {
    const form = this.documentForm;
    if (!form || parcialidad.facturaIds.has(id)) return;
    form.parcialidades.forEach((row) => {
      if (row.facturaIds.has(id)) row.facturaIds = new Set([...row.facturaIds].filter((invoiceId) => invoiceId !== id));
    });
    parcialidad.facturaIds = new Set([...parcialidad.facturaIds, id]);
  }

  // Reparte las facturas seleccionadas, de la más antigua a la más reciente, en bloques
  // consecutivos del mismo tamaño; si no alcanza parejo, las primeras parcialidades llevan
  // una factura más y la última lleva menos.
  private distributeParcialidades(): void {
    const form = this.documentForm;
    if (!form || !form.parcialidades.length) return;
    const invoices = this.documentSelectedInvoices().sort((a, b) =>
      String(a.fecha_facturacion ?? '').localeCompare(String(b.fecha_facturacion ?? ''))
      || String(a.folio).localeCompare(String(b.folio)));
    const rows = form.parcialidades.length;
    const base = Math.floor(invoices.length / rows);
    const extra = invoices.length % rows;
    let cursor = 0;
    form.parcialidades.forEach((parcialidad, index) => {
      const size = base + (index < extra ? 1 : 0);
      parcialidad.facturaIds = new Set(invoices.slice(cursor, cursor + size).map((invoice) => invoice.id));
      cursor += size;
    });
  }

  documentFormIssue(): string {
    const form = this.documentForm;
    if (!form) return '';
    if (!form.facturaIds.size) return 'Selecciona al menos una factura.';
    if (!form.nombre.trim()) return 'Escribe a quién va dirigido el documento.';
    if (!form.fechaISO) return 'Indica la fecha del documento.';
    if (form.tipo === 'acuerdo_pagos') {
      if (!form.parcialidades.length) return 'Agrega al menos una parcialidad.';
      const index = form.parcialidades.findIndex((parcialidad) =>
        !parcialidad.fechaISO || !parcialidad.facturaIds.size);
      if (index >= 0) return `Completa la parcialidad ${index + 1}: fecha y al menos una factura.`;
    }
    return '';
  }

  async generateDocument(): Promise<void> {
    const form = this.documentForm;
    if (!this.detail || !form || this.documentGenerating || this.documentFormIssue()) return;
    this.documentGenerating = true;
    this.documentError = '';
    this.documentResult = null;
    this.refresh();
    try {
      const body: any = {
        facturaIds: [...form.facturaIds],
        fechaISO: form.fechaISO,
        destinatario: { nombre: form.nombre, direccion: form.direccion },
      };
      if (form.tipo === 'aviso_deuda' && form.incluirNota) body.notaAdicional = form.notaAdicional;
      if (form.tipo === 'aviso_retiro') {
        body.retiro = { fechaISO: form.retiroFechaISO || null, equipos: form.equipos };
      }
      if (form.tipo === 'acuerdo_pagos') {
        body.acuerdo = {
          esBorrador: form.esBorrador,
          parcialidades: form.parcialidades.map((parcialidad) => ({
            fechaISO: parcialidad.fechaISO,
            importe: this.parcialidadImporte(parcialidad),
            facturaIds: [...parcialidad.facturaIds],
          })),
          condiciones: form.condiciones.split('\n').map((line) => line.trim()).filter(Boolean),
        };
      }
      const result = await this.api.generarDocumento(this.detail.id, form.tipo, body);
      this.downloadBlob(result.blob, result.fileName);
      if (this.documentForm === form) this.documentResult = { fileName: result.fileName, warnings: result.warnings };
    } catch (error: any) {
      if (this.documentForm === form) this.documentError = error.message;
    } finally {
      this.documentGenerating = false;
      this.refresh();
    }
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  private roundCents(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private addDays(iso: string, days: number): string {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
  }

  // Máximo dias_vencida entre las facturas del cliente -- no existe un campo de "días de
  // atraso" a nivel cliente, se deriva de las facturas ya cargadas en el detalle.
  maxDiasVencida(): number {
    const invoices = this.detail?.invoices ?? [];
    return invoices.reduce((max: number, invoice: any) => Math.max(max, Number(invoice.dias_vencida ?? 0)), 0);
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
