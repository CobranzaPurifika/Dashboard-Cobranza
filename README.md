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
- **`frontend/`** — app Ionic + Angular standalone que consume la API. Cubre KPIs,
  las gráficas del dashboard original (dona de antigüedad de saldos, embudo de gestión,
  distribución de estatus, segmentación, cobertura del mes, recuperación mensual y tendencia
  de cartera vencida — ver `frontend/src/app/core/charts.ts`), Prioridad de contacto,
  Seguimiento, Lista negra y ficha lateral con la bitácora
  de gestión por cliente. Quien tenga el enlace entra sin cuenta y solo puede consultar métricas
  agregadas de todas las franquicias, sin clientes identificables. El administrador inicia sesión
  con correo y contraseña de Supabase Auth y entra directamente a Prioridad de contacto; su perfil
  incluye las tareas de gestor.
- **Base de datos**: Supabase Postgres (proyecto `Gestion_Cobranza`), tablas `clientes`,
  `facturas`, `pagos`, `gestion_timeline`, `blacklist`, `status_gestion`, `kpi_snapshots`,
  `vencida_snapshots`, `portfolio_snapshots`, `management_daily_goals` y
  `management_day_incidents`. RLS activado sin políticas públicas — solo el backend (vía `DATABASE_URL`
  con credenciales de servicio) tiene acceso; nunca exponer esa cadena de conexión al frontend.

## Desarrollo local

```bash
cd backend && cp .env.example .env   # completar DATABASE_URL con la contraseña real
npm install
npm run dev        # API en :3001

cd ../frontend
npm install
npm start          # Ionic + Angular en :5173; por defecto apunta a localhost:3001/api
```

En producción `/config.js` lo genera el backend a partir de `SUPABASE_URL` y
`SUPABASE_ANON_KEY`; esas dos variables son públicas por diseño y nunca deben confundirse con
`DATABASE_URL`. El contenedor compila Ionic/Angular y copia el resultado estático junto a la API.

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
Al enviarlos a Lista negra se desactivan la agenda y la promesa que existían en ese momento;
las entradas históricas de gestión no se modifican ni se borran. Mientras permanezcan ahí se
pueden registrar gestiones nuevas con normalidad, incluidas nuevas agendas o promesas que sí
volverán a aparecer en Seguimiento, aunque el cliente seguirá fuera de la cola normal de Prioridad.
El motivo es texto libre obligatorio. La lista compacta muestra nombre, franquicia y motivo;
el alta y el retiro se realizan únicamente desde la ficha del cliente.

## Campañas de cobranza

La pestaña **Campañas** (admin y gestor) arma el lote diario de recordatorios desde la BDD de
Drive:
- preventivo a clientes al corriente cuya factura vence en 5 días o menos;
- correctivo semanal a clientes de 1-30 días: días 7, 15, 21 y fin de mes;
- lista de escalamiento para 31 días o más.

Residenciales por WhatsApp asistido y comerciales autorizados por correo, con directorio de
contactos editable. Los mensajes se personalizan por cliente y franquicia (facturas pendientes,
datos de transferencia), salen de plantillas que un administrador edita y se pueden revisar y
ajustar uno por uno antes de enviar. No escribe en la cartera ni en la bitácora de gestión. Reglas, formato del
archivo del portal y configuración en [`docs/CAMPANAS.md`](docs/CAMPANAS.md).

## Documentos formales de cobranza

La ficha del cliente tiene tres acciones: **Ver facturas**, **Generar documento** y **Lista
negra** (solo ícono). Generar documento produce, sin IA ni servicios externos, los tres PDF de la
skill `documentos-purifika` con el mismo formato de marca: aviso de deuda (carta), aviso de
retiro de equipos y acuerdo/propuesta de pagos (oficio, con campo de firma electrónica del
cliente). El backend (`backend/src/documents/`) dibuja el PDF con `pdfkit` y compacta el
espaciado hasta que cabe en una sola página; el nombre del archivo sigue el patrón
`<Prefijo>_<Tipo>_<Cliente>_<AAAA-MM-DD>.pdf`.

Montos, folios y fechas de factura salen siempre de la base, no del navegador. Solo para los
documentos, el vencimiento es la fecha de facturación más los días de crédito (columna K de la BDD
cruda) y los días de atraso se cuentan a la fecha del documento; no se usan los días de la BDD
porque las facturas con pago parcial llegan con 0 aunque estén vencidas. Si el prefijo de los
folios no coincide con la franquicia del cliente, se usan los datos bancarios de la franquicia
de las facturas y se avisa en pantalla. El papel es fijo por tipo. El aviso de deuda puede incluir
una nota de mantenimiento pendiente (casilla, texto editable). La fecha de retiro sin capturar se
imprime como “Por definir” y el retiro no lleva horario. En el acuerdo se puede otorgar una
bonificación (se descuenta del adeudo y se muestra en el PDF); el neto se reparte por número de
facturas, de la más antigua a la más reciente (la última lleva menos si no alcanza parejo). Al
editar un importe, la siguiente parcialidad absorbe la diferencia y una factura puede quedar
dividida entre dos pagos. Generar un documento no registra gestión ni modifica al cliente. La fuente
Carlito (equivalente métrico de Calibri) se distribuye bajo SIL OFL 1.1
(`backend/src/documents/assets/fonts/OFL.txt`).

## Sincronización de Drive

El backend relee siempre los tres archivos fijos de Antigüedad de Saldos (pestaña inicial `BDD`)
y el archivo fijo de Pagos mes en curso (pestaña inicial `PAGOS`). No hay corridas automáticas ni
programadas: la única forma de actualizar es que un administrador presione el botón **Actualizar
datos ahora**, que exige que las tres antigüedades y Pagos tengan datos válidos antes de aplicar
nada.

La consolidación BDD es atómica para las tres franquicias: si alguna solo tiene encabezados o no
contiene cartera válida, o si Pagos no tiene datos válidos, no se aplica ningún cambio. Si la caída
de clientes o saldo respecto a la corrida anterior supera el 20%, no se aborta en silencio: el
administrador ve un aviso con el detalle y decide si aplicar de todas formas o detener la
actualización. Los pagos recién subidos se aplican antes de decidir qué hacer con cada cliente
ausente: si tiene evidencia completa de pago pasa a liquidado; si no, pasa de inmediato a
`Fuera de cartera` (sale de cartera, Seguimiento y Lista negra en esa misma corrida, sin esperar
una revisión posterior), pero conserva pagos, gestiones y notas.

Para producción, el repositorio incluye un contenedor único que sirve frontend y API, además de
verificación automática en cada pull request. La secuencia completa de migración, variables y
primera carga controlada está en [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Interfaz

La navegación reproduce la estructura del Artifact: Dashboard/Gestión, selector de franquicia,
tema claro/oscuro y modo presentación. El acceso autenticado abre Prioridad de contacto; desde
ahí se consultan Seguimiento, Agendados, Lista negra y la ficha completa del cliente. El acceso
por enlace permanece limitado a métricas agregadas.

Los tres KPI de cartera comparan contra el último corte mensual real anterior al mes en curso;
si falta un campo histórico, su delta no se muestra. La dona de saldos permite alternar entre
cartera completa y solo vencida. Recuperación alterna entre semana (lunes o inicio de mes) y mes
calendario usando el historial de `pagos`.

En Gestión, las tres listas usan scroll interno y comparten el alto visible de la página. La fila
de Prioridad no abre accidentalmente el detalle: la acción explícita es **Gestionar**. El panel
lateral **Gestiones del mes** calcula clientes únicos por día hábil, limita el cumplimiento diario
al 100%, excluye sábados y domingos y permite justificar un día mediante una incidencia.
