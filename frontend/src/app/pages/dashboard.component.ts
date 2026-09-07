import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
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

  donut: any = {};
  funnel: any = {};
  distribution: any = {};
  segmentation: any = {};
  recoveryChart = '';
  overdueChart = '';

  ngOnChanges(): void {
    if (!this.data) return;
    this.donut = renderDonut(this.data.saldos ?? [], { incluirCorriente: true });
    this.funnel = renderFunnel(this.data.funnel ?? {}, this.data.expectativaCobro ?? 0);
    this.distribution = renderDistribucion(this.data.distribucion ?? []);
    this.segmentation = renderSegmentacion(this.data.segmentacion ?? []);
    this.recoveryChart = buildLineChartRecuperado(this.data.historico ?? []);
    this.overdueChart = buildLineChartVencida(this.data.historicoVencida ?? []);
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
}
