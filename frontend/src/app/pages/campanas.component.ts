import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { ApiService } from '../core/api.service';
import { VistaCorreoComponent, VistaWhatsappComponent } from './vista-mensaje.component';
import { moneyExact as formatMoneyExact, shortDate as formatShortDate, tramoLabel as formatTramoLabel } from '../core/format';

type Pestana = 'whatsapp' | 'correo' | 'sinCanal' | 'escalamiento' | 'directorio' | 'plantillas' | 'historial';

interface ItemLote {
  franchiseId: string;
  groupKey: string;
  clienteId: string | null;
  nombre: string;
  segment: string;
  regla: 'preventivo' | 'correctivo';
  recordatorio: string | null;
  tramo: string;
  atrasoMaximo: number;
  monto: number;
  fechaLimiteISO: string;
  facturas: { folio: string; saldo: number; vencimientoISO: string | null; diasAtraso: number }[];
  canal: 'whatsapp' | 'correo' | null;
  destino: string | null;
  telefono: string | null;
  telefonoLegible: string;
  motivoSinCanal: string | null;
  whatsappTexto: string;
  whatsappUrl: string | null;
  correoAsunto: string;
  correoTexto: string;
}

interface CorreoPrevio {
  item: ItemLote;
  para: string;
  asunto: string;
  texto: string;
}

interface PlantillaMensaje {
  clave: string;
  titulo: string;
  mensaje: string;
  regla: 'preventivo' | 'correctivo';
  canal: 'whatsapp' | 'correo';
  tipo: 'asunto' | 'cuerpo';
  limite: number;
  contenido: string;
  predeterminada: string;
  personalizada: boolean;
  actualizado: string | null;
  actualizadoPor: string | null;
  // Edición en pantalla
  contenidoEdit: string;
}

interface MensajeRecordatorio {
  clave: string;
  etiqueta: string;
  descripcion: string;
  regla: 'preventivo' | 'correctivo';
  recordatorio: string | null;
  desdeISO: string | null;
}

// Una tarjeta por mensaje y canal. En correo, asunto y cuerpo se editan y guardan juntos.
interface TarjetaPlantilla {
  id: string;
  canal: 'whatsapp' | 'correo';
  cuerpo: PlantillaMensaje;
  asunto: PlantillaMensaje | null;
  abierta: boolean;
  // Último campo enfocado, para insertar ahí las variables.
  campoActivo: 'asunto' | 'cuerpo';
  elementoActivo?: HTMLInputElement | HTMLTextAreaElement;
  // Vista previa simulada (celular con WhatsApp o bandeja de correo) con un cliente ficticio.
  vista?: {
    asunto?: string;
    texto: string;
    html?: string;
    franquicia: string;
    cliente: string;
    remitente: { nombre: string; correo: string };
  };
  cargandoVista?: boolean;
  refrescoVista?: ReturnType<typeof setTimeout>;
  guardando?: boolean;
  error?: string;
  guardado?: boolean;
}

interface Contacto {
  franchiseId: string;
  groupKey: string;
  nombre: string;
  segment: string;
  saldo: number;
  telefono: string | null;
  telefonoLegible: string;
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
const PESTANAS_SUPERVISOR: Pestana[] = ['plantillas', 'historial'];
const ORDINAL_RECORDATORIO: Record<string, string> = { R1: '1er', R2: '2do', R3: '3er', R4: '4to', R5: '5to' };

// Módulo independiente de Campañas: lote diario de recordatorios preventivos (al corriente,
// vencimiento en 5 días) y correctivos (1-30 días, semanal: días 7, 15, 21 y fin de mes),
// WhatsApp asistido para residenciales, correo para comerciales autorizados, lista de
// escalamiento (31+ días), directorio de contactos y plantillas de los mensajes. Cada
// mensaje se puede revisar y editar antes de enviarlo. No registra gestiones en la bitácora
// del cliente.
@Component({
  selector: 'app-campanas',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon, IonSpinner, VistaWhatsappComponent, VistaCorreoComponent],
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
  // Mensajes editados a mano antes de enviar (llave del item -> texto).
  ediciones = new Map<string, string>();

  // Correo
  seleccion = new Set<string>();
  enviandoCorreos = false;
  progresoCorreo = '';
  resultadosCorreo = new Map<string, { ok: boolean; error?: string }>();
  correoPrevio: CorreoPrevio | null = null;
  edicionesCorreo = new Map<string, { asunto: string; texto: string }>();

  // Plantillas de los mensajes
  mensajes: MensajeRecordatorio[] = [];
  tarjetas: TarjetaPlantilla[] = [];
  variables: { clave: string; descripcion: string; ejemplo: string }[] = [];
  plantillasCargadas = false;
  cargandoPlantillas = false;

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
  historialAbierto = new Set<number>();

  private solicitud = 0;

  constructor(private readonly api: ApiService, private readonly cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    // El supervisor solo consulta: entra directo al Historial.
    if (changes['user'] && this.soloLectura && !PESTANAS_SUPERVISOR.includes(this.pestana)) this.pestana = 'historial';
    if (changes['franchise']) {
      this.contactosCargados = false;
      this.historial = [];
      void this.cargar();
      if (this.pestana === 'directorio') void this.cargarContactos();
      if (this.pestana === 'historial') void this.cargarHistorial();
    }
  }

  // Supervisor: ve Historial y Plantillas (con vista previa); no arma el lote ni envía.
  get soloLectura(): boolean {
    return this.user?.role === 'supervisor';
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
    if (this.soloLectura) return;
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
      // Las ediciones a mano se conservan mientras el recordatorio siga pendiente.
      const pendientes = new Set((lote.pendientes ?? []).map((item: ItemLote) => this.llave(item)));
      for (const llave of [...this.ediciones.keys()]) if (!pendientes.has(llave)) this.ediciones.delete(llave);
      for (const llave of [...this.edicionesCorreo.keys()]) if (!pendientes.has(llave)) this.edicionesCorreo.delete(llave);
      if (refrescar && this.contactosCargados) await this.cargarContactos();
    } catch (error: any) {
      if (solicitud === this.solicitud) this.error = error.message ?? 'No se pudo armar el lote del día';
    } finally {
      if (solicitud === this.solicitud) this.cargando = false;
      this.cdr.markForCheck();
    }
  }

  setPestana(pestana: Pestana): void {
    if (this.soloLectura && !PESTANAS_SUPERVISOR.includes(pestana)) return;
    this.pestana = pestana;
    if (pestana === 'directorio' && !this.contactosCargados) void this.cargarContactos();
    if (pestana === 'plantillas' && !this.plantillasCargadas) void this.cargarPlantillas();
    if (pestana === 'historial') void this.cargarHistorial();
  }

  llave(item: { franchiseId: string; groupKey: string; regla: string }): string {
    return `${item.franchiseId}|${item.groupKey}|${item.regla}`;
  }

  // ---- WhatsApp asistido ----

  textoWhatsApp(item: ItemLote): string {
    return this.ediciones.get(this.llave(item)) ?? item.whatsappTexto;
  }

  editarWhatsApp(item: ItemLote, texto: string): void {
    if (texto === item.whatsappTexto) this.ediciones.delete(this.llave(item));
    else this.ediciones.set(this.llave(item), texto);
  }

  editado(item: ItemLote): boolean {
    return this.ediciones.has(this.llave(item));
  }

  restablecerWhatsApp(item: ItemLote): void {
    this.ediciones.delete(this.llave(item));
  }

  async enviarWhatsApp(item: ItemLote): Promise<void> {
    const llave = this.llave(item);
    if (!item.whatsappUrl || !item.telefono || this.enCurso.has(llave) || this.registrados.has(llave)) return;
    const mensaje = this.ediciones.get(llave)?.trim();
    if (mensaje === '') {
      this.aviso = `${item.nombre}: el mensaje está vacío`;
      return;
    }
    // Se abre primero (dentro del clic) para que el navegador no lo bloquee como ventana
    // emergente; el registro se hace en paralelo.
    const url = mensaje ? `https://wa.me/${item.telefono}?text=${encodeURIComponent(mensaje)}` : item.whatsappUrl;
    window.open(url, '_blank', 'noopener');
    this.enCurso.add(llave);
    try {
      const { ids } = await this.api.campanasRegistrarWhatsApp({
        franchiseId: item.franchiseId, groupKey: item.groupKey, regla: item.regla, ...(mensaje ? { mensaje } : {}),
      });
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
      await navigator.clipboard.writeText(this.textoWhatsApp(item));
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

  get todosVisibles(): boolean {
    return this.whatsapp.length > 0 && this.whatsapp.every((item) => this.vistaPrevia.has(this.llave(item)));
  }

  toggleTodosVisibles(): void {
    if (this.todosVisibles) this.vistaPrevia.clear();
    else this.vistaPrevia = new Set(this.whatsapp.map((item) => this.llave(item)));
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

  verCorreo(item: ItemLote): void {
    const edicion = this.edicionesCorreo.get(this.llave(item));
    this.correoPrevio = {
      item,
      para: item.destino ?? '',
      asunto: edicion?.asunto ?? item.correoAsunto,
      texto: edicion?.texto ?? item.correoTexto,
    };
  }

  correoEditado(item: ItemLote): boolean {
    return this.edicionesCorreo.has(this.llave(item));
  }

  asuntoCorreo(item: ItemLote): string {
    return this.edicionesCorreo.get(this.llave(item))?.asunto ?? item.correoAsunto;
  }

  guardarEdicionCorreo(): void {
    const previo = this.correoPrevio;
    if (!previo) return;
    const asunto = previo.asunto.replace(/\s+/g, ' ').trim();
    const texto = previo.texto.trim();
    if (!asunto || !texto) {
      this.aviso = 'El asunto y el texto del correo no pueden quedar vacíos';
      return;
    }
    const llave = this.llave(previo.item);
    if (asunto === previo.item.correoAsunto && texto === previo.item.correoTexto.trim()) this.edicionesCorreo.delete(llave);
    else this.edicionesCorreo.set(llave, { asunto, texto });
    this.correoPrevio = null;
  }

  restablecerCorreo(): void {
    const previo = this.correoPrevio;
    if (!previo) return;
    this.edicionesCorreo.delete(this.llave(previo.item));
    this.correoPrevio = { ...previo, asunto: previo.item.correoAsunto, texto: previo.item.correoTexto };
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
          bloque.map((item) => ({
            franchiseId: item.franchiseId, groupKey: item.groupKey, regla: item.regla,
            ...(this.edicionesCorreo.get(this.llave(item)) ?? {}),
          }))
        );
        for (const resultado of respuesta.resultados) {
          const llave = this.llave(resultado);
          this.resultadosCorreo.set(llave, { ok: resultado.ok, error: resultado.error });
          if (resultado.ok) {
            enviados += 1;
            this.seleccion.delete(llave);
            this.edicionesCorreo.delete(llave);
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
        telefonoEdit: fila.telefonoLegible ?? '',
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
    return contacto.telefonoEdit.trim() !== (contacto.telefonoLegible ?? '')
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
        telefonoLegible: fila.telefono_legible ?? '',
        correo: fila.correo,
        recibeCorreo: fila.recibe_correo,
        origen: fila.origen,
        editadoManual: fila.editado_manual,
        telefonoEdit: fila.telefono_legible ?? '',
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

  // ---- Plantillas de los mensajes ----

  async cargarPlantillas(): Promise<void> {
    this.cargandoPlantillas = true;
    try {
      const { mensajes, plantillas, variables } = await this.api.campanasPlantillasMensaje();
      const abiertas = new Set(this.tarjetas.filter((tarjeta) => tarjeta.abierta).map((tarjeta) => tarjeta.id));
      const porClave = new Map<string, PlantillaMensaje>(plantillas.map((plantilla: any) => [plantilla.clave, { ...plantilla, contenidoEdit: plantilla.contenido }]));
      this.mensajes = mensajes;
      this.tarjetas = mensajes.flatMap((mensaje: MensajeRecordatorio) => (['whatsapp', 'correo'] as const).map((canal) => {
        const id = `${mensaje.clave}_${canal}`;
        return {
          id,
          canal,
          cuerpo: porClave.get(id)!,
          asunto: canal === 'correo' ? porClave.get(`${mensaje.clave}_correo_asunto`) ?? null : null,
          abierta: abiertas.has(id),
          campoActivo: 'cuerpo' as const,
        };
      })).filter((tarjeta: TarjetaPlantilla) => tarjeta.cuerpo);
      this.variables = variables;
      this.plantillasCargadas = true;
    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.cargandoPlantillas = false;
      this.cdr.markForCheck();
    }
  }

  tarjetasDe(mensaje: MensajeRecordatorio): TarjetaPlantilla[] {
    return this.tarjetas.filter((tarjeta) => tarjeta.cuerpo.mensaje === mensaje.clave);
  }

  private camposDe(tarjeta: TarjetaPlantilla): PlantillaMensaje[] {
    return tarjeta.asunto ? [tarjeta.asunto, tarjeta.cuerpo] : [tarjeta.cuerpo];
  }

  modificada(tarjeta: TarjetaPlantilla): boolean {
    return this.camposDe(tarjeta).some((campo) => campo.contenidoEdit.trim() !== campo.contenido);
  }

  personalizada(tarjeta: TarjetaPlantilla): boolean {
    return this.camposDe(tarjeta).some((campo) => campo.personalizada);
  }

  estadoTarjeta(tarjeta: TarjetaPlantilla): string {
    if (this.modificada(tarjeta)) return 'Cambios sin guardar';
    const editada = this.camposDe(tarjeta).filter((campo) => campo.personalizada)
      .sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado)))[0];
    if (!editada) return 'Predeterminada';
    return `Editada${editada.actualizadoPor ? ' por ' + editada.actualizadoPor : ''}${editada.actualizado ? ' · ' + this.fechaHora(editada.actualizado) : ''}`;
  }

  // Primera línea con texto del mensaje, para reconocerlo con la tarjeta contraída.
  resumenTarjeta(tarjeta: TarjetaPlantilla): string {
    if (tarjeta.asunto) return tarjeta.asunto.contenidoEdit;
    return tarjeta.cuerpo.contenidoEdit.split('\n').find((linea) => linea.trim())?.trim() ?? '';
  }

  toggleTarjeta(tarjeta: TarjetaPlantilla): void {
    tarjeta.abierta = !tarjeta.abierta;
    if (!tarjeta.abierta) {
      tarjeta.elementoActivo = undefined;
      this.cerrarVista(tarjeta);
    }
  }

  // Con la vista previa abierta, se actualiza sola un momento después de dejar de escribir.
  marcarCambio(tarjeta: TarjetaPlantilla): void {
    tarjeta.guardado = false;
    if (!tarjeta.vista) return;
    clearTimeout(tarjeta.refrescoVista);
    tarjeta.refrescoVista = setTimeout(() => void this.cargarVista(tarjeta), 600);
  }

  cerrarVista(tarjeta: TarjetaPlantilla): void {
    clearTimeout(tarjeta.refrescoVista);
    tarjeta.vista = undefined;
  }

  enfocar(tarjeta: TarjetaPlantilla, campo: 'asunto' | 'cuerpo', event: FocusEvent): void {
    tarjeta.campoActivo = campo;
    tarjeta.elementoActivo = event.target as HTMLInputElement | HTMLTextAreaElement;
  }

  // Inserta la variable donde está el cursor del último campo usado (asunto o cuerpo); si no
  // se ha tocado ninguno, al final del cuerpo.
  insertarVariable(tarjeta: TarjetaPlantilla, clave: string): void {
    const plantilla = tarjeta.campoActivo === 'asunto' && tarjeta.asunto ? tarjeta.asunto : tarjeta.cuerpo;
    const campo = tarjeta.elementoActivo;
    const token = `{${clave}}`;
    const inicio = campo?.selectionStart ?? plantilla.contenidoEdit.length;
    const fin = campo?.selectionEnd ?? inicio;
    plantilla.contenidoEdit = plantilla.contenidoEdit.slice(0, inicio) + token + plantilla.contenidoEdit.slice(fin);
    this.marcarCambio(tarjeta);
    if (campo) {
      setTimeout(() => {
        campo.focus();
        campo.setSelectionRange(inicio + token.length, inicio + token.length);
      });
    }
  }

  async vistaPreviaTarjeta(tarjeta: TarjetaPlantilla): Promise<void> {
    if (tarjeta.vista) this.cerrarVista(tarjeta);
    else await this.cargarVista(tarjeta);
  }

  private async cargarVista(tarjeta: TarjetaPlantilla): Promise<void> {
    tarjeta.cargandoVista = true;
    tarjeta.error = '';
    const franquicia = this.franchise !== 'todas' ? { franchiseId: this.franchise } : {};
    try {
      const [asunto, cuerpo] = await Promise.all([
        tarjeta.asunto
          ? this.api.campanasVistaPreviaPlantillaMensaje({ clave: tarjeta.asunto.clave, contenido: tarjeta.asunto.contenidoEdit, ...franquicia })
          : Promise.resolve(null),
        this.api.campanasVistaPreviaPlantillaMensaje({ clave: tarjeta.cuerpo.clave, contenido: tarjeta.cuerpo.contenidoEdit, ...franquicia }),
      ]);
      tarjeta.vista = {
        asunto: asunto?.texto,
        texto: cuerpo.texto,
        html: cuerpo.html,
        franquicia: cuerpo.franquicia,
        cliente: cuerpo.cliente,
        remitente: cuerpo.remitente,
      };
    } catch (error: any) {
      tarjeta.error = error.message;
    } finally {
      tarjeta.cargandoVista = false;
      this.cdr.markForCheck();
    }
  }

  async guardarTarjeta(tarjeta: TarjetaPlantilla): Promise<void> {
    await this.actualizarTarjeta(tarjeta, async (campo) => {
      if (campo.contenidoEdit.trim() === campo.contenido) return null;
      return this.api.campanasGuardarPlantillaMensaje(campo.clave, campo.contenidoEdit);
    });
  }

  async restablecerTarjeta(tarjeta: TarjetaPlantilla): Promise<void> {
    const nombre = `${this.mensajes.find((mensaje) => mensaje.clave === tarjeta.cuerpo.mensaje)?.etiqueta ?? ''} · ${tarjeta.canal === 'correo' ? 'Correo' : 'WhatsApp'}`;
    if (!window.confirm(`¿Volver al texto predeterminado de "${nombre}"? Se pierde la versión editada.`)) return;
    await this.actualizarTarjeta(tarjeta, async (campo) => (campo.personalizada ? this.api.campanasRestablecerPlantillaMensaje(campo.clave) : null));
  }

  descartarTarjeta(tarjeta: TarjetaPlantilla): void {
    for (const campo of this.camposDe(tarjeta)) campo.contenidoEdit = campo.contenido;
    this.marcarCambio(tarjeta);
  }

  // Guarda o restablece asunto y cuerpo uno tras otro; si uno falla, el otro ya quedó
  // aplicado y el error se muestra en la tarjeta. Al terminar se recalcula el lote para que
  // los mensajes pendientes usen la nueva versión.
  private async actualizarTarjeta(tarjeta: TarjetaPlantilla, accion: (campo: PlantillaMensaje) => Promise<any>): Promise<void> {
    tarjeta.guardando = true;
    tarjeta.error = '';
    let cambio = false;
    try {
      for (const campo of this.camposDe(tarjeta)) {
        const fila = await accion(campo);
        if (fila) {
          Object.assign(campo, { ...fila, contenidoEdit: fila.contenido });
          cambio = true;
        }
      }
      tarjeta.guardado = true;
      if (tarjeta.vista) void this.cargarVista(tarjeta);
    } catch (error: any) {
      tarjeta.error = error.message;
    } finally {
      tarjeta.guardando = false;
      if (cambio) void this.cargar();
      this.cdr.markForCheck();
    }
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

  descripcionVentanas(): { preventivo: string; correctivo: string; calendario: string } {
    const ventanas = this.lote?.ventanas;
    const correctivo = ventanas?.correctivo
      ? `${this.ordinal(ventanas.correctivo.recordatorio)} recordatorio${ventanas.correctivo.finDeMes ? ' (fin de mes)' : ''} activo desde el ${this.shortDate(ventanas.correctivo.desdeISO)}`
      : `Próximo recordatorio: ${this.shortDate(ventanas?.proximoCorrectivoISO)}`;
    const fechas = (ventanas?.calendario ?? []).map((ventana: any) => this.shortDate(ventana.desdeISO));
    const calendario = fechas.length > 1 ? `Este mes: ${fechas.slice(0, -1).join(', ')} y ${fechas[fechas.length - 1]}` : '';
    return { preventivo: `Vencimiento en ${ventanas?.preventivo?.diasAntes ?? 5} días o menos`, correctivo, calendario };
  }

  ordinal(recordatorio: string): string {
    return ORDINAL_RECORDATORIO[recordatorio] ?? recordatorio;
  }

  etiquetaRegla(item: ItemLote): string {
    return item.regla === 'preventivo' ? 'Preventivo' : `Correctivo ${this.ordinal(item.recordatorio ?? 'R1')} recordatorio`;
  }

  etiquetaEnvio(envio: { regla: string; periodo: string }): string {
    return envio.regla === 'preventivo' ? 'Preventivo' : `Correctivo ${this.ordinal(envio.periodo.slice(-2))} recordatorio`;
  }

  toggleHistorial(id: number): void {
    if (this.historialAbierto.has(id)) this.historialAbierto.delete(id);
    else this.historialAbierto.add(id);
  }

  folios(item: { facturas: { folio: string }[] }): string {
    return item.facturas.map((factura) => factura.folio).join(', ');
  }

  franquicia(id: string): string {
    return FRANQUICIA_LABEL[id] ?? id;
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
