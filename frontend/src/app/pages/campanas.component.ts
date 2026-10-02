import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { ApiService } from '../core/api.service';
import { moneyExact as formatMoneyExact, shortDate as formatShortDate, tramoLabel as formatTramoLabel } from '../core/format';

type Pestana = 'whatsapp' | 'correo' | 'sinCanal' | 'escalamiento' | 'directorio' | 'historial';

interface ItemLote {
  franchiseId: string;
  groupKey: string;
  clienteId: string | null;
  nombre: string;
  segment: string;
  regla: 'preventivo' | 'correctivo';
  tramo: string;
  atrasoMaximo: number;
  monto: number;
  fechaLimiteISO: string;
  facturas: { folio: string; saldo: number; vencimientoISO: string | null; diasAtraso: number }[];
  canal: 'whatsapp' | 'correo' | null;
  destino: string | null;
  telefono: string | null;
  motivoSinCanal: string | null;
  whatsappTexto: string;
  whatsappUrl: string | null;
  correoAsunto: string;
}

interface Contacto {
  franchiseId: string;
  groupKey: string;
  nombre: string;
  segment: string;
  saldo: number;
  telefono: string | null;
  correo: string | null;
  recibeCorreo: boolean;
  origen: string | null;
  editadoManual: boolean;
  // Edición en pantalla
  telefonoEdit: string;
  correoEdit: string;
  recibeCorreoEdit: boolean;
  guardando?: boolean;
  error?: string;
  guardado?: boolean;
}

const FRANQUICIA_LABEL: Record<string, string> = {
  aguascalientes: 'Aguascalientes',
  cancun: 'Cancún',
  merida: 'Mérida',
};

const CORREOS_POR_LOTE = 20;

// Módulo independiente de Campañas: lote diario de recordatorios preventivos (al corriente,
// vencimiento en 5 días) y correctivos (1-30 días, días 7 y 15), WhatsApp asistido para
// residenciales, correo para comerciales autorizados, lista de escalamiento (31+ días) y
// directorio de contactos. No registra gestiones en la bitácora del cliente.
@Component({
  selector: 'app-campanas',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon, IonSpinner],
  templateUrl: './campanas.component.html',
  styleUrl: './campanas.component.scss',
})
export class CampanasComponent implements OnChanges {
  @Input() franchise = 'todas';
  @Input() user: any;
  @Output() openClient = new EventEmitter<string>();

  pestana: Pestana = 'whatsapp';
  lote: any = null;
  cargando = false;
  error = '';
  aviso = '';
  excluidosVisibles = false;

  // WhatsApp: envíos registrados en esta sesión, para poder deshacer.
  registrados = new Map<string, number[]>();
  enCurso = new Set<string>();
  vistaPrevia = new Set<string>();

  // Correo
  seleccion = new Set<string>();
  enviandoCorreos = false;
  progresoCorreo = '';
  resultadosCorreo = new Map<string, { ok: boolean; error?: string }>();
  correoPrevio: { para: string; asunto: string; texto: string } | null = null;

  // Directorio
  contactos: Contacto[] = [];
  contactosCargados = false;
  cargandoContactos = false;
  filtroContacto = '';
  segmentoContacto: '' | 'comercial' | 'residencial' = '';
  soloSinContacto = false;
  importando = false;
  descargandoPlantilla = false;
  formatoVisible = false;
  resultadoImportacion: any = null;

  // Historial
  historial: any[] = [];
  cargandoHistorial = false;

  private solicitud = 0;

  constructor(private readonly api: ApiService, private readonly cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['franchise']) {
      this.contactosCargados = false;
      this.historial = [];
      void this.cargar();
      if (this.pestana === 'directorio') void this.cargarContactos();
      if (this.pestana === 'historial') void this.cargarHistorial();
    }
  }

  get esAdmin(): boolean {
    return this.user?.role === 'admin';
  }

  get whatsapp(): ItemLote[] {
    return (this.lote?.pendientes ?? []).filter((item: ItemLote) => item.canal === 'whatsapp');
  }

  get correo(): ItemLote[] {
    return (this.lote?.pendientes ?? []).filter((item: ItemLote) => item.canal === 'correo');
  }

  get sinCanal(): ItemLote[] {
    return (this.lote?.pendientes ?? []).filter((item: ItemLote) => !item.canal);
  }

  get escalamiento(): any[] {
    return this.lote?.escalamiento ?? [];
  }

  get fuentesDesactualizadas(): any[] {
    return (this.lote?.fuentes ?? []).filter((fuente: any) => fuente.desactualizada);
  }

  async cargar(refrescar = false): Promise<void> {
    const solicitud = ++this.solicitud;
    this.cargando = true;
    this.error = '';
    try {
      const lote = await this.api.campanasLote(this.franchise, refrescar);
      if (solicitud !== this.solicitud) return;
      this.lote = lote;
      this.registrados.clear();
      this.resultadosCorreo.clear();
      const vigentes = new Set(this.correo.map((item) => this.llave(item)));
      this.seleccion = new Set([...this.seleccion].filter((llave) => vigentes.has(llave)));
      if (refrescar && this.contactosCargados) await this.cargarContactos();
    } catch (error: any) {
      if (solicitud === this.solicitud) this.error = error.message ?? 'No se pudo armar el lote del día';
    } finally {
      if (solicitud === this.solicitud) this.cargando = false;
      this.cdr.markForCheck();
    }
  }

  setPestana(pestana: Pestana): void {
    this.pestana = pestana;
    if (pestana === 'directorio' && !this.contactosCargados) void this.cargarContactos();
    if (pestana === 'historial') void this.cargarHistorial();
  }

  llave(item: { franchiseId: string; groupKey: string; regla: string }): string {
    return `${item.franchiseId}|${item.groupKey}|${item.regla}`;
  }

  // ---- WhatsApp asistido ----

  async enviarWhatsApp(item: ItemLote): Promise<void> {
    const llave = this.llave(item);
    if (!item.whatsappUrl || this.enCurso.has(llave) || this.registrados.has(llave)) return;
    // Se abre primero (dentro del clic) para que el navegador no lo bloquee como ventana
    // emergente; el registro se hace en paralelo.
    window.open(item.whatsappUrl, '_blank', 'noopener');
    this.enCurso.add(llave);
    try {
      const { ids } = await this.api.campanasRegistrarWhatsApp({ franchiseId: item.franchiseId, groupKey: item.groupKey, regla: item.regla });
      this.registrados.set(llave, ids);
    } catch (error: any) {
      this.aviso = `${item.nombre}: ${error.message}`;
    } finally {
      this.enCurso.delete(llave);
      this.cdr.markForCheck();
    }
  }

  async deshacer(item: ItemLote): Promise<void> {
    const llave = this.llave(item);
    const ids = this.registrados.get(llave);
    if (!ids?.length) return;
    this.enCurso.add(llave);
    try {
      await this.api.campanasDeshacer(ids);
      this.registrados.delete(llave);
    } catch (error: any) {
      this.aviso = `No se pudo deshacer: ${error.message}`;
    } finally {
      this.enCurso.delete(llave);
      this.cdr.markForCheck();
    }
  }

  async copiarMensaje(item: ItemLote): Promise<void> {
    try {
      await navigator.clipboard.writeText(item.whatsappTexto);
      this.aviso = `Mensaje de ${item.nombre} copiado`;
    } catch {
      this.aviso = 'No se pudo copiar el mensaje';
    }
    this.cdr.markForCheck();
  }

  toggleVistaPrevia(item: ItemLote): void {
    const llave = this.llave(item);
    if (this.vistaPrevia.has(llave)) this.vistaPrevia.delete(llave);
    else this.vistaPrevia.add(llave);
  }

  get whatsappRegistrados(): number {
    return this.whatsapp.filter((item) => this.registrados.has(this.llave(item))).length;
  }

  // ---- Correo ----

  toggleSeleccion(item: ItemLote): void {
    const llave = this.llave(item);
    if (this.seleccion.has(llave)) this.seleccion.delete(llave);
    else this.seleccion.add(llave);
  }

  get correosPendientes(): ItemLote[] {
    return this.correo.filter((item) => !this.resultadosCorreo.get(this.llave(item))?.ok);
  }

  get todosSeleccionados(): boolean {
    const pendientes = this.correosPendientes;
    return pendientes.length > 0 && pendientes.every((item) => this.seleccion.has(this.llave(item)));
  }

  toggleTodos(): void {
    if (this.todosSeleccionados) this.seleccion.clear();
    else this.seleccion = new Set(this.correosPendientes.map((item) => this.llave(item)));
  }

  async verCorreo(item: ItemLote): Promise<void> {
    try {
      this.correoPrevio = await this.api.campanasVistaPrevia({ franchiseId: item.franchiseId, groupKey: item.groupKey, regla: item.regla });
    } catch (error: any) {
      this.aviso = error.message;
    }
    this.cdr.markForCheck();
  }

  async enviarCorreos(): Promise<void> {
    const seleccionados = this.correosPendientes.filter((item) => this.seleccion.has(this.llave(item)));
    if (!seleccionados.length || this.enviandoCorreos) return;
    const total = seleccionados.length;
    if (!window.confirm(`Se enviarán ${total} correo${total === 1 ? '' : 's'} desde ${this.lote?.remitente ?? 'la cuenta de cobranza'}. ¿Continuar?`)) return;
    this.enviandoCorreos = true;
    let enviados = 0;
    try {
      for (let inicio = 0; inicio < total; inicio += CORREOS_POR_LOTE) {
        const bloque = seleccionados.slice(inicio, inicio + CORREOS_POR_LOTE);
        this.progresoCorreo = `Enviando ${Math.min(inicio + bloque.length, total)} de ${total}…`;
        this.cdr.markForCheck();
        const respuesta = await this.api.campanasEnviarCorreos(
          bloque.map((item) => ({ franchiseId: item.franchiseId, groupKey: item.groupKey, regla: item.regla }))
        );
        for (const resultado of respuesta.resultados) {
          const llave = this.llave(resultado);
          this.resultadosCorreo.set(llave, { ok: resultado.ok, error: resultado.error });
          if (resultado.ok) {
            enviados += 1;
            this.seleccion.delete(llave);
          }
        }
      }
      this.aviso = `${enviados} de ${total} correo${total === 1 ? '' : 's'} enviado${enviados === 1 ? '' : 's'}`;
    } catch (error: any) {
      this.aviso = `Se detuvo el envío: ${error.message}`;
    } finally {
      this.enviandoCorreos = false;
      this.progresoCorreo = '';
      this.cdr.markForCheck();
    }
  }

  // ---- Directorio ----

  async cargarContactos(refrescar = false): Promise<void> {
    this.cargandoContactos = true;
    try {
      const filas = await this.api.campanasContactos(this.franchise, refrescar);
      this.contactos = filas.map((fila: any) => ({
        ...fila,
        telefonoEdit: this.telefonoLocal(fila.telefono),
        correoEdit: fila.correo ?? '',
        recibeCorreoEdit: fila.recibeCorreo,
      }));
      this.contactosCargados = true;
    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.cargandoContactos = false;
      this.cdr.markForCheck();
    }
  }

  get contactosFiltrados(): Contacto[] {
    const texto = this.normalizar(this.filtroContacto);
    return this.contactos.filter((contacto) =>
      (!this.segmentoContacto || contacto.segment === this.segmentoContacto)
      && (!this.soloSinContacto || (!contacto.telefono && !contacto.correo))
      && (!texto || this.normalizar(contacto.nombre).includes(texto)));
  }

  get autorizadosCorreo(): number {
    return this.contactos.filter((contacto) => contacto.segment === 'comercial' && contacto.recibeCorreo).length;
  }

  modificado(contacto: Contacto): boolean {
    return contacto.telefonoEdit.trim() !== this.telefonoLocal(contacto.telefono)
      || contacto.correoEdit.trim() !== (contacto.correo ?? '')
      || contacto.recibeCorreoEdit !== contacto.recibeCorreo;
  }

  async guardarContacto(contacto: Contacto): Promise<void> {
    contacto.guardando = true;
    contacto.error = '';
    contacto.guardado = false;
    try {
      const fila = await this.api.campanasGuardarContacto({
        franchiseId: contacto.franchiseId,
        groupKey: contacto.groupKey,
        nombre: contacto.nombre,
        telefono: contacto.telefonoEdit,
        correo: contacto.correoEdit,
        recibeCorreo: contacto.segment === 'comercial' && contacto.recibeCorreoEdit,
      });
      Object.assign(contacto, {
        telefono: fila.telefono,
        correo: fila.correo,
        recibeCorreo: fila.recibe_correo,
        origen: fila.origen,
        editadoManual: fila.editado_manual,
        telefonoEdit: this.telefonoLocal(fila.telefono),
        correoEdit: fila.correo ?? '',
        recibeCorreoEdit: fila.recibe_correo,
        guardado: true,
      });
      // El lote depende de los contactos: se recalcula para mover al cliente de "Sin canal".
      void this.cargar();
    } catch (error: any) {
      contacto.error = error.message;
    } finally {
      contacto.guardando = false;
      this.cdr.markForCheck();
    }
  }

  async subirArchivo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo || this.importando) return;
    if (!/\.(csv|xlsx)$/i.test(archivo.name)) {
      this.resultadoImportacion = { error: 'Sube un archivo .csv o .xlsx', archivo: archivo.name, omitidas: [] };
      return;
    }
    this.importando = true;
    this.resultadoImportacion = null;
    this.formatoVisible = false;
    this.cdr.markForCheck();
    try {
      const resumen = await this.api.campanasImportarContactos(archivo);
      this.resultadoImportacion = { ...resumen, archivo: archivo.name };
      await Promise.all([this.cargarContactos(), this.cargar()]);
    } catch (error: any) {
      this.resultadoImportacion = { error: error.message, archivo: archivo.name, omitidas: error.omitidas ?? [] };
    } finally {
      this.importando = false;
      this.cdr.markForCheck();
    }
  }

  async descargarPlantilla(): Promise<void> {
    if (this.descargandoPlantilla) return;
    this.descargandoPlantilla = true;
    try {
      const { blob, fileName } = await this.api.campanasPlantilla(this.franchise);
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = fileName;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error: any) {
      this.aviso = `No se pudo descargar la plantilla: ${error.message}`;
    } finally {
      this.descargandoPlantilla = false;
      this.cdr.markForCheck();
    }
  }

  descripcionFila(fila: { fila: number; nombre?: string | null; motivo: string }): string {
    return `Fila ${fila.fila}${fila.nombre ? ` · ${fila.nombre}` : ''}: ${fila.motivo}`;
  }

  primeros<T>(lista: T[] | null | undefined, cantidad = 8): T[] {
    return (lista ?? []).slice(0, cantidad);
  }

  capturarContacto(item: ItemLote): void {
    this.filtroContacto = item.nombre;
    this.segmentoContacto = '';
    this.soloSinContacto = false;
    this.setPestana('directorio');
  }

  // ---- Historial ----

  async cargarHistorial(): Promise<void> {
    this.cargandoHistorial = true;
    try {
      this.historial = await this.api.campanasHistorial(this.franchise, 30);
    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.cargandoHistorial = false;
      this.cdr.markForCheck();
    }
  }

  // ---- Presentación ----

  documentoSugerido(tramo: string): string {
    return tramo === 'critical' ? 'Aviso de retiro de equipos o Acuerdo de pagos' : 'Aviso de deuda';
  }

  descripcionVentanas(): { preventivo: string; correctivo: string } {
    const ventanas = this.lote?.ventanas;
    const correctivo = ventanas?.correctivo
      ? `${ventanas.correctivo.recordatorio === 'R1' ? '1er' : '2do'} recordatorio activo desde el ${this.shortDate(ventanas.correctivo.desdeISO)}`
      : `Próximo recordatorio: ${this.shortDate(ventanas?.proximoCorrectivoISO)}`;
    return { preventivo: `Vencimiento en ${ventanas?.preventivo?.diasAntes ?? 5} días o menos`, correctivo };
  }

  folios(item: { facturas: { folio: string }[] }): string {
    return item.facturas.map((factura) => factura.folio).join(', ');
  }

  franquicia(id: string): string {
    return FRANQUICIA_LABEL[id] ?? id;
  }

  telefonoLegible(telefono: string | null): string {
    if (!telefono) return '';
    const local = telefono.slice(2);
    return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }

  telefonoLocal(telefono: string | null): string {
    return telefono ? telefono.slice(2) : '';
  }

  money(value: unknown): string {
    return formatMoneyExact(value);
  }

  shortDate(value: string | null | undefined): string {
    return value ? formatShortDate(value) : '—';
  }

  tramoLabel(tramo: string): string {
    return formatTramoLabel(tramo);
  }

  fechaHora(value: string): string {
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City',
    }).format(new Date(value)).replace('.', '');
  }

  cerrarAviso(): void {
    this.aviso = '';
  }

  private normalizar(texto: string): string {
    return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
}
