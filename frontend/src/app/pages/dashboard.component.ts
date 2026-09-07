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

  constructor(private readonly sanitizer: DomSanitizer) {}

  ngOnChanges(): void {
    if (!this.data) return;
    this.renderCharts();
  }

  toggleCurrent(): void {
    this.includeCurrent = !this.includeCurrent;
    this.renderCharts();
  }

  setRecoveryPeriod(period: 'semana' | 'mes'): void {
    this.recoveryPeriod = period;
  }

  recoveryData(): any {
    return this.recoveryPeriod === 'mes'
      ? this.data?.recuperadoMensual ?? { total: 0, count: 0, rows: [] }
      : this.data?.recuperadoSemanal ?? { total: 0, count: 0, rows: [] };
  }

  recoveredRows(): any[] {
    return (this.recoveryData().rows ?? []).slice(0, 10);
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
