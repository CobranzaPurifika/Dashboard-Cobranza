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
        { id: 3, folio: 'AGS2 102', monto: 300, dias_vencida: 0, fecha_facturacion: '2026-09-01' },
        { id: 1, folio: 'AGS2 100', monto: 1000, dias_vencida: 45, fecha_facturacion: '2026-07-01' },
        { id: 2, folio: 'AGS2 101', monto: 500.5, dias_vencida: 15, fecha_facturacion: '2026-08-01' },
      ],
    };

    it('el aviso de deuda parte de las facturas vencidas y el retiro del adeudo completo', () => {
      const component = new ManagementComponent({} as any, cdr);
      component.detail = detail;

      component.openDocumentForm('aviso_deuda');
      expect([...component.documentForm!.facturaIds].sort()).toEqual([1, 2]);
      expect(component.documentTotal()).toBe(1500.5);
      expect(component.paperLabel('aviso_deuda')).toBe('tamaño carta');

      component.openDocumentForm('aviso_retiro');
      expect(component.documentTotal()).toBe(1800.5);
      expect(component.paperLabel('aviso_retiro')).toBe('tamaño oficio');
    });

    it('reparte las facturas de la más antigua a la más reciente; la última parcialidad lleva menos', () => {
      const component = new ManagementComponent({} as any, cdr);
      component.detail = detail;
      component.openDocumentForm('acuerdo_pagos');

      const ids = () => component.documentForm!.parcialidades.map((row) => [...row.facturaIds]);
      expect(ids()).toEqual([[1, 2, 3]]);
      component.addParcialidad();
      expect(ids()).toEqual([[1, 2], [3]]);
      expect(component.documentForm!.parcialidades.map((row) => component.parcialidadImporte(row))).toEqual([1500.5, 300]);
      component.addParcialidad();
      expect(ids()).toEqual([[1], [2], [3]]);
      expect(component.canAddParcialidad()).toBe(false);

      component.toggleParcialidadInvoice(component.documentForm!.parcialidades[0], 2);
      expect(ids()).toEqual([[1, 2], [], [3]]);
      expect(component.documentFormIssue()).toContain('parcialidad 2');

      component.removeParcialidad(1);
      expect(ids()).toEqual([[1, 2], [3]]);
      component.toggleDocumentInvoice(3);
      expect(ids()).toEqual([[1], [2]]);
    });

    it('envía la nota solo si se marca y el retiro sin horario', async () => {
      const sent: any[] = [];
      const api = {
        generarDocumento: async (_id: string, tipo: string, body: any) => {
          sent.push({ tipo, body });
          return { blob: new Blob(['%PDF-']), fileName: 'AGS2_AvisoRetiro_Cliente_2026-09-29.pdf', warnings: ['aviso'] };
        },
      } as any;
      const component = new ManagementComponent(api, cdr);
      (component as any).downloadBlob = () => {};
      component.detail = detail;

      component.openDocumentForm('aviso_deuda');
      await component.generateDocument();
      expect(sent[0].body.notaAdicional).toBeUndefined();
      expect(sent[0].body.tamanoPapel).toBeUndefined();
      component.documentForm!.incluirNota = true;
      await component.generateDocument();
      expect(sent[1].body.notaAdicional).toContain('mantenimiento pendiente');

      component.openDocumentForm('aviso_retiro');
      component.documentForm!.equipos = 'AGS2-99';
      await component.generateDocument();
      expect(sent[2].body.retiro).toEqual({ fechaISO: null, equipos: 'AGS2-99' });
      expect(component.documentResult).toEqual({ fileName: 'AGS2_AvisoRetiro_Cliente_2026-09-29.pdf', warnings: ['aviso'] });
    });
  });
});
