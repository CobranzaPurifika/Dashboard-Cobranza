import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, Output } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { IonIcon } from '@ionic/angular';
import { ApiService } from '../core/api.service';
import {
  buildLineChartRecuperado,
  buildLineChartVencida,
  renderDonut,
  renderFunnel,
} from '../core/charts';

interface FranchiseOption { id: string; label: string }

// Reemplaza el togglePresentation() anterior (solo ocultaba la topbar y mostraba el Dashboard
// normal). Puerto del "Modo Presentación" del Artifact original: pantalla completa, sin scroll,
// que rota automáticamente entre las franquicias del usuario cada DURATION_MS, reutilizando las
// mismas gráficas de charts.ts (donut/funnel/líneas) que ya usa DashboardComponent -- solo cambia
// el layout a una parrilla compacta pensada para TV/sala, con controles de pausa y navegación
// por puntos, igual que el mockup aprobado ("pres-screen", "pres-grid", "pres-dots" del Artifact).
const TICK_MS = 100;

@Component({
  selector: 'app-presentation',
  standalone: true,
  imports: [CommonModule, IonIcon],
  templateUrl: './presentation.component.html',
  styleUrl: './presentation.component.scss',
})
export class PresentationComponent implements OnChanges, OnDestroy {
  @Input() franchises: FranchiseOption[] = [];
  @Input() durationSeconds = 18;
  @Input() autoStart = true;
  @Input() hideControls = false;
  @Output() exit = new EventEmitter<void>();

  activeIndex = 0;
  loading = false;
  paused = false;
  progressPct = 0;
  data: any = null;
  error = '';

  donut: { svg?: SafeHtml; legend?: SafeHtml } = {};
  funnel: { bars?: SafeHtml; rates?: SafeHtml; promise?: SafeHtml } = {};
  recoveryChart?: SafeHtml;
  overdueChart?: SafeHtml;

  private timer: ReturnType<typeof setInterval> | null = null;
  private request = 0;

  constructor(
    private readonly api: ApiService,
    private readonly sanitizer: DomSanitizer,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  // Same change-detection workaround as ManagementComponent (see its comment and
  // frontend/src/main.ts): this component drives its own state from an internal
  // setInterval, not from @Input changes, so it needs its own detectChanges() calls.
  private refresh(): void {
    this.cdr.detectChanges();
  }

  ngOnChanges(): void {
    if (!this.franchises.length) return;
    if (this.activeIndex >= this.franchises.length) this.activeIndex = 0;
    if (!this.data) {
      this.paused = !this.autoStart;
      void this.loadActive();
      this.start();
    }
  }

  ngOnDestroy(): void {
    this.stop();
  }

  get active(): FranchiseOption | undefined {
    return this.franchises[this.activeIndex];
  }

  start(): void {
    this.stop();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.refresh();
  }

  selectFranchise(index: number): void {
    if (index === this.activeIndex) return;
    this.activeIndex = index;
    this.progressPct = 0;
    void this.loadActive();
  }

  exitPresentation(): void {
    this.stop();
    this.exit.emit();
  }

  private tick(): void {
    if (this.paused || this.franchises.length <= 1) return;
    this.progressPct += (TICK_MS / (this.durationSeconds * 1000)) * 100;
    if (this.progressPct >= 100) {
      this.progressPct = 0;
      this.activeIndex = (this.activeIndex + 1) % this.franchises.length;
      void this.loadActive();
    }
    this.refresh();
  }

  private async loadActive(): Promise<void> {
    const franchise = this.active;
    if (!franchise) return;
    const requestId = ++this.request;
    this.loading = true;
    this.error = '';
    try {
      const data = await this.api.dashboard(franchise.id);
      if (requestId !== this.request) return;
      this.data = data;
      this.renderCharts();
    } catch (err: any) {
      if (requestId === this.request) this.error = err.message ?? 'No fue posible cargar la franquicia';
    } finally {
      if (requestId === this.request) {
        this.loading = false;
        this.refresh();
      }
    }
  }

  private renderCharts(): void {
    const donut = renderDonut(this.data.saldos ?? [], { incluirCorriente: true });
    const funnel = renderFunnel(this.data.funnel ?? {}, this.data.expectativaCobro ?? 0);
    this.donut = { svg: this.safe(donut.svg), legend: this.safe(donut.legend) };
    this.funnel = { bars: this.safe(funnel.bars), rates: this.safe(funnel.rates), promise: this.safe(funnel.promise) };
    this.recoveryChart = this.safe(buildLineChartRecuperado(this.data.historico ?? []));
    this.overdueChart = this.safe(buildLineChartVencida(this.data.historicoVencida ?? []));
  }

  money(value: unknown): string {
    return `$${Number(value ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
  }

  countLabel(count: number): string {
    return `${Number(count ?? 0).toLocaleString('es-MX')} ${Number(count) === 1 ? 'pago' : 'pagos'}`;
  }

  private safe(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
