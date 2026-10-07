// Quién puede usar cada ruta del módulo Campañas.
// - Administrador y gestor: todo el módulo (cada ruta puede pedir además ser admin).
// - Supervisor: solo consulta, sin enviar ni editar: Historial de recordatorios y
//   Plantillas, incluida su vista previa con un cliente ficticio.
const SOLO_LECTURA_SUPERVISOR = new Set([
  "GET /envios",
  "GET /plantillas",
  "POST /plantillas/vista-previa",
]);

export function puedeUsarCampanas(rol, metodo, ruta) {
  if (rol === "admin" || rol === "gestor") return true;
  const limpia = ruta.length > 1 ? ruta.replace(/\/+$/, "") : ruta;
  return rol === "supervisor" && SOLO_LECTURA_SUPERVISOR.has(`${metodo.toUpperCase()} ${limpia}`);
}
