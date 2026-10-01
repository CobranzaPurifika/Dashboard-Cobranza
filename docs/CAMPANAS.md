# Módulo Campañas — cobranza preventiva y correctiva

Pestaña **Campañas** (admin y gestor). Arma cada día el lote de recordatorios a partir de la
BDD de Drive y lo envía de forma asistida: WhatsApp para residenciales y correo para
comerciales autorizados. Es independiente del resto de la app.

## Reglas

| Regla | A quién | Cuándo | Canal |
| --- | --- | --- | --- |
| Preventivo | Cliente al corriente con una factura que vence en 5 días o menos | Todos los días, desde 5 días antes hasta el vencimiento. Un recordatorio por factura | WhatsApp (residencial) / correo (comercial autorizado) |
| Correctivo | Atraso máximo de 1 a 30 días | 1er recordatorio del día 7 al 14; 2do del 15 a fin de mes. Si el 7 o el 15 caen en fin de semana, la ventana abre el siguiente día hábil | Igual que preventivo |
| Escalamiento | Atraso máximo de 31 días o más | Siempre visible | Sin mensaje masivo: gestión puntual. Documento sugerido: Aviso de deuda (31-60) o Aviso de retiro / Acuerdo de pagos (+60), desde la ficha del cliente |

- **Vencimiento** = fecha de facturación (columna I) + días de crédito (columna K) de la BDD.
  No se usan los "Días Vencida" de la BDD porque llegan en 0 en facturas con pago parcial.
  Una factura sin días de crédito usa sus "Días Vencida" y no entra al preventivo.
- **Exclusiones** de los mensajes masivos: lista negra, promesa de pago vigente y facturas con
  un pago registrado en Pagos desde 3 días antes de la última modificación de la BDD.
- **Ventanas en lugar de un día exacto**: si nadie entra justo el día 7, el recordatorio
  sigue pendiente hasta el 14. Un cliente nunca recibe dos veces el mismo recordatorio
  (llave única por factura en preventivo y por mes + recordatorio en correctivo).
- Las plantillas siguen la skill `cobranza-purifika`: tono amable (mora temprana), datos
  bancarios de la franquicia correcta, contacto de escalamiento y, en correo, el eslogan.

## Propiedad de datos

| Dominio | Fuente de verdad | Puede modificar |
| --- | --- | --- |
| Campañas | Módulo Campañas | `campana_contactos` y `campana_envios` |

1. El módulo **lee** la BDD directamente de Drive (solo lectura, caché de 10 minutos; el botón
   *Actualizar BDD* fuerza la lectura). No aplica la BDD ni pasa por el botón Actualizar.
2. No escribe en `clientes`, `facturas`, `pagos` ni `gestion_timeline`: los recordatorios no
   cuentan en Gestiones del mes, metas por franquicia ni el embudo de gestión.
3. Si la BDD de Drive tiene más de un día sin modificarse, el lote se muestra con aviso.
4. El lote se calcula al abrir la pestaña, así que no depende del scheduler.

## Envío

- **WhatsApp (asistido)**: *Enviar* abre WhatsApp con el mensaje listo y lo registra; el gestor
  lo envía desde su propio WhatsApp. *Deshacer* elimina el registro (solo el mismo día y el
  mismo usuario).
- **Correo**: se seleccionan los comerciales del lote y se envían desde la cuenta de cobranza
  por SMTP. Antes de enviar se reserva el registro, para que dos personas no manden el mismo
  correo; si el servidor de correo lo rechaza, se libera. Los correos quedan en *Enviados* de
  la cuenta y las respuestas con comprobante llegan a su bandeja.

## Directorio de contactos

Lista todos los clientes vigentes de la BDD con teléfono, correo y la casilla **Recibe correo**
(solo comerciales). La llave es franquicia + Grupo De Facturación.

**Carga inicial desde el portal** (botón *Cargar desde portal*, solo admin): Google Sheet en
Drive compartida con la cuenta de servicio, con estas columnas en la primera hoja:

| Franquicia | Grupo De Facturación | Teléfono | Correo | Recibe Correo |
| --- | --- | --- | --- | --- |
| AGS / CUN / MID (o el nombre de la ciudad) | Igual que en la BDD | 10 dígitos | uno o varios, separados por `;` | Sí / No (opcional) |

- Agrega clientes nuevos y actualiza los que vinieron del portal.
- **Nunca sobrescribe un contacto editado en el módulo.**
- Reporta las filas omitidas (franquicia no reconocida, sin teléfono ni correo válidos).

## Configuración (variables del backend)

| Variable | Uso |
| --- | --- |
| `CAMPANAS_SMTP_USER` | Cuenta que envía (`cobranza.ags@purifika.com`) |
| `CAMPANAS_SMTP_PASSWORD` | Contraseña de aplicación de Google para esa cuenta (requiere verificación en dos pasos) |
| `CAMPANAS_SMTP_HOST` / `CAMPANAS_SMTP_PORT` | Opcionales; por defecto `smtp.gmail.com` / `465` |
| `CAMPANAS_REMITENTE_NOMBRE` | Opcional; por defecto "Cobranza Purifika" |
| `CAMPANAS_CONTACTOS_FILE_ID` | ID del Google Sheet del portal |

Sin las variables SMTP la pestaña funciona y el correo se muestra deshabilitado.

La migración `supabase/migrations/20261002090000_campanas_cobranza.sql` crea las dos tablas.
