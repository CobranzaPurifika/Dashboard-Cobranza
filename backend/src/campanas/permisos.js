// Quién puede usar cada ruta del módulo Campañas.
// - Administrador: todo el módulo (algunas rutas lo exigen además en la propia ruta).
// - Gestor: WhatsApp (lote y registro de envíos), Directorio de contactos e Historial. No
//   envía correos ni ve las plantillas.
// - Supervisor: solo consulta el Historial y las Plantillas, incluida su vista previa.
const PERMISOS = {
  gestor: new Set([
    "GET /lote",
    "POST /envios",
    "DELETE /envios",
    "GET /envios",
    "GET /contactos",
    "PUT /contactos",
    "GET /contactos/plantilla",
  ]),
  supervisor: new Set([
    "GET /envios",
    "GET /plantillas",
    "POST /plantillas/vista-previa",
  ]),
};

export function puedeUsarCampanas(rol, metodo, ruta) {
  if (rol === "admin") return true;
  const limpia = ruta.length > 1 ? ruta.replace(/\/+$/, "") : ruta;
  return Boolean(PERMISOS[rol]?.has(`${metodo.toUpperCase()} ${limpia}`));
}
