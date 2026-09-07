import { describe, expect, it } from 'vitest';
import { renderCoverage, renderDonut, renderFunnel, renderSegmentacion } from './charts';

describe('gráficas de cartera', () => {
  it('representa los cuatro tramos sin alterar los montos', () => {
    const result = renderDonut([
      { tramo: 'good', label: 'Al corriente', value: 75 },
      { tramo: 'warning', label: '1-30 días', value: 10 },
      { tramo: 'serious', label: '31-60 días', value: 8 },
      { tramo: 'critical', label: '+60 días', value: 7 },
    ]);

    expect(result.svg).toContain('$100');
    expect(result.legend).toContain('Al corriente');
    expect(result.legend).toContain('+60 días');
  });

  it('calcula la cobertura mensual sobre clientes', () => {
    expect(renderCoverage({ gestionados: 25, total: 100 })).toEqual({
      pct: 25,
      total: 100,
      gestionados: 25,
      pctLabel: '25.0%',
    });
  });

  it('puede excluir el saldo al corriente y recalcula el total vencido', () => {
    const result = renderDonut([
      { tramo: 'good', label: 'Al corriente', value: 70 },
      { tramo: 'warning', label: '1-30 días', value: 20 },
      { tramo: 'critical', label: '+60 días', value: 10 },
    ], { incluirCorriente: false });

    expect(result.svg).toContain('$30');
    expect(result.svg).toContain('Total vencido');
    expect(result.legend).not.toContain('Al corriente');
  });

  it('separa los porcentajes y la expectativa del funnel', () => {
    const result = renderFunnel({ total: 10, efectiva: 5, acordadas: 2, cumplidas: 1 }, 2500);
    expect(result.bars).not.toContain('Expectativa de Cobro');
    expect(result.rates).toContain('Contactabilidad');
    expect(result.promise).toContain('$2,500');
  });

  it('representa la segmentación como dona', () => {
    const result = renderSegmentacion([
      { segment: 'comercial', label: 'Comercial', clientes: 2, monto: 80 },
      { segment: 'residencial', label: 'Residencial', clientes: 1, monto: 20 },
    ]);
    expect(result.svg).toContain('<circle');
    expect(result.legend).toContain('Comercial');
  });
});
