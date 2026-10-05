# Módulo Campañas — cobranza preventiva y correctiva

Pestaña **Campañas** (admin y gestor). Arma cada día el lote de recordatorios a partir de la
BDD de Drive y lo envía de forma asistida: WhatsApp para residenciales y correo para
comerciales autorizados. Es independiente del resto de la app.

## Reglas

| Regla | A quién | Cuándo | Canal |
| --- | --- | --- | --- |
| Preventivo | Cliente al corriente con una factura que vence en 5 días o menos | Todos los días, desde 5 días antes hasta el vencimiento. Un recordatorio por factura | WhatsApp (residencial) / correo (comercial autorizado) |
| Correctivo | Atraso máximo de 1 a 30 días | Semanal: recordatorios a partir de los días 7, 15, 21 y fin de mes (30, 31, o 28/29 en febrero). Cada uno queda pendiente hasta que abre el siguiente; el de fin de mes, hasta que termina el mes. Si el día cae en fin de semana, la ventana abre el siguiente día hábil; el de fin de mes se adelanta al viernes para no salirse del mes | Igual que preventivo |
| Escalamiento | Atraso máximo de 31 días o más | Siempre visible | Sin mensaje masivo: gestión puntual. Documento sugerido: Aviso de deuda (31-60) o Aviso de retiro / Acuerdo de pagos (+60), desde la ficha del cliente |

- **Vencimiento** = fecha de facturación (columna I) + días de crédito (columna K) de la BDD.
  No se usan los "Días Vencida" de la BDD porque llegan en 0 en facturas con pago parcial.
  Una factura sin días de crédito usa sus "Días Vencida" y no entra al preventivo.
- **Exclusiones** de los mensajes masivos: lista negra, promesa de pago vigente y facturas con
  un pago registrado en Pagos desde 3 días antes de la última modificación de la BDD.
- **Ventanas en lugar de un día exacto**: si nadie entra justo el día 7, el recordatorio
  sigue pendiente hasta el 14. Un cliente nunca recibe dos veces el mismo recordatorio
  (llave única por factura en preventivo y por mes + recordatorio, `YYYY-MM-R1` a `R4`, en
  correctivo). Del día 1 al 6 no hay correctivo.
- Los días están en `REGLAS.correctivoDias` (`backend/src/campanas/config.js`); un día mayor
  al último del mes se toma como fin de mes.

## Mensajes y plantillas

Cada mensaje se arma con una plantilla y se personaliza con los datos del cliente y de su
franquicia, como el Aviso de deuda: nombre, facturas pendientes (folio, saldo y
vencimiento), monto, fecha límite y los datos de transferencia de la franquicia correcta
(beneficiario, banco, cuenta y CLABE; nunca se mezclan cuentas).

- **Pestaña Plantillas**: seis plantillas (preventivo y correctivo × WhatsApp, asunto de correo
  y correo). Todos las ven; solo un administrador las edita. Las variables se insertan con un
  clic (`{nombre}`, `{franquicia}`, `{facturas}`, `{detalle_facturas}`, `{monto}`,
  `{fecha_limite}`, `{datos_transferencia}`, `{contacto}`, `{eslogan}`, entre otras); una
  variable desconocida no se deja guardar. *Vista previa* muestra el resultado con un cliente
  ficticio y *Restablecer predeterminada* vuelve al texto original. Al guardar, el lote se
  recalcula.
- En correo, `{detalle_facturas}` y `{datos_transferencia}` en su propia línea salen como
  tabla y recuadro, y `{eslogan}` en su propio párrafo sale con el estilo de marca.
- Las predeterminadas siguen la skill `cobranza-purifika`: tono amable (mora temprana), datos
  bancarios de la franquicia, contacto de escalamiento y, en correo, el eslogan.
- **Revisión antes de enviar**: en WhatsApp, el ícono de lápiz (o *Revisar todos los
  mensajes*) muestra cada texto en un campo editable; en correo, *Revisar / editar* abre el
  asunto y el texto. Lo editado aplica solo a ese envío y se marca como *Editado*. Un correo
  con el texto editado se envía como texto simple (sin la tabla ni el recuadro).
- El **Historial** guarda el texto tal como se envió (con sus ediciones) y lo muestra al tocar
  cada registro.

## Propiedad de datos

| Dominio | Fuente de verdad | Puede modificar |
| --- | --- | --- |
| Campañas | Módulo Campañas | `campana_contactos` y `campana_envios` |

1. El módulo **lee** la BDD directamente de Drive (solo lectura, con caché de 10 minutos). No
   aplica la BDD ni pasa por el botón Actualizar.
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

**Carga por archivo** (botón *Subir archivo*, solo admin): un `.xlsx` o `.csv` subido desde la
pantalla. El botón muestra una vista de referencia del formato al pasar el cursor (o con el
ícono ⓘ en celular), y *Plantilla* descarga un Excel con los encabezados correctos y los
clientes vigentes ya listados, con su contacto actual si existe.

| Franquicia | Grupo De Facturación | Teléfono | Correo | Recibe Correo |
| --- | --- | --- | --- | --- |
| AGS / CUN / MID (o el nombre de la ciudad) | Igual que en la BDD | Con código de país: `+52 449 123 4567`, `+1 415 555 2671` | uno o varios, separados por `;` | Sí / No (opcional, solo comerciales) |

- Se lee la primera hoja; los encabezados van en la fila 1, en cualquier orden, sin importar
  acentos ni mayúsculas. Columnas adicionales (como *Segmento (referencia)* de la plantilla)
  se ignoran.
- **Teléfono con código de país**, para incluir clientes con número extranjero. Acepta `+52 …`,
  `0052 …` o los dígitos con el código sin `+`; un número de 10 dígitos sin código se asume de
  México (+52), y el formato antiguo de celular `+52 1 …` se corrige solo. Cada número se valida
  con la longitud de su país (libphonenumber) y se guarda en formato internacional, que es el que
  usa WhatsApp.
- CSV con coma o punto y coma, en UTF-8 o ANSI (como lo guarda Excel en español). El formato
  `.xls` antiguo no es compatible.
- Agrega clientes nuevos y actualiza los que vinieron de un archivo. **Nunca sobrescribe un
  contacto editado en el Directorio**, y una celda vacía no borra un dato ya guardado.
- Filas sin teléfono ni correo se ignoran. El resultado de la carga lista las filas omitidas
  (franquicia no reconocida, datos inválidos), los datos inválidos que se descartaron y los
  nombres que no coinciden con ningún Grupo De Facturación vigente.
- Límite: 5 MB.

## Configuración (variables del backend)

| Variable | Uso |
| --- | --- |
| `CAMPANAS_SMTP_USER` | Cuenta que envía (`cobranza.ags@purifika.com`) |
| `CAMPANAS_SMTP_PASSWORD` | Contraseña de aplicación de Google para esa cuenta (requiere verificación en dos pasos) |
| `CAMPANAS_SMTP_HOST` / `CAMPANAS_SMTP_PORT` | Opcionales; por defecto `smtp.gmail.com` / `465` |
| `CAMPANAS_REMITENTE_NOMBRE` | Opcional; por defecto "Cobranza Purifika" |

Sin las variables SMTP la pestaña funciona y el correo se muestra deshabilitado.

La migración `supabase/migrations/20261002090000_campanas_cobranza.sql` crea las dos tablas.
`20261005090000_campanas_plantillas.sql` agrega `campana_plantillas` y las columnas `mensaje`,
`asunto` y `editado` de `campana_envios`; debe aplicarse antes de desplegar el backend que
las usa (sin ella el lote funciona con las plantillas predeterminadas, pero registrar un
envío falla con un aviso de migración pendiente).
