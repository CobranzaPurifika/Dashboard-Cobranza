const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const AGENDA_HOUR = /^(09|1[0-8]):00$/;

function normalized(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function isCallLaterStatus(status) {
  const value = normalized(status?.value).replace(/[^a-z0-9]+/g, "_");
  return value === "llamar_mas_tarde" || normalized(status?.label) === "llamar mas tarde";
}

export function validateAgenda({ fechaISO, hora } = {}) {
  if (!ISO_DATE.test(String(fechaISO ?? ""))) return "fechaISO debe usar YYYY-MM-DD";

  const parsed = new Date(`${fechaISO}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== fechaISO) {
    return "fechaISO no es una fecha válida";
  }

  if (!AGENDA_HOUR.test(String(hora ?? ""))) {
    return "hora debe ser un bloque entre 09:00 y 18:00";
  }

  return null;
}

export function buildAgendaDetail({ fechaISO, hora, nota }) {
  const [year, month, day] = fechaISO.split("-").map(Number);
  const fecha = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(year, month - 1, day)))
    .replace(".", "")
    .replace(/[-/]/g, " ");

  return `Contactar el ${fecha}, ${hora} hrs${nota ? ` — ${nota}` : ""}`;
}
