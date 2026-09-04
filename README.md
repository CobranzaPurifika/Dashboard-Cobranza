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
  de gestión por cliente.
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
npx serve .         # o cualquier servidor estático; el frontend apunta a localhost:3001/api
```

## Pendiente (siguiente sesión)

- Endpoint/UI para blacklist y agenda de seguimiento (ya existen en el backend, falta cablear
  el frontend).
- Implementar las importaciones idempotentes de BDD y Pagos sobre Supabase.
- Decidir hosting (Vercel/Render para el backend + estático para el frontend, o ambos juntos)
  y configurar CI/CD.
