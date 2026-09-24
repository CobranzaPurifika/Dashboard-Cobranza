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
  renderSegmentacion,
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

  includeCurrent = true;
  recoveryPeriod: 'semana' | 'mes' = 'semana';
  donut: { svg?: SafeHtml; legend?: SafeHtml } = {};
  funnel: { bars?: SafeHtml; rates?: SafeHtml; promise?: SafeHtml } = {};
  distribution: { rows?: SafeHtml; sub?: string } = {};
  segmentation: { svg?: SafeHtml; legend?: SafeHtml } = {};
  recoveryChart?: SafeHtml;
  overdueChart?: SafeHtml;
  expandedRecoveryClients = new Set<string>();

  constructor(private readonly sanitizer: DomSanitizer) {}

  ngOnChanges(): void {
    if (!this.data) return;
    this.expandedRecoveryClients = new Set();
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

  recoveryData(): any {
    return this.recoveryPeriod === 'mes'
      ? this.data?.recuperadoMensual ?? { total: 0, count: 0, rows: [] }
      : this.data?.recuperadoSemanal ?? { total: 0, count: 0, rows: [] };
  }

  // El artefacto original mostraba, por cliente, qué facturas se pagaron y por cuánto --
  // aquí se agrupan los pagos individuales (planos por fecha) en una fila por cliente con
  // el detalle expandible, en vez de una lista plana de pagos.
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
    return [...groups.values()].sort((a, b) => b.total - a.total);
  }

  isRecoveryClientExpanded(key: string): boolean {
    return this.expandedRecoveryClients.has(key);
  }

  toggleRecoveryClient(key: string): void {
    const next = new Set(this.expandedRecoveryClients);
    next.has(key) ? next.delete(key) : next.add(key);
    this.expandedRecoveryClients = next;
  }

  deltaLabel(metric: any): string {
    const value = Number(metric?.delta);
    return `${value > 0 ? '+' : ''}${value.toFixed(1)} pp`;
  }

  hasDelta(metric: any): boolean {
    return metric?.delta !== null && metric?.delta !== undefined && Number.isFinite(Number(metric.delta));
  }

  private renderCharts(): void {
    const donut = renderDonut(this.data.saldos ?? [], { incluirCorriente: this.includeCurrent });
    const funnel = renderFunnel(this.data.funnel ?? {}, this.data.expectativaCobro ?? 0);
    const distribution = renderDistribucion(this.data.distribucion ?? []);
    const segmentation = renderSegmentacion(this.data.segmentacion ?? []);

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
    this.segmentation = { svg: this.safe(segmentation.svg), legend: this.safe(segmentation.legend) };
    this.recoveryChart = this.safe(buildLineChartRecuperado(this.data.historico ?? []));
    this.overdueChart = this.safe(buildLineChartVencida(this.data.historicoVencida ?? []));
  }

  money(value: unknown): string {
    return `$${Number(value ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
  }

  countLabel(count: number): string {
    return `${Number(count ?? 0).toLocaleString('es-MX')} ${Number(count) === 1 ? 'cliente' : 'clientes'}`;
  }

  private safe(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
