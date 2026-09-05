# Contrato de propiedad de datos

Este contrato evita que una importación o interacción de usuario sobrescriba datos de otro
dominio.

| Dominio | Fuente de verdad | Puede modificar |
| --- | --- | --- |
| Cartera vigente | BDD | Clientes, saldo vigente, días, tramo, facturas pendientes y segmentación |
| Recuperación | Pagos | Historial de pagos y métricas de recuperación del periodo |
| Gestión | Aplicación | Estatus, promesas, agenda, notas, lista negra y timeline |
| Histórico | Snapshots | Fotografías semanales y mensuales inmutables |

## Invariantes

1. Importar un pago nunca resta ni recalcula `clientes.saldo` y nunca cambia una factura de BDD.
2. La siguiente carga completa de BDD determina el saldo y las facturas pendientes vigentes.
3. Un pago se deduplica por `factura + fechaISO + monto`; `folio` no participa en la llave.
4. La recuperación mensual incluye únicamente pagos recibidos dentro del mes calendario.
5. La recuperación semanal comienza el lunes o el día 1 del mes, lo que sea más reciente.
6. Una carga BDD preserva pagos y todos los datos de gestión de la aplicación.
7. Guardar una gestión debe insertar el evento y actualizar al cliente en una sola transacción.
8. Airtable es un respaldo transitorio de la etapa Artifact; no será fuente de verdad de la app.
9. El botón manual relee los mismos archivos de Drive; no admite archivos alternos.
10. Toda fuente se valida completa antes de escribir RAW. Un error deja intacto el consolidado.
11. RAW es acumulativo: una fila idéntica no se duplica y una versión modificada se conserva.
12. Los tres archivos BDD se aplican en una sola transacción o no se aplica ninguno.
13. Una corrida BDD con una franquicia vacía se omite. La caída máxima no explicada es 10% del
    día 1 al 5 y 2% desde el día 6, tanto en clientes como en saldo.
14. `Grupo De Facturación` identifica al cliente. `Nombre Comercial` nunca agrupa clientes.
15. RFC de 12 caracteres corresponde a Comercial; RFC de 13 caracteres o genérico, a Residencial.
16. Cualquier pago positivo dentro de los cuatro días naturales inclusivos de una promesa la
    cumple, aunque el pago sea parcial. El cumplimiento pertenece al mes del pago.

## Perfiles y permisos

- `admin`: consulta, gestiona clientes, configura y ejecuta sincronizaciones manuales.
- `gestor`: consulta y captura gestión, agenda y lista negra.
- `lector`: consulta el dashboard y el detalle, sin operaciones de escritura.

Administradores y lectores consultan Aguascalientes, Cancún y Mérida. Cada gestor solo puede
consultar y modificar clientes de las franquicias registradas en `user_franchises`.

Toda gestión nueva conserva el usuario que la registró. La sincronización automática se ejecuta
como proceso interno y no suplanta a un usuario.

## Consecuencia operativa

Si un cliente deja de aparecer en BDD, primero se verifica que todos sus folios abiertos tengan
evidencia de pago. Si la evidencia es completa, pasa a liquidado, sale de cartera, Seguimiento y
Lista negra, y conserva pagos, gestiones y notas. Si falta evidencia, conserva el último saldo y
permanece visible como `Pendiente de validar` hasta la siguiente importación o revisión.
