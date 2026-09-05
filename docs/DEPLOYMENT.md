# Despliegue inicial

La aplicación se entrega como un solo contenedor: el proceso Express sirve la API, el dashboard
y el archivo público de configuración. Debe ejecutarse en una instancia persistente para que las
sincronizaciones programadas de Drive ocurran a las 10:00, 13:00, 16:00 y 17:00 de Ciudad de
México.

## 1. Preparar Supabase

Ejecutar, en orden, las migraciones de `supabase/migrations/` desde el SQL Editor del proyecto.
La última migración requerida para la primera importación es
`20260905100000_drive_import_consolidation.sql`.

El registro del administrador debe existir en `app_users`, con el mismo UUID de `auth.users` y
`role = 'admin'`. El registro público de nuevas cuentas debe permanecer desactivado.

## 2. Preparar Google Drive

Crear o reutilizar una cuenta de servicio de Google con acceso de lectura y compartir con su correo
los cuatro archivos configurados en `backend/src/imports/config.js`. No compartir una carpeta
distinta ni cargar copias: la aplicación siempre relee esos mismos documentos.

## 3. Variables del servicio

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexión de servicio a Postgres/Supabase |
| `SUPABASE_URL` | URL pública del proyecto Supabase |
| `SUPABASE_ANON_KEY` | Clave pública para el inicio de sesión desde el navegador |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Correo de la cuenta de servicio compartida en Drive |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Llave privada; conservar saltos como `\\n` si el proveedor lo requiere |
| `IMPORT_SCHEDULER_ENABLED` | `true` en una sola instancia persistente |
| `FRONTEND_ORIGIN` | URL pública de la app; útil si después se separa el frontend |
| `PORT` | Puerto HTTP asignado por el proveedor |

Nunca guardar estos valores en GitHub ni en archivos versionados.

## 4. Primera validación

1. Desplegar con `IMPORT_SCHEDULER_ENABLED=false`.
2. Abrir `/api/health` y confirmar `{ "ok": true }`.
3. Iniciar sesión como administrador y ejecutar **Actualizar datos ahora**.
4. Confirmar que la corrida BDD diga `applied` y que Pagos reporte sus filas nuevas.
5. Revisar las tres franquicias, los clientes `Pendiente de validar` y los totales contra Drive.
6. Activar `IMPORT_SCHEDULER_ENABLED=true` solo después de aprobar el primer corte.

Si BDD informa `skipped`, no forzar la actualización: revisar la franquicia y la caída indicada en
la bitácora de importaciones.
