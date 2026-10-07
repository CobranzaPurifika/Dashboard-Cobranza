import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, Input, OnChanges, ViewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

function escapeHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function horaActual(): string {
  return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

// Formato de WhatsApp sobre texto ya escapado: *negritas*, _cursivas_ y ~tachado~.
export function formatoWhatsApp(texto: string): string {
  return escapeHtml(texto)
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s.,;:!?)])/g, '$1<strong>$2</strong>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,;:!?)])/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])~([^~\n]+)~(?=$|[\s.,;:!?)])/g, '$1<s>$2</s>');
}

// Simulación de cómo ve el cliente el recordatorio en WhatsApp: celular con el chat de la
// franquicia y el mensaje recibido. Solo visual; los colores imitan WhatsApp en modo claro.
@Component({
  selector: 'app-vista-whatsapp',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="phone" role="img" [attr.aria-label]="'Vista en WhatsApp del mensaje de ' + contacto">
      <div class="phone-screen">
        <div class="status-bar"><span>{{ hora }}</span><span class="status-icons"><i></i><i></i><b></b></span></div>
        <header class="wa-header">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/></svg>
          <span class="wa-avatar">P</span>
          <span class="wa-contact"><strong>{{ contacto }}</strong><small>Cuenta de empresa</small></span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z"/></svg>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.2 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.2.2 2.4.6 3.6a1 1 0 0 1-.3 1z"/></svg>
        </header>
        <div class="wa-chat">
          <span class="wa-day">HOY</span>
          <span class="wa-notice">Esta empresa usa un servicio seguro de Meta para administrar este chat.</span>
          <div class="wa-bubble">
            <p [innerHTML]="html"></p>
            <span class="wa-time">{{ hora }}</span>
          </div>
        </div>
        <footer class="wa-input">
          <span class="wa-field">Mensaje</span>
          <span class="wa-mic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1A7 7 0 0 0 19 12z"/></svg></span>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    :host { display: flex; justify-content: center; }
    .phone { width: 300px; padding: 10px; border-radius: 38px; background: #1c1c1e; box-shadow: 0 18px 40px rgba(0, 0, 0, .28), inset 0 0 0 2px #3a3a3c; }
    .phone-screen { display: flex; flex-direction: column; height: 600px; overflow: hidden; border-radius: 29px; background: #efeae2; font-family: Roboto, "Segoe UI", Helvetica, Arial, sans-serif; color: #111b21; }
    .status-bar { display: flex; justify-content: space-between; align-items: center; padding: 8px 20px 4px; background: #008069; color: #fff; font-size: 11px; font-weight: 600; }
    .status-icons { display: flex; align-items: flex-end; gap: 3px; }
    .status-icons i { width: 3px; height: 6px; background: #fff; border-radius: 1px; }
    .status-icons i + i { height: 9px; }
    .status-icons b { width: 18px; height: 9px; margin-left: 3px; border: 1.5px solid #fff; border-radius: 2px; background: linear-gradient(90deg, #fff 70%, transparent 70%); }
    .wa-header { display: flex; align-items: center; gap: 8px; padding: 6px 10px 9px; background: #008069; color: #fff; }
    .wa-header svg { flex: none; width: 19px; height: 19px; fill: #fff; }
    .wa-avatar { display: grid; flex: none; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: #25cad2; color: #063a3e; font-weight: 800; font-size: 14px; }
    .wa-contact { display: grid; flex: 1; min-width: 0; line-height: 1.2; }
    .wa-contact strong { overflow: hidden; font-size: 13.5px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .wa-contact small { font-size: 10.5px; opacity: .85; }
    .wa-chat { display: flex; flex: 1; flex-direction: column; align-items: flex-start; gap: 7px; padding: 10px 9px; overflow-y: auto;
      background-color: #efeae2; background-image: radial-gradient(rgba(0, 0, 0, .035) 1.2px, transparent 1.2px); background-size: 15px 15px; }
    .wa-day { align-self: center; padding: 4px 9px; border-radius: 7px; background: #fff; color: #54656f; font-size: 10.5px; box-shadow: 0 1px .5px rgba(11, 20, 26, .13); }
    .wa-notice { align-self: center; max-width: 88%; padding: 5px 9px; border-radius: 7px; background: #ffeecd; color: #54656f; font-size: 10px; line-height: 1.35; text-align: center; }
    .wa-bubble { position: relative; max-width: 88%; padding: 6px 8px 17px 9px; border-radius: 0 8px 8px 8px; background: #fff; box-shadow: 0 1px .5px rgba(11, 20, 26, .13); }
    .wa-bubble::before { content: ""; position: absolute; top: 0; left: -7px; border-top: 0 solid transparent; border-right: 8px solid #fff; border-bottom: 9px solid transparent; }
    .wa-bubble p { margin: 0; font-size: 13px; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
    .wa-time { position: absolute; right: 8px; bottom: 4px; color: #667781; font-size: 10px; }
    .wa-input { display: flex; align-items: center; gap: 6px; padding: 6px 7px 10px; background: transparent; }
    .wa-field { flex: 1; padding: 9px 14px; border-radius: 20px; background: #fff; color: #8696a0; font-size: 13px; }
    .wa-mic { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; background: #00a884; }
    .wa-mic svg { width: 19px; height: 19px; fill: #fff; }
  `],
})
export class VistaWhatsappComponent implements OnChanges {
  @Input() texto = '';
  @Input() contacto = 'Purifika';
  html = '';
  hora = horaActual();

  ngOnChanges(): void {
    this.html = formatoWhatsApp(this.texto);
    this.hora = horaActual();
  }
}

// Simulación del correo abierto en una bandeja tipo Gmail: asunto, remitente, destinatario y
// el cuerpo HTML real que se envía (tabla de facturas, recuadro de transferencia, eslogan).
@Component({
  selector: 'app-vista-correo',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="mail-app" role="img" [attr.aria-label]="'Vista en la bandeja de correo: ' + asunto">
      <div class="mail-topbar">
        <span class="mail-brand"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5z"/></svg> Correo</span>
        <span class="mail-search">Buscar en el correo</span>
        <span class="mail-me">{{ inicial(destinatario) }}</span>
      </div>
      <div class="mail-toolbar" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/></svg>
        <svg viewBox="0 0 24 24"><path d="M20.5 5.2 19.1 3.5A1.5 1.5 0 0 0 18 3H6a1.5 1.5 0 0 0-1.1.5L3.5 5.2A2 2 0 0 0 3 6.5V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.5a2 2 0 0 0-.5-1.3zM12 17.5 6.5 12H10v-2h4v2h3.5zM5.1 5l.8-1h12l.9 1z"/></svg>
        <svg viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/></svg>
        <svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5z"/></svg>
      </div>
      <div class="mail-subject">
        <h3>{{ asunto }}</h3>
        <span class="mail-label">Recibidos</span>
      </div>
      <div class="mail-sender">
        <span class="mail-avatar">{{ inicial(remitenteNombre) }}</span>
        <span class="mail-from">
          <span class="mail-from-line"><strong>{{ remitenteNombre }}</strong><small>&lt;{{ remitenteCorreo }}&gt;</small></span>
          <small>para {{ destinatario }}</small>
        </span>
        <small class="mail-date">{{ fecha }}</small>
      </div>
      <iframe #cuerpo class="mail-body" title="Cuerpo del correo" sandbox="allow-same-origin" [srcdoc]="srcdoc" [style.height.px]="alto" (load)="ajustarAlto()"></iframe>
      <div class="mail-actions" aria-hidden="true"><span>Responder</span><span>Reenviar</span></div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .mail-app { overflow: hidden; border: 1px solid #dadce0; border-radius: 14px; background: #fff; color: #202124; font-family: Roboto, "Segoe UI", Helvetica, Arial, sans-serif; box-shadow: 0 8px 24px rgba(0, 0, 0, .14); }
    .mail-topbar { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #f6f8fc; }
    .mail-brand { display: flex; align-items: center; gap: 6px; color: #5f6368; font-size: 15px; }
    .mail-brand svg { width: 22px; height: 22px; fill: #d93025; }
    .mail-search { flex: 1; max-width: 420px; padding: 8px 14px; border-radius: 20px; background: #e9eef6; color: #5f6368; font-size: 12.5px; }
    .mail-me { display: grid; place-items: center; width: 28px; height: 28px; margin-left: auto; border-radius: 50%; background: #7a5bc4; color: #fff; font-size: 12px; font-weight: 600; }
    .mail-toolbar { display: flex; gap: 18px; padding: 8px 18px; border-bottom: 1px solid #eceff1; }
    .mail-toolbar svg { width: 17px; height: 17px; fill: #5f6368; }
    .mail-subject { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 16px 20px 6px 64px; }
    .mail-subject h3 { margin: 0; font-size: 19px; font-weight: 400; line-height: 1.3; }
    .mail-label { padding: 1px 6px; border-radius: 4px; background: #ddd; color: #444; font-size: 11px; }
    .mail-sender { display: flex; align-items: flex-start; gap: 12px; padding: 10px 20px 6px; }
    .mail-avatar { display: grid; flex: none; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: #25cad2; color: #063a3e; font-weight: 700; }
    .mail-from { display: grid; flex: 1; min-width: 0; gap: 1px; font-size: 13px; }
    .mail-from small { color: #5f6368; font-size: 11.5px; }
    .mail-from-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 6px; }
    .mail-date { color: #5f6368; font-size: 11.5px; white-space: nowrap; }
    .mail-body { display: block; width: 100%; min-height: 200px; border: 0; background: #fff; }
    .mail-actions { display: flex; gap: 10px; padding: 12px 20px 18px 64px; }
    .mail-actions span { padding: 7px 16px; border: 1px solid #747775; border-radius: 18px; color: #444746; font-size: 12.5px; }
    @media (max-width: 600px) { .mail-subject, .mail-actions { padding-left: 20px; } .mail-search { display: none; } }
  `],
})
export class VistaCorreoComponent implements OnChanges {
  @Input() asunto = '';
  @Input() html = '';
  @Input() remitenteNombre = 'Cobranza Purifika';
  @Input() remitenteCorreo = '';
  @Input() destinatario = '';
  @ViewChild('cuerpo') cuerpo?: ElementRef<HTMLIFrameElement>;
  srcdoc: SafeHtml = '';
  alto = 480;
  fecha = '';

  constructor(private readonly sanitizer: DomSanitizer) {}

  ngOnChanges(): void {
    // El HTML lo arma el backend escapando cada dato; el iframe no permite scripts.
    this.srcdoc = this.sanitizer.bypassSecurityTrustHtml(this.html);
    const ahora = new Date();
    this.fecha = `${ahora.getDate()} ${MESES[ahora.getMonth()]}, ${horaActual()}`;
  }

  // Ajusta el iframe al alto del correo para que se lea completo, sin doble scroll; se
  // recalcula si cambia el ancho (el texto ocupa más líneas en pantallas angostas). Se mide el
  // body, que a diferencia del documento también se encoge.
  @HostListener('window:resize')
  ajustarAlto(): void {
    const cuerpo = this.cuerpo?.nativeElement.contentDocument?.body;
    if (cuerpo) this.alto = Math.max(200, Math.ceil(cuerpo.scrollHeight));
  }

  inicial(texto: string): string {
    return (texto.trim()[0] ?? '?').toUpperCase();
  }
}
