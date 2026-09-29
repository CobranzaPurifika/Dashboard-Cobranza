import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

const MONTHS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

interface CalendarCell { date: string; day: number; inMonth: boolean; disabled: boolean }

// Calendario de un solo día con el mismo formato que "Marcar incidencia en lote" (semana de
// lunes a domingo, días redondos, seleccionado en turquesa), en línea bajo el campo en vez de
// flotante para que no lo recorte el scroll del diálogo. Valor vacío = "Por definir".
@Component({
  selector: 'app-date-picker',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <button type="button" class="date-trigger" [class.empty]="!value" [attr.aria-expanded]="open" (click)="toggle()">
      <ion-icon name="calendar-outline"></ion-icon>
      <span>{{ value ? longLabel(value) : placeholder }}</span>
      <ion-icon class="chevron" [name]="open ? 'chevron-up-outline' : 'chevron-down-outline'"></ion-icon>
    </button>
    @if (open) {
      <div class="date-calendar">
        <div class="date-cal-header">
          <button type="button" aria-label="Mes anterior" (click)="shiftMonth(-1)"><ion-icon name="chevron-back-outline"></ion-icon></button>
          <span>{{ monthLabel }}</span>
          <button type="button" aria-label="Mes siguiente" (click)="shiftMonth(1)"><ion-icon name="chevron-forward-outline"></ion-icon></button>
        </div>
        <div class="date-cal-weekdays"><span>Lu</span><span>Ma</span><span>Mi</span><span>Ju</span><span>Vi</span><span>Sá</span><span>Do</span></div>
        <div class="date-cal-grid">
          @for (cell of cells; track cell.date) {
            <button type="button" class="date-cal-day" [class.out-of-month]="!cell.inMonth" [class.selected]="cell.date === value"
              [class.today]="cell.date === today" [disabled]="cell.disabled" [attr.aria-label]="longLabel(cell.date)" (click)="pick(cell.date)">{{ cell.day }}</button>
          }
        </div>
        @if (value) { <button type="button" class="date-clear" (click)="pick('')">Quitar fecha ({{ placeholder }})</button> }
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .date-trigger { display: flex; width: 100%; align-items: center; gap: 8px; padding: 9px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--input); color: var(--ink); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
    .date-trigger.empty span { color: var(--muted); }
    .date-trigger ion-icon { flex: none; color: var(--accent-strong); font-size: 15px; }
    .date-trigger .chevron { margin-left: auto; color: var(--muted); font-size: 12px; }
    .date-calendar { margin-top: 6px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-soft); user-select: none; }
    .date-cal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; color: var(--ink); font-size: 10px; font-weight: 800; letter-spacing: .06em; }
    .date-cal-header button { display: grid; width: 28px; height: 28px; padding: 0; place-items: center; border: 0; border-radius: 50%; background: transparent; color: var(--accent-strong); cursor: pointer; }
    .date-cal-header button:hover { background: var(--surface-hover); }
    .date-cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 4px; color: var(--muted); font-size: 10px; font-weight: 700; text-align: center; }
    .date-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
    .date-cal-day { display: grid; place-items: center; aspect-ratio: 1; max-height: 38px; border: 0; border-radius: 999px; background: transparent; color: var(--ink-soft); font: inherit; font-size: 10px; font-weight: 600; cursor: pointer; }
    .date-cal-day:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 20%, transparent); }
    .date-cal-day.out-of-month { color: var(--muted); opacity: .35; }
    .date-cal-day.today { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 60%, transparent); }
    .date-cal-day:disabled { color: var(--muted); opacity: .35; cursor: default; }
    .date-cal-day.selected { background: var(--accent); color: #07373a; font-weight: 800; }
    .date-clear { display: block; width: 100%; margin-top: 8px; padding: 7px; border: 1px dashed var(--line); border-radius: 8px; background: transparent; color: var(--accent-strong); font: inherit; font-size: 10px; font-weight: 700; cursor: pointer; }
  `],
})
export class DatePickerComponent implements OnChanges {
  @Input() value = '';
  @Input() min = '';
  @Input() placeholder = 'Por definir';
  @Output() valueChange = new EventEmitter<string>();

  open = false;
  readonly today = todayMexico();
  private year = 0;
  private month = 0;

  ngOnChanges(): void {
    if (!this.year) this.showMonthOf(this.value || this.min || this.today);
  }

  get monthLabel(): string {
    return `${MONTHS[this.month]} ${this.year}`;
  }

  get cells(): CalendarCell[] {
    const first = new Date(Date.UTC(this.year, this.month, 1));
    const offset = (first.getUTCDay() + 6) % 7;
    const count = Math.ceil((offset + new Date(Date.UTC(this.year, this.month + 1, 0)).getUTCDate()) / 7) * 7;
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(Date.UTC(this.year, this.month, 1 - offset + index));
      const iso = date.toISOString().slice(0, 10);
      return { date: iso, day: date.getUTCDate(), inMonth: date.getUTCMonth() === this.month, disabled: Boolean(this.min) && iso < this.min };
    });
  }

  toggle(): void {
    this.open = !this.open;
    if (this.open) this.showMonthOf(this.value || this.min || this.today);
  }

  shiftMonth(delta: number): void {
    const date = new Date(Date.UTC(this.year, this.month + delta, 1));
    this.year = date.getUTCFullYear();
    this.month = date.getUTCMonth();
  }

  pick(date: string): void {
    this.value = date;
    this.valueChange.emit(date);
    this.open = false;
  }

  // "2026-10-14" -> "Miércoles 14 de octubre de 2026" (mismo texto que irá en el documento).
  longLabel(iso: string): string {
    const [year, month, day] = iso.split('-').map(Number);
    const weekday = DAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
    return `${weekday} ${day} de ${MONTHS[month - 1].toLowerCase()} de ${year}`;
  }

  private showMonthOf(iso: string): void {
    const [year, month] = iso.split('-').map(Number);
    this.year = year;
    this.month = month - 1;
  }
}

function todayMexico(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values['year']}-${values['month']}-${values['day']}`;
}
