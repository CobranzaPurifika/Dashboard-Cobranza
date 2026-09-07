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

  donut: { svg?: SafeHtml; legend?: SafeHtml } = {};
  funnel: { bars?: SafeHtml; rates?: SafeHtml } = {};
  distribution: { rows?: SafeHtml; sub?: string } = {};
  segmentation: { bar?: SafeHtml; legend?: SafeHtml } = {};
  recoveryChart?: SafeHtml;
  overdueChart?: SafeHtml;

  constructor(private readonly sanitizer: DomSanitizer) {}

  ngOnChanges(): void {
    if (!this.data) return;
    const donut = renderDonut(this.data.saldos ?? [], { incluirCorriente: true });
    const funnel = renderFunnel(this.data.funnel ?? {}, this.data.expectativaCobro ?? 0);
    const distribution = renderDistribucion(this.data.distribucion ?? []);
    const segmentation = renderSegmentacion(this.data.segmentacion ?? []);

    // Estos fragmentos se generan localmente y los valores variables son escapados en charts.ts.
    // Angular elimina SVG y estilos inline de un innerHTML normal; por eso se confían aquí,
    // después de construirlos, para que el navegador reciba la gráfica y no su texto interno.
    this.donut = { svg: this.safe(donut.svg), legend: this.safe(donut.legend) };
    this.funnel = { bars: this.safe(funnel.bars), rates: this.safe(funnel.rates) };
    this.distribution = { rows: this.safe(distribution.rows), sub: distribution.sub };
    this.segmentation = { bar: this.safe(segmentation.bar), legend: this.safe(segmentation.legend) };
    this.recoveryChart = this.safe(buildLineChartRecuperado(this.data.historico ?? []));
    this.overdueChart = this.safe(buildLineChartVencida(this.data.historicoVencida ?? []));
  }

  money(value: unknown): string {
    return `$${Number(value ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
  }

  countLabel(count: number): string {
    return `${Number(count ?? 0).toLocaleString('es-MX')} ${Number(count) === 1 ? 'cliente' : 'clientes'}`;
  }

  recoveredRows(): any[] {
    return (this.data?.recuperadoSemanal?.rows ?? []).slice(0, 5);
  }

  private safe(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
