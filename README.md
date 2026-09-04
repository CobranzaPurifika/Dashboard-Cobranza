# Dashboard-Cobranza

Dashboard de cobranza de Purifika (Aguascalientes, Cancún, Mérida): antigüedad de saldos por
franquicia, gestión de cartera vencida y bitácora de contacto por cliente.

## Arquitectura

Migrado desde un Claude Artifact autocontenido (todo el estado vivía como JSON embebido en el
HTML y se persistía republicando el archivo completo) a una app convencional:

- **`backend/`** — API Node/Express. Toda la lectura/escritura pasa por Postgres (Supabase),
  no por un JSON congelado. BDD es la única fuente de la cartera vigente; Pagos conserva el
  historial de recuperación sin restar saldos localmente. Consulta el contrato completo en
  [`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md).
- **`frontend/`** — SPA estática (HTML/CSS/JS sin build step) que consume la API. Cubre KPIs,
  las gráficas del dashboard original (dona de antigüedad de saldos, embudo de gestión,
  distribución de estatus, segmentación, cobertura del mes, recuperación mensual y tendencia
  de cartera vencida — ver `frontend/src/charts.js`), tabla de clientes filtrable y bitácora
  de gestión por cliente. Quien tenga el enlace entra sin cuenta y solo puede consultar métricas
  agregadas de todas las franquicias, sin clientes identificables. El administrador inicia sesión
  con correo y contraseña de Supabase Auth y entra directamente a Prioridad de contacto; su perfil
  incluye las tareas de gestor.
- **Base de datos**: Supabase Postgres (proyecto `Gestion_Cobranza`), tablas `clientes`,
  `facturas`, `pagos`, `gestion_timeline`, `blacklist`, `status_gestion`, `kpi_snapshots`,
  `vencida_snapshots`. RLS activado sin políticas públicas — solo el backend (vía `DATABASE_URL`
  con credenciales de servicio) tiene acceso; nunca exponer esa cadena de conexión al frontend.

## Desarrollo local

```bash
cd backend && cp .env.example .env   # completar DATABASE_URL con la contraseña real
npm install
npm run dev        # API en :3001

cd ../frontend
cp config.example.js config.js  # completar URL y anon key públicas de Supabase
npx serve -l 5173 . # o cualquier servidor estático; el frontend apunta a localhost:3001/api
```

La única cuenta operativa se crea desde Supabase Auth y después se registra en `app_users` con
rol `admin`. Un usuario de Auth sin registro activo en `app_users` no obtiene permisos. En
Supabase Auth debe mantenerse deshabilitado el registro público.

El acceso por enlace es deliberadamente agregado y de solo lectura: las peticiones sin sesión
reciben el perfil público `lector`, pero únicamente `/api/me` y `/api/dashboard/:franchise` están
disponibles. La respuesta pública del dashboard elimina nombres y filas de pagos. Clientes, RFC,
facturas, pagos, agenda, lista negra, catálogos operativos y todos los endpoints de escritura
exigen una sesión activa en el backend.

La prioridad usa la regla del dashboard original: clientes no gestionados en la fecha actual de
`America/Mexico_City` primero; luego tramo (`+60`, `31-60`, `1-30`, al corriente) y saldo de mayor
a menor. Las promesas vigentes y aún no cumplidas no aparecen en la lista normal, pero sí se
incluyen cuando se busca explícitamente por cliente o folio. Al vencer sin un pago dentro de su
ventana, el cliente vuelve a Prioridad y aparece simultáneamente en Seguimiento como promesa
incumplida. Seguimiento también presenta los contactos agendados de la franquicia seleccionada.
El estatus “Llamar más tarde” mantiene al cliente en Prioridad y activa su fila en Agendados;
guardar cualquier otro estatus limpia esa agenda dentro de la misma transacción.
Los clientes en Lista negra se excluyen de la cola normal de Prioridad, pero siguen disponibles
al buscar explícitamente por nombre o folio y el resultado se identifica con una etiqueta.
Al enviarlos a Lista negra se desactivan la agenda y la promesa activa para retirarlos de
Seguimiento; las entradas históricas de gestión no se modifican ni se borran.
El motivo es texto libre obligatorio. La lista compacta muestra nombre, franquicia y motivo;
el alta y el retiro se realizan únicamente desde la ficha del cliente.

## Pendiente (siguiente sesión)

- Migrar el frontend estático a Ionic + Angular conservando el contrato de autenticación y API.
- Completar las interacciones restantes de Seguimiento.
- Decidir hosting (Vercel/Render para el backend + estático para el frontend, o ambos juntos)
  y configurar CI/CD.
