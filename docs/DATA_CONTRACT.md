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

## Perfiles y permisos

- `admin`: consulta, gestiona clientes, configura y ejecuta sincronizaciones manuales.
- `gestor`: consulta y captura gestión, agenda y lista negra.
- `lector`: consulta el dashboard y el detalle, sin operaciones de escritura.

Toda gestión nueva conserva el usuario que la registró. La sincronización automática se ejecuta
como proceso interno y no suplanta a un usuario.

## Consecuencia operativa

Si una factura se liquida y deja de aparecer en BDD, desaparece de la cartera vigente en la
siguiente carga. El pago continúa en el historial y en las métricas de recuperación del periodo.
