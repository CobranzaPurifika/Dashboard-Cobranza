export function reportMonthOptions(now = new Date()): { value: string; label: string }[] {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value);
  return Array.from({ length: 3 }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 1 - i, 1));
    const text = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(date).replace(' de ', ' ');
    return { value: date.toISOString().slice(0, 7), label: text[0].toUpperCase() + text.slice(1) + (i === 0 ? ' (en curso)' : '') };
  });
}
