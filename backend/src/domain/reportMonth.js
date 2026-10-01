import { mexicoTodayISO } from "./dates.js";

export function reportMonthRange(month, now = new Date()) {
  const today = mexicoTodayISO(now);
  const [year, current] = today.split("-").map(Number);
  const allowed = Array.from({ length: 3 }, (_, i) =>
    new Date(Date.UTC(year, current - 1 - i, 1)).toISOString().slice(0, 7));
  if (typeof month !== "string" || !allowed.includes(month)) {
    const error = new Error("Mes inválido: selecciona el mes en curso o uno de los dos anteriores");
    error.statusCode = 400;
    throw error;
  }
  const [y, m] = month.split("-").map(Number);
  const isCurrent = month === today.slice(0, 7);
  return { month, desde: `${month}-01`, hasta: isCurrent ? today :
    new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10), isCurrent };
}
