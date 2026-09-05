import { api } from "./api.js";
import { clearSession, hasSession, signIn, signOut } from "./auth.js";
import {
  renderDonut,
  renderFunnel,
  renderDistribucion,
  renderSegmentacion,
  renderCoverage,
  buildLineChartRecuperado,
  buildLineChartVencida,
} from "./charts.js";

const FRANQUICIAS = [
  { id: "todas", label: "Todas" },
  { id: "aguascalientes", label: "Aguascalientes" },
  { id: "cancun", label: "Cancún" },
  { id: "merida", label: "Mérida" },
];

const TRAMO_LABEL = {
  good: "Al corriente",
  warning: "1-30 días",
  serious: "31-60 días",
  critical: "+60 días",
};

const AGENDA_HOURS = Array.from({ length: 10 }, (_, index) => `${String(index + 9).padStart(2, "0")}:00`);

let state = {
  franchise: "todas",
  tramo: "",
  q: "",
  statusCatalog: [],
  user: null,
  franchises: [],
  view: "dashboard",
  prioritySegment: "",
  priorityQ: "",
};

const fmtMoney = (n) => "$" + Number(n ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 });
const fmtDate = (iso) => (iso ? String(iso).slice(0, 10) : "");
const fmtShortDate = (iso) => {
  if (!iso) return "";
  const [year, month, day] = String(iso).slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)))
    .replace(".", "")
    .replace(/[-/]/g, " ");
};

function normalized(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isCallLaterStatus(status) {
  const value = normalized(status?.value).replace(/[^a-z0-9]+/g, "_");
  return value === "llamar_mas_tarde" || normalized(status?.label) === "llamar mas tarde";
}

function mexicoDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function mexicoTodayISO(date = new Date()) {
  const { year, month, day } = mexicoDateParts(date);
  return `${year}-${month}-${day}`;
}

function suggestedAgendaHour(date = new Date()) {
  const { hour, minute } = mexicoDateParts(date);
  const roundedHour = Math.round((Number(hour) * 60 + Number(minute) + 180) / 60);
  return `${String(Math.max(9, Math.min(18, roundedHour))).padStart(2, "0")}:00`;
}

async function init() {
  window.addEventListener("auth-required", () => showLogin("Tu sesión terminó. Ingresa nuevamente."));
  document.getElementById("login-form").addEventListener("submit", handleLogin);
  document.getElementById("account-action").addEventListener("click", handleAccountAction);
  document.getElementById("sync-data").addEventListener("click", syncDataNow);
  document.getElementById("cancel-login").addEventListener("click", () => openAuthenticatedApp());
  document.getElementById("dashboard-nav").addEventListener("click", () => setView("dashboard"));
  document.getElementById("management-nav").addEventListener("click", () => setView("management"));
  document.getElementById("priority-segments").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-segment]");
    if (!button) return;
    state.prioritySegment = button.dataset.segment;
    renderPrioritySegments();
    loadPriority();
  });
  document.getElementById("priority-q").addEventListener("input", debounce((event) => {
    state.priorityQ = event.target.value;
    loadPriority();
  }, 300));
  document.getElementById("filter-tramo").addEventListener("change", (e) => {
    state.tramo = e.target.value;
    loadClientes();
  });
  document.getElementById("filter-q").addEventListener("input", debounce((e) => {
    state.q = e.target.value;
    loadClientes();
  }, 300));
  document.getElementById("close-detail").addEventListener("click", closeDetail);

  await openAuthenticatedApp().catch((error) => {
    if (hasSession()) {
      clearSession();
      showLogin(error.message);
    } else {
      showLogin("No fue posible cargar el tablero");
    }
  });
}

async function handleLogin(event) {
  event.preventDefault();
  const submit = document.getElementById("login-submit");
  const errorBox = document.getElementById("login-error");
  submit.disabled = true;
  submit.textContent = "Ingresando…";
  errorBox.textContent = "";

  try {
    await signIn(
      document.getElementById("login-email").value,
      document.getElementById("login-password").value
    );
    await openAuthenticatedApp();
    document.getElementById("login-password").value = "";
  } catch (error) {
    clearSession();
    showLogin(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = "Iniciar sesión";
  }
}

async function openAuthenticatedApp() {
  state.user = await api.me();
  state.franchises = franchisesForUser(state.user);

  if (state.franchises.length === 0) {
    throw new Error("Tu cuenta todavía no tiene franquicias asignadas");
  }

  state.franchise = "todas";
  state.view = state.user.isAnonymous ? "dashboard" : "management";
  const clientsPanel = document.getElementById("clients-panel");
  clientsPanel.classList.toggle("hidden", state.user.isAnonymous);
  state.statusCatalog = state.user.isAnonymous ? [] : await api.statusGestion();
  renderAccount();
  renderPrimaryNav();
  renderTabs();
  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
  await loadActiveView();
}

async function handleLogout() {
  await signOut();
  state.user = null;
  closeDetail();
  await openAuthenticatedApp();
}

async function handleAccountAction() {
  if (state.user?.isAnonymous) {
    showLogin();
    document.getElementById("login-email").focus();
    return;
  }
  await handleLogout();
}

function showLogin(error = "") {
  document.getElementById("app-shell").classList.add("hidden");
  document.getElementById("login-view").classList.remove("hidden");
  document.getElementById("login-error").textContent = error;
}

function franchisesForUser(user) {
  if (user.allFranchises) return FRANQUICIAS;

  const assigned = new Set(user.franchise_ids ?? []);
  const choices = FRANQUICIAS.filter((item) => item.id !== "todas" && assigned.has(item.id));
  if (choices.length === 0) return [];
  return [{ id: "todas", label: "Mis franquicias" }, ...choices];
}

function renderAccount() {
  const roleLabels = { admin: "Administrador", gestor: "Gestor", lector: "Solo lectura" };
  const action = document.getElementById("account-action");
  document.getElementById("account-name").textContent = state.user.isAnonymous
    ? "Acceso por enlace"
    : state.user.display_name || state.user.email;
  document.getElementById("account-role").textContent = roleLabels[state.user.role] ?? state.user.role;
  action.textContent = state.user.isAnonymous ? "Acceso administrador" : "Salir";
  document.getElementById("import-controls").classList.toggle("hidden", state.user.role !== "admin");
}

async function syncDataNow() {
  const button = document.getElementById("sync-data");
  const status = document.getElementById("sync-status");
  button.disabled = true;
  button.textContent = "Actualizando…";
  status.textContent = "Leyendo BDD y Pagos";
  try {
    const result = await api.syncData();
    if (result.bdd.status === "skipped") {
      status.textContent = `Sin cambios: ${result.bdd.details.reason}`;
    } else {
      status.textContent = `Actualizado: ${result.bdd.rowsApplied} registros BDD · ${result.pagos?.rowsApplied ?? 0} pagos nuevos`;
      await loadActiveView();
    }
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Actualizar datos ahora";
  }
}

function renderPrimaryNav() {
  const dashboardButton = document.getElementById("dashboard-nav");
  const managementButton = document.getElementById("management-nav");
  managementButton.classList.toggle("hidden", state.user.isAnonymous);
  dashboardButton.classList.toggle("active", state.view === "dashboard");
  managementButton.classList.toggle("active", state.view === "management");
  document.getElementById("dashboard-view").classList.toggle("hidden", state.view !== "dashboard");
  document.getElementById("management-view").classList.toggle("hidden", state.view !== "management");
}

async function setView(view) {
  if (view === "management" && state.user.isAnonymous) return;
  state.view = view;
  closeDetail();
  renderPrimaryNav();
  await loadActiveView();
}

async function loadActiveView() {
  if (state.view === "management") {
    await Promise.all([loadPriority(), loadSeguimiento(), loadBlacklist()]);
    return;
  }
  await loadDashboard();
  if (!state.user.isAnonymous) await loadClientes();
}

async function loadSeguimiento() {
  const data = await api.seguimiento(state.franchise);
  renderFollowupList(
    document.getElementById("overdue-list"),
    data.overdue,
    (client) =>
      `Prometió pago el ${fmtShortDate(client.promise_deadline_iso)} — sin confirmación (${client.days_overdue} ${client.days_overdue === 1 ? "día" : "días"} de retraso).`
  );
  renderFollowupList(
    document.getElementById("scheduled-list"),
    data.scheduled,
    (client) => client.agenda_detail || `Contactar el ${fmtShortDate(client.agenda_fecha_iso)}`
  );
}

async function loadBlacklist() {
  const rows = await api.blacklist(state.franchise);
  const list = document.getElementById("blacklist-list");
  document.getElementById("blacklist-count").textContent = `${rows.length} ${rows.length === 1 ? "cliente" : "clientes"}`;
  list.innerHTML = "";

  if (rows.length === 0) {
    list.innerHTML = '<p class="blacklist-empty">No hay clientes en esta lista.</p>';
    return;
  }

  for (const client of rows) {
    const item = document.createElement("button");
    item.className = "blacklist-item";
    item.type = "button";
    item.innerHTML = `
      <span><strong>${escapeHtml(client.name)}</strong><small>${escapeHtml(client.franchise_id)}</small></span>
      <p>${escapeHtml(client.motivo)}</p>
    `;
    item.addEventListener("click", () => openDetail(client.id));
    list.appendChild(item);
  }
}

function renderFollowupList(container, rows, detail) {
  container.innerHTML = "";
  if (rows.length === 0) {
    container.innerHTML = '<p class="followup-empty">Sin pendientes en esta sección.</p>';
    return;
  }

  for (const client of rows) {
    const item = document.createElement("button");
    item.className = "followup-item";
    item.type = "button";
    item.innerHTML = `
      <strong>${escapeHtml(client.name)}</strong>
      <span>${escapeHtml(detail(client))}</span>
      <small>${escapeHtml(client.franchise_id)}</small>
    `;
    item.addEventListener("click", () => openDetail(client.id));
    container.appendChild(item);
  }
}

function renderTabs() {
  const nav = document.getElementById("franchise-tabs");
  nav.innerHTML = "";
  for (const f of state.franchises) {
    const btn = document.createElement("button");
    btn.textContent = f.label;
    btn.className = "tab" + (f.id === state.franchise ? " active" : "");
    btn.addEventListener("click", () => {
      state.franchise = f.id;
      renderTabs();
      loadActiveView();
    });
    nav.appendChild(btn);
  }
}

function renderPrioritySegments() {
  for (const button of document.querySelectorAll("#priority-segments button")) {
    button.classList.toggle("active", button.dataset.segment === state.prioritySegment);
  }
}

async function loadPriority() {
  const result = await api.prioridad({
    franchise: state.franchise,
    segment: state.prioritySegment,
    q: state.priorityQ,
  });
  const list = document.getElementById("priority-list");
  document.getElementById("priority-count").textContent = `${result.shown} de ${result.total} contactos`;
  list.innerHTML = "";

  if (result.rows.length === 0) {
    list.innerHTML = '<p class="priority-empty">No hay contactos para estos filtros.</p>';
    return;
  }

  for (const client of result.rows) {
    const row = document.createElement("article");
    row.className =
      "priority-row" +
      (client.managed_today ? " managed-today" : "") +
      (client.is_blacklisted ? " blacklisted-result" : "");
    row.innerHTML = `
      <span class="segment-dot segment-${escapeAttr(client.segment)}" aria-hidden="true"></span>
      <button class="priority-name" type="button">${escapeHtml(client.name)}</button>
      <span class="priority-badges">
        <span class="badge badge-${escapeAttr(client.tramo)}">${escapeHtml(client.tramo_label ?? TRAMO_LABEL[client.tramo] ?? client.tramo)}</span>
        ${client.is_blacklisted ? '<span class="blacklist-badge">Lista negra</span>' : ""}
        ${client.portfolio_status === "pending_validation" ? '<span class="pending-badge">Pendiente de validar</span>' : ""}
      </span>
      <strong>${fmtMoney(client.saldo)}</strong>
      <button class="manage-button" type="button">Gestionar</button>
    `;
    for (const button of row.querySelectorAll("button")) {
      button.addEventListener("click", () => openDetail(client.id));
    }
    list.appendChild(row);
  }
}

async function loadDashboard() {
  const data = await api.dashboard(state.franchise);
  const cards = document.getElementById("kpi-cards");
  cards.innerHTML = "";

  const kpis = [
    { label: "Cartera total", value: fmtMoney(data.portfolio.saldo), sub: `${data.portfolio.clientes} clientes` },
    { label: "Al corriente", value: `${data.kpi.alCorriente.pct}%`, sub: fmtMoney(data.kpi.alCorriente.monto) },
    { label: "Vencida", value: `${data.kpi.vencidaTotal.pct}%`, sub: fmtMoney(data.kpi.vencidaTotal.monto) },
    { label: "+60 días", value: `${data.kpi.mas60.pct}%`, sub: fmtMoney(data.kpi.mas60.monto) },
    {
      label: "Recuperado (semana)",
      value: fmtMoney(data.recuperadoSemanal.total),
      sub: `${data.recuperadoSemanal.count} clientes`,
    },
    {
      label: "Gestionados",
      value: `${data.gestion.gestionados}/${data.gestion.total}`,
      sub: "clientes con gestión registrada",
    },
  ];

  for (const k of kpis) {
    const card = document.createElement("div");
    card.className = "kpi-card";
    card.innerHTML = `<div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div><div class="kpi-sub">${k.sub}</div>`;
    cards.appendChild(card);
  }

  renderCharts(data);
}

function renderCharts(data) {
  const donut = renderDonut(data.saldos, { incluirCorriente: true });
  document.getElementById("saldos-donut").innerHTML = donut.svg;
  document.getElementById("saldos-legend").innerHTML = donut.legend;

  const seg = renderSegmentacion(data.segmentacion);
  document.getElementById("segmentation-bar").innerHTML = seg.bar;
  document.getElementById("segmentation-legend").innerHTML = seg.legend;

  const funnel = renderFunnel(data.funnel, data.expectativaCobro);
  document.getElementById("funnel-bars").innerHTML = funnel.bars;
  document.getElementById("funnel-rates").innerHTML = funnel.rates;

  const dist = renderDistribucion(data.distribucion);
  document.getElementById("dist-sub").textContent = dist.sub;
  document.getElementById("dist-list").innerHTML = dist.rows;

  const coverage = renderCoverage(data.gestion);
  document.getElementById("coverage-fill").style.width = `${coverage.pct}%`;
  document.getElementById("coverage-total").textContent = coverage.total;
  document.getElementById("coverage-gestionados").textContent = coverage.gestionados;
  document.getElementById("coverage-pct").textContent = coverage.pctLabel;

  document.getElementById("line-chart").innerHTML = buildLineChartRecuperado(data.historico);
  document.getElementById("line-chart-vencida").innerHTML = buildLineChartVencida(data.historicoVencida);
}

async function loadClientes() {
  const rows = await api.clientes({
    franchise: state.franchise,
    tramo: state.tramo,
    q: state.q,
  });
  const tbody = document.getElementById("clientes-tbody");
  tbody.innerHTML = "";
  for (const c of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.franchise_id)}</td>
      <td>${escapeHtml(c.segment_label)}</td>
      <td>${fmtMoney(c.saldo)}</td>
      <td><span class="badge badge-${c.tramo}">${TRAMO_LABEL[c.tramo] ?? c.tramo}</span></td>
      <td>${c.portfolio_status === "pending_validation" ? '<span class="pending-badge">Pendiente de validar</span>' : c.estatus_label ? escapeHtml(c.estatus_label) : "Sin gestión previa"}</td>
    `;
    tr.addEventListener("click", () => openDetail(c.id));
    tbody.appendChild(tr);
  }
}

async function openDetail(id) {
  const c = await api.cliente(id);
  const panel = document.getElementById("detail-panel");
  const content = document.getElementById("detail-content");

  const statusOptions = state.statusCatalog
    .map(
      (s) =>
        `<option value="${escapeAttribute(s.value)}" ${s.value === c.estatus_value ? "selected" : ""}>${escapeHtml(s.label)}</option>`
    )
    .join("");

  const currentStatus = state.statusCatalog.find((status) => status.value === c.estatus_value);
  const hasActiveAgenda = c.agenda_active === true && isCallLaterStatus(currentStatus);
  const agendaDate = hasActiveAgenda && fmtDate(c.agenda_fecha_iso) ? fmtDate(c.agenda_fecha_iso) : mexicoTodayISO();
  const agendaHour = hasActiveAgenda && AGENDA_HOURS.includes(c.agenda_hora)
    ? c.agenda_hora
    : suggestedAgendaHour();
  const agendaHourOptions = AGENDA_HOURS.map(
    (hour) => `<option value="${hour}" ${hour === agendaHour ? "selected" : ""}>${hour}</option>`
  ).join("");
  const agendaFields = `<fieldset id="agenda-fields" class="agenda-fields ${isCallLaterStatus(currentStatus) ? "" : "hidden"}">
        <legend>Agendar llamada</legend>
        <div class="agenda-row">
          <label>Fecha para contactar
            <input id="agenda-fecha" type="date" min="${mexicoTodayISO()}" value="${agendaDate}" />
          </label>
          <label>Hora
            <select id="agenda-hora">${agendaHourOptions}</select>
          </label>
        </div>
        <label>Nota para seguimiento
          <textarea id="agenda-nota" placeholder="Pendiente o acuerdo (opcional)">${escapeHtml(hasActiveAgenda ? c.agenda_nota ?? "" : "")}</textarea>
        </label>
      </fieldset>`;

  const canManage = ["admin", "gestor"].includes(state.user.role);
  const gestionBlock = canManage
    ? `<h3>Guardar gestión</h3>
      <form id="gestion-form">
        <select id="gestion-estatus">${statusOptions}</select>
        <textarea id="gestion-comentario" placeholder="Comentario (opcional)"></textarea>
        ${agendaFields}
        <button type="submit">Guardar</button>
      </form>`
    : `<div class="readonly-notice">Consulta de solo lectura</div>`;

  const blacklistBlock = canManage
    ? c.is_blacklisted
      ? `<h3>Lista negra</h3>
        <div class="blacklist-state">
          <span class="blacklist-badge">En Lista negra</span>
          <button id="blacklist-remove" class="icon-action" type="button" aria-label="Quitar de Lista negra" title="Quitar de Lista negra">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="9" cy="7" r="3"></circle>
              <path d="M3.5 18c.6-3.1 2.5-4.8 5.5-4.8s4.9 1.7 5.5 4.8"></path>
              <path d="M16 12h5"></path>
            </svg>
          </button>
        </div>`
      : `<h3>Lista negra</h3>
        <form id="blacklist-form" class="blacklist-form">
          <label for="blacklist-motivo">Motivo</label>
          <textarea id="blacklist-motivo" placeholder="Explica por qué se agrega" required></textarea>
          <button class="danger-action" type="submit">Agregar a Lista negra</button>
        </form>`
    : c.is_blacklisted
      ? '<p><span class="blacklist-badge">En Lista negra</span></p>'
      : "";

  content.innerHTML = `
    <h2>${escapeHtml(c.name)}</h2>
    <p class="muted">${escapeHtml(c.franchise_id)} · ${escapeHtml(c.segment_label)} · RFC ${escapeHtml(c.rfc ?? "N/A")}</p>
    <p class="saldo">${fmtMoney(c.saldo)} <span class="badge badge-${c.tramo}">${TRAMO_LABEL[c.tramo] ?? c.tramo}</span></p>
    ${c.portfolio_status === "pending_validation" ? '<p class="pending-notice">Pendiente de validar: no apareció en la BDD y todavía no existe evidencia de pago total.</p>' : ""}

    ${gestionBlock}

    ${blacklistBlock}

    <h3>Facturas (${c.invoices.length})</h3>
    <ul class="mini-list">
      ${c.invoices
        .slice(0, 10)
        .map((i) => `<li>${escapeHtml(i.folio)} — ${fmtMoney(i.monto)} — ${i.dias_vencida} días</li>`)
        .join("")}
    </ul>

    <h3>Pagos (${c.pagos.length})</h3>
    <ul class="mini-list">
      ${c.pagos
        .slice(0, 10)
        .map((p) => `<li>${fmtDate(p.fecha_iso)} — ${fmtMoney(p.monto)} — ${escapeHtml(p.forma ?? "")}</li>`)
        .join("")}
    </ul>

    <h3>Timeline</h3>
    <ul class="mini-list timeline">
      ${c.timeline
        .slice(0, 15)
        .map(
          (t) =>
            `<li><span class="dot" style="background:${escapeAttr(t.dot_color ?? "#999")}"></span>${fmtDate(t.fecha_iso)} — ${escapeHtml(t.descripcion ?? "")}</li>`
        )
        .join("")}
    </ul>
  `;

  if (canManage) {
    const statusSelect = document.getElementById("gestion-estatus");
    const agendaFieldset = document.getElementById("agenda-fields");
    const agendaInputs = agendaFieldset.querySelectorAll("input, select, textarea");
    const syncAgendaFields = () => {
      const selected = state.statusCatalog.find((status) => status.value === statusSelect.value);
      const active = isCallLaterStatus(selected);
      agendaFieldset.classList.toggle("hidden", !active);
      agendaInputs.forEach((input) => {
        input.disabled = !active;
      });
      document.getElementById("agenda-fecha").required = active;
      document.getElementById("agenda-hora").required = active;
    };
    statusSelect.addEventListener("change", syncAgendaFields);
    syncAgendaFields();

    document.getElementById("gestion-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const estatusValue = document.getElementById("gestion-estatus").value;
      const comentario = document.getElementById("gestion-comentario").value;
      const selected = state.statusCatalog.find((status) => status.value === estatusValue);
      const body = { estatusValue, comentario };
      if (isCallLaterStatus(selected)) {
        body.agenda = {
          fechaISO: document.getElementById("agenda-fecha").value,
          hora: document.getElementById("agenda-hora").value,
          nota: document.getElementById("agenda-nota").value,
        };
      }
      await api.guardarGestion(id, body);
      await refreshClientContext(id);
    });

    if (c.is_blacklisted) {
      document.getElementById("blacklist-remove").addEventListener("click", async () => {
        if (!window.confirm(`¿Quitar a ${c.name} de Lista negra?`)) return;
        await api.quitarBlacklist(id);
        await refreshClientContext(id);
      });
    } else {
      document.getElementById("blacklist-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const field = document.getElementById("blacklist-motivo");
        const motivo = field.value.trim();
        if (!motivo) {
          field.setCustomValidity("Escribe el motivo para continuar");
          field.reportValidity();
          return;
        }
        field.setCustomValidity("");
        await api.agregarBlacklist(id, motivo);
        await refreshClientContext(id);
      });
    }
  }

  panel.classList.remove("hidden");
}

async function refreshClientContext(id) {
  await openDetail(id);
  if (state.view === "management") {
    await Promise.all([loadPriority(), loadSeguimiento(), loadBlacklist()]);
  } else {
    await loadClientes();
  }
}

function closeDetail() {
  document.getElementById("detail-panel").classList.add("hidden");
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str ?? "").replace(/[^#a-zA-Z0-9]/g, "");
}

function escapeAttribute(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

init();
