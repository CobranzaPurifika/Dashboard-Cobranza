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
    const detail = {
      id: 'ags-cliente',
      name: 'CLIENTE DE PRUEBA',
      invoices: [
        { id: 1, folio: 'AGS2 100', monto: 1000, dias_vencida: 45 },
        { id: 2, folio: 'AGS2 101', monto: 500.5, dias_vencida: 0 },
      ],
    };

    it('el aviso de deuda parte de las facturas vencidas y el retiro del adeudo completo', () => {
      const component = new ManagementComponent({} as any, cdr);
      component.detail = detail;

      component.openDocumentForm('aviso_deuda');
      expect([...component.documentForm!.facturaIds]).toEqual([1]);
      expect(component.documentForm!.tamanoPapel).toBe('carta');
      expect(component.documentTotal()).toBe(1000);

      component.openDocumentForm('aviso_retiro');
      expect(component.documentTotal()).toBe(1500.5);
      expect(component.documentForm!.tamanoPapel).toBe('oficio');
    });

    it('las parcialidades nuevas proponen lo pendiente y se limpian al quitar facturas', () => {
      const component = new ManagementComponent({} as any, cdr);
      component.detail = detail;
      component.openDocumentForm('acuerdo_pagos');

      const [first] = component.documentForm!.parcialidades;
      expect(first.importe).toBe(1500.5);
      first.importe = 1000;
      first.facturaIds = new Set([1]);
      component.addParcialidad();
      const second = component.documentForm!.parcialidades[1];
      expect(second.importe).toBe(500.5);
      expect([...second.facturaIds]).toEqual([2]);
      expect(component.parcialidadesMatchTotal()).toBe(true);

      component.toggleDocumentInvoice(2);
      expect(second.facturaIds.size).toBe(0);
      expect(component.documentFormIssue()).toContain('parcialidad 2');
    });

    it('envía los datos del formulario y descarga el PDF con el nombre del backend', async () => {
      let sent: any;
      const api = {
        generarDocumento: async (_id: string, tipo: string, body: any) => {
          sent = { tipo, body };
          return { blob: new Blob(['%PDF-']), fileName: 'AGS2_AvisoRetiro_Cliente_2026-09-29.pdf', warnings: ['aviso'] };
        },
      } as any;
      const component = new ManagementComponent(api, cdr);
      (component as any).downloadBlob = () => {};
      component.detail = detail;
      component.openDocumentForm('aviso_retiro');
      component.documentForm!.equipos = 'AGS2-99';

      await component.generateDocument();

      expect(sent.tipo).toBe('aviso_retiro');
      expect(sent.body.retiro).toEqual({ fechaISO: null, hora: null, equipos: 'AGS2-99' });
      expect(sent.body.facturaIds).toEqual([1, 2]);
      expect(component.documentResult).toEqual({ fileName: 'AGS2_AvisoRetiro_Cliente_2026-09-29.pdf', warnings: ['aviso'] });
      expect(component.documentGenerating).toBe(false);
    });
  });
});
