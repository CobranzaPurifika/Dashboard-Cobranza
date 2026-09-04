import { api } from "./api.js";
import { authConfigurationError, clearSession, hasSession, signIn, signOut } from "./auth.js";
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

let state = {
  franchise: "todas",
  tramo: "",
  q: "",
  statusCatalog: [],
  user: null,
  franchises: [],
};

const fmtMoney = (n) => "$" + Number(n ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 });
const fmtDate = (iso) => (iso ? String(iso).slice(0, 10) : "");

async function init() {
  window.addEventListener("auth-required", () => showLogin("Tu sesión terminó. Ingresa nuevamente."));
  document.getElementById("login-form").addEventListener("submit", handleLogin);
  document.getElementById("logout-button").addEventListener("click", handleLogout);
  document.getElementById("filter-tramo").addEventListener("change", (e) => {
    state.tramo = e.target.value;
    loadClientes();
  });
  document.getElementById("filter-q").addEventListener("input", debounce((e) => {
    state.q = e.target.value;
    loadClientes();
  }, 300));
  document.getElementById("close-detail").addEventListener("click", closeDetail);

  const configurationError = authConfigurationError();
  if (configurationError) {
    showLogin(configurationError);
    return;
  }

  if (!hasSession()) {
    showLogin();
    return;
  }

  await openAuthenticatedApp().catch((error) => {
    clearSession();
    showLogin(error.message);
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
  state.statusCatalog = await api.statusGestion();
  renderAccount();
  renderTabs();
  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
  await Promise.all([loadDashboard(), loadClientes()]);
}

async function handleLogout() {
  await signOut();
  state.user = null;
  closeDetail();
  showLogin();
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
  document.getElementById("account-name").textContent = state.user.display_name || state.user.email;
  document.getElementById("account-role").textContent = roleLabels[state.user.role] ?? state.user.role;
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
      loadDashboard();
      loadClientes();
    });
    nav.appendChild(btn);
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
      label: "Recuperado (7 días)",
      value: fmtMoney(data.recuperadoSemanal.total),
      sub: `${data.recuperadoSemanal.count} pagos`,
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
      <td>${c.estatus_label ? escapeHtml(c.estatus_label) : "Sin gestión previa"}</td>
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
    .map((s) => `<option value="${s.value}" ${s.value === c.estatus_value ? "selected" : ""}>${s.label}</option>`)
    .join("");

  const canManage = ["admin", "gestor"].includes(state.user.role);
  const gestionBlock = canManage
    ? `<h3>Guardar gestión</h3>
      <form id="gestion-form">
        <select id="gestion-estatus">${statusOptions}</select>
        <textarea id="gestion-comentario" placeholder="Comentario (opcional)"></textarea>
        <button type="submit">Guardar</button>
      </form>`
    : `<div class="readonly-notice">Consulta de solo lectura</div>`;

  content.innerHTML = `
    <h2>${escapeHtml(c.name)}</h2>
    <p class="muted">${escapeHtml(c.franchise_id)} · ${escapeHtml(c.segment_label)} · RFC ${escapeHtml(c.rfc ?? "N/A")}</p>
    <p class="saldo">${fmtMoney(c.saldo)} <span class="badge badge-${c.tramo}">${TRAMO_LABEL[c.tramo] ?? c.tramo}</span></p>

    ${gestionBlock}

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
    document.getElementById("gestion-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const estatusValue = document.getElementById("gestion-estatus").value;
      const comentario = document.getElementById("gestion-comentario").value;
      await api.guardarGestion(id, { estatusValue, comentario });
      await openDetail(id);
      await loadClientes();
    });
  }

  panel.classList.remove("hidden");
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

init();
