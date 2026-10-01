import { describe, expect, it } from 'vitest';
import { invoiceDate, shortDate } from './format';

describe('format', () => {
  it('la fecha de factura incluye el año; shortDate sigue sin él', () => {
    expect(invoiceDate('2025-09-05')).toBe(`${shortDate('2025-09-05')} 2025`);
    expect(invoiceDate('2025-09-05')).toMatch(/^05 sep\w* 2025$/);
    expect(shortDate('2025-09-05')).not.toContain('2025');
    expect(invoiceDate('')).toBe('');
  });
});
