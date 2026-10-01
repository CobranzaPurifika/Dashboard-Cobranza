import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { IonIcon } from '@ionic/angular';
import {
  buildLineChartRecuperado,
  buildLineChartVencida,
  renderDistribucion,
  renderDonut,
  renderFunnel,
  TRAMO_COLOR,
} from '../core/charts';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, IonIcon],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnChanges {
  @Input() data: any;
  @Input() loading = false;
  @Input() isAnonymous = false;

  includeCurrent = true;
  recoveryPeriod: 'semana' | 'mes' = 'semana';
  recoverySort: { key: 'nombre' | 'monto' | 'fecha'; dir: 'asc' | 'desc' } = { key: 'monto', dir: 'desc' };
  readonly periods: ('Semana' | 'Mes')[] = ['Semana', 'Mes'];
  donut: { svg?: SafeHtml; legend?: SafeHtml } = {};
  funnel: { bars?: SafeHtml; rates?: SafeHtml; promise?: SafeHtml } = {};
  distribution: { rows?: SafeHtml; sub?: string } = {};
  recoveryChart?: SafeHtml;
  overdueChart?: SafeHtml;
  expandedRecoveryClients = new Set<string>();
  expandedSegments = new Set<string>();

  constructor(private readonly sanitizer: DomSanitizer) {}

  ngOnChanges(): void {
    if (!this.data) return;
    if (this.data.historical) this.recoveryPeriod = 'mes';
    this.expandedRecoveryClients = new Set();
    this.expandedSegments = new Set();
    this.renderCharts();
  }

  toggleCurrent(): void {
    this.includeCurrent = !this.includeCurrent;
    this.renderCharts();
  }

  setRecoveryPeriod(period: 'semana' | 'mes'): void {
    this.recoveryPeriod = period;
    this.expandedRecoveryClients = new Set();
  }

  setRecoverySort(key: 'nombre' | 'monto' | 'fecha'): void {
    const defaults = { nombre: 'asc', monto: 'desc', fecha: 'desc' } as const;
    this.recoverySort = this.recoverySort.key === key
      ? { key, dir: this.recoverySort.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: defaults[key] };
  }

  recoverySortDirection(key: 'nombre' | 'monto' | 'fecha'): 'asc' | 'desc' {
    if (this.recoverySort.key === key) return this.recoverySort.dir;
    return key === 'nombre' ? 'asc' : 'desc';
  }

  recoverySortLabel(key: 'nombre' | 'monto' | 'fecha'): string {
    const dir = this.recoverySortDirection(key);
    const order = key === 'nombre'
      ? (dir === 'asc' ? 'A → Z' : 'Z → A')
      : key === 'monto'
        ? (dir === 'asc' ? 'menor a mayor' : 'mayor a menor')
        : (dir === 'asc' ? 'más antigua primero' : 'más reciente primero');
    const label = `Ordenar por ${key} (${order})`;
    return this.recoverySort.key === key ? `${label}, clic para invertir` : label;
  }

  recoveryData(): any {
    return this.recoveryPeriod === 'mes'
      ? this.data?.recuperadoMensual ?? { total: 0, count: 0, rows: [] }
      : this.data?.recuperadoSemanal ?? { total: 0, count: 0, rows: [] };
  }

  // El artefacto original mostraba, por cliente, qué facturas se pagaron y por cuánto --
  // aquí se agrupan los pagos individuales (planos por fecha) en una fila por cliente con
  // el detalle expandible, en vez de una lista plana de pagos. Para el Lector se recortan
  // los 3 con mayor monto recuperado (mensual y semanal); con sesión se ve la lista completa,
  // igual que antes. El total/contador de arriba siempre es el real, sin recortar.
  recoveredClients(): { key: string; name: string; franchiseId: string; total: number; payments: any[] }[] {
    const groups = new Map<string, { key: string; name: string; franchiseId: string; total: number; payments: any[] }>();
    for (const payment of this.recoveryData().rows ?? []) {
      const key = payment.cliente_id || `${payment.franchise_id}|${String(payment.name ?? '').toLowerCase()}`;
      const group = groups.get(key) ?? {
        key, name: payment.name || 'Cliente', franchiseId: payment.franchise_id, total: 0, payments: [],
      };
      group.total += Number(payment.monto ?? 0);
      group.payments.push(payment);
      groups.set(key, group);
    }
    const nameAscending = (a: { name: string }, b: { name: string }) =>
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    const tieBreak = (a: { name: string; total: number }, b: { name: string; total: number }) =>
      b.total - a.total || nameAscending(a, b);
    const byAmount = [...groups.values()].sort((a, b) => b.total - a.total || nameAscending(a, b));
    const visible = this.isAnonymous ? byAmount.slice(0, 3) : byAmount;

    for (const client of visible) {
      client.payments = [...client.payments].sort((a, b) =>
        this.recoverySort.key === 'fecha' && this.recoverySort.dir === 'asc'
          ? this.paymentTime(a) - this.paymentTime(b)
          : this.paymentTime(b) - this.paymentTime(a)
      );
    }

    const recentPaymentTime = (client: { payments: any[] }) =>
      Math.max(...client.payments.map((payment) => this.paymentTime(payment)));
    const direction = this.recoverySort.dir === 'asc' ? 1 : -1;
    return [...visible].sort((a, b) => {
      let primary = 0;
      if (this.recoverySort.key === 'nombre') primary = nameAscending(a, b);
      if (this.recoverySort.key === 'monto') primary = a.total - b.total;
      if (this.recoverySort.key === 'fecha') primary = recentPaymentTime(a) - recentPaymentTime(b);
      return primary * direction || tieBreak(a, b);
    });
  }

  isRecoveryClientExpanded(key: string): boolean {
    return this.expandedRecoveryClients.has(key);
  }

  toggleRecoveryClient(key: string): void {
    const next = new Set(this.expandedRecoveryClients);
    next.has(key) ? next.delete(key) : next.add(key);
    this.expandedRecoveryClients = next;
  }

  isSegmentExpanded(segment: string): boolean {
    return this.expandedSegments.has(segment);
  }

  toggleSegment(segment: string): void {
    const next = new Set(this.expandedSegments);
    next.has(segment) ? next.delete(segment) : next.add(segment);
    this.expandedSegments = next;
  }

  segmentRows(): any[] {
    const rows = this.data?.segmentacion ?? [];
    const total = rows.reduce((sum: number, row: any) => sum + Number(row.monto ?? 0), 0);
    return rows.map((row: any) => {
      const monto = Number(row.monto ?? 0);
      return {
        ...row,
        monto,
        pct: total ? ((monto / total) * 100).toFixed(1) : '0.0',
        tramos: (row.tramos ?? []).map((tramo: any) => ({
          ...tramo,
          monto: Number(tramo.monto ?? 0),
          pct: monto ? ((Number(tramo.monto ?? 0) / monto) * 100).toFixed(1) : '0.0',
          color: TRAMO_COLOR[tramo.tramo],
        })),
      };
    });
  }

  segmentTotal(): number {
    return (this.data?.segmentacion ?? [])
      .reduce((sum: number, row: any) => sum + Number(row.monto ?? 0), 0);
  }

  segmentBarLabel(): string {
    return this.segmentRows()
      .map((row: any) => `${row.label} ${row.pct}%`)
      .join(' · ');
  }

  private paymentTime(payment: any): number {
    return new Date(payment?.fecha_iso ?? 0).getTime();
  }

  deltaLabel(metric: any, period: 'Semana' | 'Mes'): string {
    const value = Number(metric?.[`delta${period}`]);
    return `${value > 0 ? '+' : ''}${value.toFixed(1)} pp`;
  }

  hasDelta(metric: any, period: 'Semana' | 'Mes'): boolean {
    const value = metric?.[`delta${period}`];
    return value !== null && value !== undefined && Number.isFinite(Number(value));
  }

  deltaGood(metric: any, period: 'Semana' | 'Mes'): boolean {
    return !!metric?.[`delta${period}Good`];
  }

  private renderCharts(): void {
    const donut = renderDonut(this.data.saldos ?? [], { incluirCorriente: this.includeCurrent });
    const funnel = renderFunnel(this.data.funnel ?? {}, this.data.expectativaCobro ?? 0);
    const distribution = renderDistribucion(this.data.distribucion ?? []);

    // Estos fragmentos se generan localmente y los valores variables son escapados en charts.ts.
    // Angular elimina SVG y estilos inline de un innerHTML normal; por eso se confían aquí,
    // después de construirlos, para que el navegador reciba la gráfica y no su texto interno.
    this.donut = { svg: this.safe(donut.svg), legend: this.safe(donut.legend) };
    this.funnel = {
      bars: this.safe(funnel.bars),
      rates: this.safe(funnel.rates),
      promise: this.safe(funnel.promise),
    };
    this.distribution = { rows: this.safe(distribution.rows), sub: distribution.sub };
    this.recoveryChart = this.safe(buildLineChartRecuperado(this.data.historico ?? []));
    this.overdueChart = this.safe(buildLineChartVencida(this.data.historicoVencida ?? []));
  }

  money(value: unknown): string {
    return `$${Number(value ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
  }

  countLabel(count: number): string {
    return `${Number(count ?? 0).toLocaleString('es-MX')} ${Number(count) === 1 ? 'cliente' : 'clientes'}`;
  }

  historicalLabel(): string {
    if (!this.data?.historical) return '';
    const date = new Date(`${this.data.historical.month}-01T12:00:00Z`);
    return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
  }

  private safe(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
