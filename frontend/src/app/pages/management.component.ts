import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
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
  gestionComment = '';
  agendaDate = '';
  agendaHour = '12:00';
  agendaNote = '';
  blacklistReason = '';
  blacklistPanelOpen = false;
  saving = false;
  noteSaving = false;
  clientNotes = '';
  showAllTimeline = false;
  showInvoicesModal = false;
  selectedInvoiceIds = new Set<number>();
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
      this.gestionStatus = this.detail.estatus_value || this.statusCatalog[0]?.value || '';
      this.gestionComment = '';
      this.blacklistReason = '';
      this.agendaDate = this.dateOnly(this.detail.agenda_fecha_iso) || this.todayMexico();
      this.agendaHour = this.hours.includes(this.detail.agenda_hora) ? this.detail.agenda_hora : this.suggestedHour();
      this.agendaNote = this.detail.agenda_nota ?? '';
      this.clientNotes = this.detail.notas ?? '';
      this.showAllTimeline = false;
      this.blacklistPanelOpen = false;
      this.showInvoicesModal = false;
      this.selectedInvoiceIds = new Set();
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
    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.noteSaving = false;
      this.refresh();
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
      this.refresh();
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
      this.refresh();
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

  // Máximo dias_vencida entre las facturas del cliente -- no existe un campo de "días de
  // atraso" a nivel cliente, se deriva de las facturas ya cargadas en el detalle.
  maxDiasVencida(): number {
    const invoices = this.detail?.invoices ?? [];
    return invoices.reduce((max: number, invoice: any) => Math.max(max, Number(invoice.dias_vencida ?? 0)), 0);
  }

  salesExecutives(): string {
    return [...new Set((this.detail?.invoices ?? []).map((invoice: any) => invoice.ejecutivo_ventas).filter(Boolean))].join(', ');
  }

  collectionExecutives(): string {
    return [...new Set((this.detail?.invoices ?? []).map((invoice: any) => invoice.ejecutivo_cobranza).filter(Boolean))].join(', ');
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
