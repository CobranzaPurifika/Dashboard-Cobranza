# Despliegue inicial sin costo

La aplicación se entrega como un solo contenedor: el proceso Express sirve la API, el dashboard
y el archivo público de configuración. Render Free puede dormir cuando no hay tráfico; por eso los
horarios de Drive se ejecutan de forma independiente mediante GitHub Actions.

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

## 3. Secretos de GitHub Actions

Configurar estos secretos en el repositorio. No escribir sus valores en archivos versionados:

| Secreto | Uso |
| --- | --- |
| `DATABASE_URL` | Conexión de servicio a Postgres/Supabase |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Correo con acceso de lectura a los archivos |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Llave privada completa de la cuenta de servicio |

El workflow `.github/workflows/drive-imports.yml` ejecuta BDD a las 10:00, 13:00 y 16:00, y Pagos
a las 17:00 de Ciudad de México. También admite una ejecución manual por fuente. Cada corrida tiene
un límite de cinco minutos y no genera artefactos.

Crear además la variable del repositorio `DRIVE_IMPORTS_ENABLED=false`. Las corridas manuales
seguirán disponibles, pero las programadas permanecerán omitidas hasta completar la primera
validación.

Si cualquiera de las tres BDD está vacía, el lote queda `skipped`: no cambia clientes, facturas ni
pagos, y la siguiente corrida vuelve a leer los mismos archivos.

Mantener el límite de gasto de GitHub Actions en cero. En un repositorio privado de GitHub Free,
las cuatro corridas cortas diarias permanecen holgadamente dentro de las 2,000 minutos incluidas.

## 4. Variables de Render Free

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Misma conexión de Supabase |
| `SUPABASE_URL` | URL pública del proyecto |
| `SUPABASE_ANON_KEY` | Clave pública para iniciar sesión |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Necesaria para el botón manual |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Necesaria para el botón manual |
| `IMPORT_SCHEDULER_ENABLED` | Siempre `false` en Render Free |
| `FRONTEND_ORIGIN` | URL pública de Render |

Render asigna `PORT`; no es necesario configurarlo. El almacenamiento local es efímero y no se
usa para datos de negocio.

## 5. Primera validación

1. Desplegar Render Free con `IMPORT_SCHEDULER_ENABLED=false`.
2. Abrir `/api/health` y confirmar `{ "ok": true }`.
3. Esperar a que las tres pestañas BDD contengan datos.
4. Ejecutar manualmente el workflow con fuente `bdd`.
5. Confirmar que la corrida diga `applied`; si dice `skipped`, no forzarla.
6. Ejecutar el workflow con fuente `pagos` o usar **Actualizar datos ahora** como administrador.
7. Revisar las tres franquicias, los clientes `Pendiente de validar` y los totales contra Drive.
8. Cambiar `DRIVE_IMPORTS_ENABLED=true` para habilitar las cuatro corridas diarias.

Si BDD informa `skipped`, no forzar la actualización: revisar la franquicia y la caída indicada en
la bitácora de importaciones.

## Limitaciones aceptadas del nivel gratuito

- La primera apertura de la app puede tardar cerca de un minuto mientras Render despierta.
- GitHub Actions puede iniciar una corrida programada algunos minutos después de la hora objetivo.
- Supabase puede pausar proyectos gratuitos con actividad insuficiente; las consultas y cargas
  diarias normalmente mantienen este proyecto activo.
