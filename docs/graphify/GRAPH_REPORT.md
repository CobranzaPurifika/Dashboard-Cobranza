# Graph Report - Dashboard-Cobranza  (2026-10-05)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1102 nodes · 2357 edges · 57 communities (24 shown, 33 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 71 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3024d8b0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 19
- Community 20
- Community 21
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 31
- Community 34
- Community 35
- Community 36
- Community 38
- Community 41
- Community 42
- Community 43
- Community 44

## God Nodes (most connected - your core abstractions)
1. `ManagementComponent` - 118 edges
2. `AppComponent` - 76 edges
3. `ApiService` - 56 edges
4. `CampanasComponent` - 48 edges
5. `DashboardComponent` - 31 edges
6. `DocumentLayout` - 28 edges
7. `PresentationComponent` - 25 edges
8. `pool` - 20 edges
9. `AuthService` - 18 edges
10. `normalizeBusinessKey()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `component()` --calls--> `DashboardComponent`  [EXTRACTED]
  frontend/src/app/pages/dashboard.component.spec.ts → frontend/src/app/pages/dashboard.component.ts
- `render()` --calls--> `DocumentLayout`  [EXTRACTED]
  backend/src/documents/generate.js → backend/src/documents/layout.js
- `AppComponent` --references--> `AppPreferences`  [EXTRACTED]
  frontend/src/app/app.component.ts → frontend/src/app/core/preferences.ts
- `franquiciaUnica()` --calls--> `resolveFranchiseScope()`  [EXTRACTED]
  backend/src/routes/campanas.js → backend/src/auth/franchiseScope.js
- `fetchClienteDetail()` --calls--> `groupPaymentsByFolio()`  [EXTRACTED]
  backend/src/domain/clienteDetail.js → backend/src/domain/paymentEvidence.js

## Import Cycles
- None detected.

## Communities (57 total, 33 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (51): authenticate(), requireAuthenticated(), requireClientAccess(), requireRole(), verifySupabaseToken(), canAccessFranchise(), resolveFranchiseScope(), hasRole() (+43 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (49): FRANCHISE_IDS, LOGO_APP_FULL_BASE64, DATA_OWNERSHIP, paymentDedupeKey(), buildHistoricalDashboard(), canViewHistoricalDashboard(), delta(), metric() (+41 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (70): agruparClientes(), CONTACTO_ESCALAMIENTO, ESLOGAN, FRANQUICIAS, REGLAS, ARTICULOS, COLUMNAS_CONTACTOS, CONECTORES (+62 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (62): COL, entero(), ESTATUS_VIGENTES, extraerFacturas(), texto(), DRIVE_SOURCES, getDriveSources(), ANOMALY_THRESHOLD (+54 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (52): ASSETS, assetsDirectory, COLORS, CONTACTO_ATENCION_CLIENTES, CONTACTO_DEFAULT, franquiciaPorFacturas(), FRANQUICIAS, NIVELES_DENSIDAD (+44 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (43): architect, prefix, projectType, root, sourceRoot, build, serve, test (+35 more)

### Community 10 - "Community 10"
Cohesion: 0.06
Nodes (35): dependencies, cors, csv-parse, dotenv, exceljs, express, google-auth-library, jose (+27 more)

### Community 12 - "Community 12"
Cohesion: 0.14
Nodes (20): FranchiseOption, FRANCHISES, invoiceDate(), money(), moneyExact(), shortDate(), TRAMO_LABEL, tramoLabel() (+12 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (22): name, private, scripts, build, start, test, version, component() (+14 more)

### Community 17 - "Community 17"
Cohesion: 0.27
Nodes (16): buildLineChart(), buildLineChartRecuperado(), buildLineChartVencida(), escapeAttr(), escapeHtml(), fmtMoney(), MESES, monthLabel() (+8 more)

### Community 19 - "Community 19"
Cohesion: 0.10
Nodes (20): angularCompilerOptions, strictInjectionParameters, strictInputAccessModifiers, strictTemplates, compilerOptions, esModuleInterop, experimentalDecorators, importHelpers (+12 more)

### Community 20 - "Community 20"
Cohesion: 0.28
Nodes (17): addBalances(), addCompliance(), addHeader(), addManagement(), addRecovered(), addSummary(), code(), CODES (+9 more)

### Community 21 - "Community 21"
Cohesion: 0.15
Nodes (10): clientes_priority_idx, facturas_cliente_fecha_idx, gestion_timeline_cliente_fecha_idx, gestion_timeline_fecha_cliente_idx, management_incidents_fecha_idx, pagos_cliente_fecha_idx, portfolio_snapshots_lookup_idx, public.management_daily_goals (+2 more)

### Community 23 - "Community 23"
Cohesion: 0.14
Nodes (12): compilerOptions, outDir, types, extends, files, include, ./tsconfig.json, compilerOptions (+4 more)

### Community 24 - "Community 24"
Cohesion: 0.17
Nodes (12): dependencies, @angular/common, @angular/compiler, @angular/core, @angular/forms, @angular/platform-browser, @angular/router, @ionic/angular (+4 more)

### Community 25 - "Community 25"
Cohesion: 0.20
Nodes (5): StoredSession, Window, cdr, @angular/core, vitest

### Community 27 - "Community 27"
Cohesion: 0.26
Nodes (7): clientes_portfolio_status_idx, pagos_dedupe_key_uidx, pagos_franchise_fecha_idx, payment_promises_client_idx, payment_promises_one_active_per_client, public.invoice_client_keys, public.payment_promises

### Community 28 - "Community 28"
Cohesion: 0.24
Nodes (7): AppPreferences, DEFAULT_PREFERENCES, loadPreferences(), PREFERENCES_KEY, PresentationPreferences, PriorityDensity, StartView

### Community 29 - "Community 29"
Cohesion: 0.47
Nodes (7): dateOnly(), groupPaymentsByFolio(), hasFullPaymentEvidence(), invoiceEvidence(), normalizeFolio(), paymentsForInvoice(), bassolPayments

### Community 31 - "Community 31"
Cohesion: 0.29
Nodes (7): devDependencies, @angular/build, @angular/cli, @angular/compiler-cli, jsdom, typescript, vitest

### Community 34 - "Community 34"
Cohesion: 0.48
Nodes (5): import_raw_rows_run_idx, import_raw_rows_source_idx, import_runs_one_running_per_source, public.import_raw_rows, public.import_runs

### Community 35 - "Community 35"
Cohesion: 0.47
Nodes (3): public.app_users, public.user_franchises, user_franchises_franchise_idx

### Community 36 - "Community 36"
Cohesion: 0.33
Nodes (4): CalendarCell, DAYS, MONTHS, @angular/common

### Community 38 - "Community 38"
Cohesion: 0.60
Nodes (3): campana_envios_fecha_idx, public.campana_contactos, public.campana_envios

## Knowledge Gaps
- **178 isolated node(s):** `FranchiseOption`, `Contacto`, `ItemLote`, `Pestana`, `Cobertura` (+173 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 353 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ManagementComponent` connect `Community 6` to `Community 32`, `Community 33`, `Community 37`, `Community 40`, `Community 9`, `Community 12`, `Community 18`, `Community 22`, `Community 25`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **What connects `FranchiseOption`, `Contacto`, `ItemLote` to the rest of the system?**
  _178 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.0680379746835443 - nodes in this community are weakly interconnected._
- **Why does `AppComponent` connect `Community 5` to `Community 39`, `Community 12`, `Community 13`, `Community 16`, `Community 25`, `Community 28`, `Community 30`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0629746835443038 - nodes in this community are weakly interconnected._
- **Why does `CampanasComponent` connect `Community 7` to `Community 12`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06424050632911392 - nodes in this community are weakly interconnected._