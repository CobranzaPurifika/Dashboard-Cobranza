import { describe, expect, it } from 'vitest';
import { renderCoverage, renderDonut } from './charts';

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
});
