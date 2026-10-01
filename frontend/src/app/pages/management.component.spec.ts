import { describe, expect, it } from 'vitest';
import { ManagementComponent } from './management.component';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const cdr = { detectChanges: () => {} } as any;

describe('ManagementComponent', () => {
  it('conserva el resultado del último filtro aunque una respuesta previa llegue después', async () => {
    const commercial = deferred<any>();
    const residential = deferred<any>();
    const api = {
      prioridad: () => commercial.promise,
    } as any;
    const component = new ManagementComponent(api, cdr);

    const first = component.loadPriority();
    api.prioridad = () => residential.promise;
    component.segment = 'residencial';
    const second = component.loadPriority();

    residential.resolve({ rows: [{ id: 'residencial' }], shown: 1, total: 1 });
    await second;
    commercial.resolve({ rows: [{ id: 'comercial' }], shown: 1, total: 1 });
    await first;

    expect(component.priority).toEqual([{ id: 'residencial' }]);
  });

  it('muestra el error de Gestiones del mes y deja de cargar', async () => {
    const api = {
      gestionesMes: async () => { throw new Error('Falta aplicar la migración'); },
    } as any;
    const component = new ManagementComponent(api, cdr);

    await component.openMonthlyStats();

    expect(component.monthlyLoading).toBe(false);
    expect(component.monthlyError).toBe('Falta aplicar la migración');
  });
  describe('Generar documento', () => {
    const detail = { id: 'ags-cliente', name: 'CLIENTE DE PRUEBA', invoices: [] };
    // Ordenadas de la más antigua a la más reciente, como las entrega el backend.
    const facturas = [
      { id: 1, folio: 'AGS2 100', monto: 1000, fecha_facturacion_iso: '2026-06-01', vencimiento_iso: '2026-07-01', dias_vencida_bdd: 0 },
      { id: 2, folio: 'AGS2 101', monto: 500, fecha_facturacion_iso: '2026-07-01', vencimiento_iso: '2026-07-31', dias_vencida_bdd: 0 },
      { id: 3, folio: 'AGS2 102', monto: 300, fecha_facturacion_iso: '2099-09-01', vencimiento_iso: '2099-10-01', dias_vencida_bdd: 0 },
    ];
    const api = (extra: any = {}) => ({ documentoFacturas: async () => facturas.map((factura) => ({ ...factura })), ...extra }) as any;

    it('calcula los días de atraso con el vencimiento, no con los días de la BDD', async () => {
      const component = new ManagementComponent(api(), cdr);
      component.detail = detail;

      await component.openDocumentForm('aviso_deuda');
      // Las de pago parcial llegan con 0 días en la BDD, pero su vencimiento ya pasó.
      expect([...component.documentForm!.facturaIds]).toEqual([1, 2]);
      component.documentForm!.fechaISO = '2026-09-29';
      expect(component.invoiceDays(facturas[0] as any)).toBe(90);
      expect(component.invoiceDays(facturas[2] as any)).toBe(0);
      expect(component.paperLabel('aviso_deuda')).toBe('tamaño carta');

      await component.openDocumentForm('aviso_retiro');
      expect(component.documentTotal()).toBe(1800);
    });

    it('reparte por número de facturas y la siguiente parcialidad absorbe un importe editado', async () => {
      const component = new ManagementComponent(api(), cdr);
      component.detail = detail;
      await component.openDocumentForm('acuerdo_pagos');
      const importes = () => component.documentForm!.parcialidades.map((row) => row.importe);
      const folios = (i: number) => component.parcialidadCobertura(i).map((c) => `${c.invoice.folio}${c.parcial ? '*' : ''}`);

      expect(importes()).toEqual([1800]);
      component.addParcialidad();
      expect(importes()).toEqual([1500, 300]);
      expect(folios(0)).toEqual(['AGS2 100', 'AGS2 101']);

      // Dividir una factura entre dos pagos: la segunda parcialidad se recalcula sola.
      component.setParcialidadImporte(0, 1200);
      expect(importes()).toEqual([1200, 600]);
      expect(folios(0)).toEqual(['AGS2 100', 'AGS2 101*']);
      expect(folios(1)).toEqual(['AGS2 101*', 'AGS2 102']);
      expect(component.parcialidadesDiferencia()).toBe(0);

      component.setParcialidadImporte(1, 500);
      expect(component.parcialidadesDiferencia()).toBe(100);
    });

    it('la bonificación reduce el adeudo y se reparte en proporción', async () => {
      const sent: any[] = [];
      const component = new ManagementComponent(api({
        generarDocumento: async (_id: string, tipo: string, body: any) => {
          sent.push({ tipo, body });
          return { blob: new Blob(['%PDF-']), fileName: 'x.pdf', warnings: [] };
        },
      }), cdr);
      (component as any).downloadBlob = () => {};
      component.detail = detail;
      await component.openDocumentForm('acuerdo_pagos');
      component.addParcialidad();
      component.setBonificacion(180);

      expect(component.acuerdoNeto()).toBe(1620);
      expect(component.documentForm!.parcialidades.map((row) => row.importe)).toEqual([1350, 270]);
      await component.generateDocument();
      expect(sent[0].body.acuerdo.bonificacion).toBe(180);
      expect(sent[0].body.acuerdo.parcialidades.map((row: any) => row.facturaIds)).toEqual([[1, 2], [3]]);

      component.setBonificacion(1800);
      expect(component.documentFormIssue()).toContain('bonificación');
    });

    it('envía la nota solo si se marca y el retiro sin horario', async () => {
      const sent: any[] = [];
      const component = new ManagementComponent(api({
        generarDocumento: async (_id: string, tipo: string, body: any) => {
          sent.push({ tipo, body });
          return { blob: new Blob(['%PDF-']), fileName: 'AGS2_AvisoRetiro_Cliente_2026-09-29.pdf', warnings: ['aviso'] };
        },
      }), cdr);
      (component as any).downloadBlob = () => {};
      component.detail = detail;

      await component.openDocumentForm('aviso_deuda');
      await component.generateDocument();
      expect(sent[0].body.notaAdicional).toBeUndefined();
      component.documentForm!.incluirNota = true;
      await component.generateDocument();
      expect(sent[1].body.notaAdicional).toContain('mantenimiento pendiente');

      await component.openDocumentForm('aviso_retiro');
      component.documentForm!.equipos = 'AGS2-99';
      await component.generateDocument();
      expect(sent[2].body.retiro).toEqual({ fechaISO: null, equipos: 'AGS2-99' });
      expect(component.documentResult).toEqual({ fileName: 'AGS2_AvisoRetiro_Cliente_2026-09-29.pdf', warnings: ['aviso'] });
    });
  });
});

describe('menú de reporte mensual', () => {
  it('respeta roles y cierra con clic exterior o Escape', () => {
    const component = new ManagementComponent({} as any, cdr);
    component.user = { role: 'gestor' };
    component.toggleReportMenu();
    expect(component.reportMenuOpen).toBe(false);
    component.user = { role: 'supervisor' };
    component.toggleReportMenu();
    expect(component.reportMenuOpen).toBe(true);
    component.closeReportMenuEscape();
    expect(component.reportMenuOpen).toBe(false);
    component.toggleReportMenu();
    component.closeReportMenuOutside({ target: document.createElement('div') } as unknown as MouseEvent);
    expect(component.reportMenuOpen).toBe(false);
  });
  it('cierra al elegir, envía el mes y bloquea descargas duplicadas', async () => {
    const response = deferred<any>();
    const calls: string[] = [];
    const component = new ManagementComponent({ reporteGestionesMes: (month: string) => { calls.push(month); return response.promise; } } as any, cdr);
    component.user = { role: 'admin' };
    component.reportMenuOpen = true;
    const pending = component.downloadMonthlyReport('2026-09');
    expect(component.reportMenuOpen).toBe(false);
    expect(component.reportDownloading).toBe(true);
    await component.downloadMonthlyReport('2026-08');
    expect(calls).toEqual(['2026-09']);
    // A failed response still resets the loading state.
    response.resolve(null);
    await pending;
    expect(component.reportDownloading).toBe(false);
  });
});
