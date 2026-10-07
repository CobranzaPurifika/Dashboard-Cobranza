// "Gestiones del mes" (panel de cumplimiento y reporte Excel) solo cuenta las gestiones que
// registra la cuenta de cobranza; las de otros gestores o administradores no suman. Se
// identifica por correo para no depender del id interno del usuario.
//
// Las gestiones sin usuario (created_by vacío) sí cuentan: toda gestión nueva guarda quién la
// registró, así que solo pueden venir de la carga inicial (1 y 2 de septiembre de 2026).
export const CUENTA_GESTIONES_MES = String(process.env.GESTIONES_MES_CUENTA ?? "cobranza.ags@purifika.com").trim().toLowerCase();

// Condición SQL sobre gestion_timeline (alias `alias`); `param` es el marcador del correo.
export function condicionCuentaGestiones(alias, param) {
  return `(${alias}.created_by is null or ${alias}.created_by in (select u.id from app_users u where lower(u.email) = ${param}))`;
}
