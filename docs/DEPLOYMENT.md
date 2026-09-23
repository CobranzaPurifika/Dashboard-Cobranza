# Despliegue inicial sin costo

La aplicación se entrega como un solo contenedor: el proceso Express sirve la API, el dashboard
y el archivo público de configuración. No hay corridas automáticas de Drive: BDD y Pagos solo se
releen cuando un administrador presiona el botón **Actualizar datos ahora**.

## 1. Preparar Supabase

Ejecutar, en orden, **todas** las migraciones de `supabase/migrations/` desde el SQL Editor del proyecto.
La última migración requerida actualmente es
`20260907120000_dashboard_management_polish.sql`; incluye los cortes usados por los
deltas del Dashboard y las tablas de Gestiones acumuladas del mes.

El registro del administrador debe existir en `app_users`, con el mismo UUID de `auth.users` y
`role = 'admin'`. El registro público de nuevas cuentas debe permanecer desactivado.

Para crear la primera cuenta, usar **Authentication → Users → Add user** en Supabase, marcarla
como confirmada y después ejecutar en SQL Editor (cambiando únicamente el correo si aplica):

```sql
insert into public.app_users (id, email, display_name, role, active)
select id, email, 'Administrador', 'admin', true
from auth.users
where lower(email) = lower('cobranza.ags@purifika.com')
on conflict (id) do update
set email = excluded.email,
    display_name = excluded.display_name,
    role = 'admin',
    active = true,
    updated_at = now();
```

Si la consulta no inserta ninguna fila, el correo todavía no existe en Supabase Auth. La
contraseña se crea o restablece en Authentication; no se guarda en `app_users` ni en Render.

## 2. Preparar Google Drive

Crear o reutilizar una cuenta de servicio de Google con acceso de lectura y compartir con su correo
los cuatro archivos configurados en `backend/src/imports/config.js`. No compartir una carpeta
distinta ni cargar copias: la aplicación siempre relee esos mismos documentos.

## 3. Variables de Render Free

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Misma conexión de Supabase |
| `SUPABASE_URL` | URL pública del proyecto |
| `SUPABASE_ANON_KEY` | Clave pública para iniciar sesión |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Necesaria para el botón manual |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Necesaria para el botón manual |
| `IMPORT_SCHEDULER_ENABLED` | Habilita el corte mensual interno; siempre `false` en Render Free |
| `FRONTEND_ORIGIN` | URL pública de Render |

Render asigna `PORT`; no es necesario configurarlo. El almacenamiento local es efímero y no se
usa para datos de negocio.

## 4. Primera validación

1. Desplegar Render Free con `IMPORT_SCHEDULER_ENABLED=false`.
2. Abrir `/api/health` y confirmar `{ "ok": true }`.
3. Esperar a que las tres pestañas BDD y la de Pagos contengan datos.
4. Como administrador, presionar **Actualizar datos ahora**.
5. Confirmar que la corrida diga `applied`; si dice `skipped`, revisar el motivo antes de reintentar.
6. Revisar las tres franquicias, los clientes `Fuera de cartera` y los totales contra Drive.

Si la corrida informa `skipped`, no forzar la actualización: revisar la franquicia y la caída
indicada en la bitácora de importaciones.

## Limitaciones aceptadas del nivel gratuito

- La primera apertura de la app puede tardar cerca de un minuto mientras Render despierta.
- Supabase puede pausar proyectos gratuitos con actividad insuficiente; las consultas y cargas
  diarias normalmente mantienen este proyecto activo.
