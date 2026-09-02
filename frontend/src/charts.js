// Puerto del renderizado del artifact original (renderDonut, renderFunnel, renderDistribucion,
// renderSegmentation, buildLineChart, buildTrendChartVencida) a SVG inyectado vía innerHTML,
// consumiendo la respuesta de /api/dashboard/:franchise en vez de mutar un JSON en memoria.

const fmtMoney = (n) => "$" + Math.round(Number(n ?? 0)).toLocaleString("es-MX");
const TRAMO_COLOR = { good: "#2FA84F", warning: "#F2A413", serious: "#E2672A", critical: "#C0392B" };

export function renderDonut(saldos, { incluirCorriente = true } = {}) {
  const visibles = incluirCorriente ? saldos : saldos.filter((s) => s.tramo !== "good");
  const total = visibles.reduce((s, x) => s + Number(x.value), 0);
  const centerSub = incluirCorriente ? "Total cartera" : "Total vencido";

  const r = 70, cx = 100, cy = 100;
  const circumference = 2 * Math.PI * r;
  let cumulative = 0;
  let parts = "";
  for (const s of visibles) {
    const value = Number(s.value);
    const len = total > 0 ? (value / total) * circumference : 0;
    const gap = 2.5;
    const drawLen = Math.max(len - gap, 0);
    const offset = -cumulative;
    const pct = total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
    parts += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${TRAMO_COLOR[s.tramo]}" stroke-width="30" stroke-dasharray="${drawLen} ${circumference - drawLen}" stroke-dashoffset="${offset}" transform="rotate(-90 ${cx} ${cy})"><title>${s.label}: ${fmtMoney(value)} (${pct}%)</title></circle>`;
    cumulative += len;
  }
  parts += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" class="donut-center-label">${fmtMoney(total)}</text>`;
  parts += `<text x="${cx}" y="${cy + 14}" text-anchor="middle" class="donut-center-sub">${centerSub}</text>`;

  const legend = visibles
    .map((s) => {
      const value = Number(s.value);
      const pct = total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
      return `<div class="legend-item"><span class="swatch" style="background:${TRAMO_COLOR[s.tramo]};"></span><span class="lbl">${s.label}</span><span class="val">${fmtMoney(value)}</span><span class="pct">${pct}%</span></div>`;
    })
    .join("");

  return { svg: `<svg viewBox="0 0 200 200" role="img">${parts}</svg>`, legend };
}

export function renderFunnel(f, expectativaCobro) {
  const FUNNEL_COLORS = [
    { color: "#1B3550", ink: "#FFFFFF" },
    { color: "#2B5D82", ink: "#FFFFFF" },
    { color: "#17969E", ink: "#FFFFFF" },
    { color: "#25CAD2", ink: "#0B2B2D" },
  ];
  const stages = [
    { label: "Total gestiones", value: f.total },
    { label: "Gestión efectiva", value: f.efectiva },
    { label: "Promesas acordadas", value: f.acordadas },
    { label: "Promesas cumplidas", value: f.cumplidas },
  ].map((s, i) => ({ ...s, ...FUNNEL_COLORS[i] }));

  const max = stages[0].value || 1;
  const FLOOR_PCT = 22;
  stages.forEach((s) => { s.pct = Math.max((s.value / max) * 100, FLOOR_PCT); });

  const bars = stages
    .map((s, i) => {
      const isLast = i === stages.length - 1;
      const bottomPct = isLast ? 72 : Math.min((stages[i + 1].pct / s.pct) * 100, 100);
      return `<div class="funnel-row"><span class="funnel-label">${s.label}</span><div class="funnel-track-outer"><div class="funnel-track" style="width:${s.pct}%;" title="${s.label}: ${s.value}"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="0,0 100,0 ${bottomPct},100 0,100" fill="${s.color}"/></svg><span class="funnel-value-inside" style="color:${s.ink};">${s.value}</span></div></div></div>`;
    })
    .join("");

  const contactabilidad = f.total > 0 ? (f.efectiva / f.total) * 100 : 0;
  const tasaAcuerdo = f.efectiva > 0 ? (f.acordadas / f.efectiva) * 100 : 0;
  const indiceCumplimiento = f.acordadas > 0 ? (f.cumplidas / f.acordadas) * 100 : 0;

  const rates = `<div class="rate-box"><span class="rlabel">Contactabilidad</span><span class="rvalue">${contactabilidad.toFixed(1)}%</span></div><div class="rate-box"><span class="rlabel">Tasa de acuerdo</span><span class="rvalue">${tasaAcuerdo.toFixed(1)}%</span></div><div class="rate-box"><span class="rlabel">Índice de cumplimiento</span><span class="rvalue">${indiceCumplimiento.toFixed(1)}%</span></div>`;

  const promiseBox = `<div class="promise-box" title="Suma de la factura más vencida de cada cliente con promesa de pago activa"><span class="rlabel">Expectativa de Cobro</span><span class="rvalue">${fmtMoney(expectativaCobro)}</span><span class="rsub">Factura más vencida por cliente</span></div>`;

  return { bars: bars + promiseBox, rates };
}

export function renderDistribucion(distribucion) {
  const total = distribucion.reduce((s, d) => s + d.count, 0);
  const max = Math.max(1, ...distribucion.map((d) => d.count));
  const rows = distribucion
    .map((d) => {
      const pct = (d.count / max) * 100;
      const names = (d.names ?? []).slice().sort();
      const tooltipLines = names.slice(0, 12);
      let tooltipText = `${d.label} (${d.count})`;
      if (tooltipLines.length) {
        tooltipText += "\n" + tooltipLines.join("\n");
        if (names.length > tooltipLines.length) tooltipText += `\n+${names.length - tooltipLines.length} más`;
      }
      return `<div class="dist-row" title="${escapeAttr(tooltipText)}"><span class="dist-dot" style="background:${d.bg};"></span><span class="dist-label">${escapeHtml(d.label)}</span><div class="dist-track"><div class="dist-fill" style="width:${pct}%; background:${d.bg};"></div></div><span class="dist-value">${d.count}</span></div>`;
    })
    .join("");
  return { rows, sub: `${total} gestiones del periodo · por resultado` };
}

export function renderSegmentacion(seg) {
  const COLOR = { comercial: "#3E63A8", residencial: "#B5507A" };
  const total = seg.reduce((s, x) => s + Number(x.monto), 0) || 1;
  const bar = seg
    .map((s) => {
      const pct = (Number(s.monto) / total) * 100;
      return `<div class="seg" style="flex-basis:${pct}%; background:${COLOR[s.segment]};" title="${s.label}: ${fmtMoney(s.monto)} (${Math.round(pct * 10) / 10}%)"></div>`;
    })
    .join("");
  const legend = seg
    .map((s) => {
      const pct = (Number(s.monto) / total) * 100;
      return `<div class="legend-item" style="width:auto;"><span class="swatch" style="background:${COLOR[s.segment]};"></span><span class="lbl">${s.label} · ${s.clientes} clientes</span><span class="val">${fmtMoney(s.monto)}</span><span class="pct">${Math.round(pct * 10) / 10}%</span></div>`;
    })
    .join("");
  return { bar, legend };
}

export function renderCoverage(g) {
  const pct = g.total > 0 ? (g.gestionados / g.total) * 100 : 0;
  return { pct, total: g.total, gestionados: g.gestionados, pctLabel: `${pct.toFixed(1)}%` };
}

// Línea de recuperación mensual ($k) -- buildLineChart del original.
export function buildLineChartRecuperado(historico) {
  return buildLineChart(historico, {
    valueOf: (h) => Number(h.monto_recuperado) / 1000,
    dotTitle: (h, v) =>
      `${h.label}: $${v.toFixed(2)}k${h.pct_cobertura != null ? ` · ${Number(h.pct_cobertura).toFixed(1)}% cobertura` : ""}`,
    endLabel: (v) => `$${v.toFixed(2)}k`,
    gridLabel: (v) => `${Math.round(v)}k`,
    emptyText: "Sin datos de recuperación todavía",
    singleText: "Primer corte con datos reales — la tendencia se construye con los próximos cortes",
  });
}

// Tendencia de % de cartera vencida vs. meta de 25% -- buildTrendChartVencida del original.
export function buildLineChartVencida(historicoVencida) {
  const META_PCT = 25;
  return buildLineChart(historicoVencida, {
    valueOf: (h) => Number(h.pct),
    dotTitle: (h, v) => `${h.label}${h.provisional ? " (sin cerrar)" : ""}: ${v.toFixed(1)}%`,
    endLabel: (v) => `${v.toFixed(1)}%`,
    gridLabel: (v) => `${Math.round(v)}%`,
    emptyText: "Aún no hay cortes mensuales de cartera vencida registrados",
    singleText: "Primer corte — la tendencia se construye con los próximos meses",
    goalPct: META_PCT,
    minNiceMax: 50,
    provisional: (h) => !!h.provisional,
  });
}

function buildLineChart(historico, opts) {
  const left = 40, right = 620, top = 20, bottom = 160;

  if (!historico || historico.length === 0) {
    return `<svg viewBox="0 0 640 200" role="img"><text class="lc-axis-label" x="330" y="100" text-anchor="middle">${opts.emptyText}</text></svg>`;
  }

  const items = historico.map((h) => ({ h, label: h.label ?? monthLabel(h.month), v: opts.valueOf(h) }));

  if (items.length === 1) {
    const { h, label, v } = items[0];
    const tag = opts.provisional?.(h) ? " (mes en curso, aún sin cerrar)" : "";
    return `<svg viewBox="0 0 640 200" role="img"><circle class="lc-dot${opts.provisional?.(h) ? " lc-dot-provisional" : ""}" cx="330" cy="90" r="5"></circle><text class="lc-endlabel" x="330" y="66" text-anchor="middle">${opts.endLabel(v)}</text><text class="lc-axis-label" x="330" y="182" text-anchor="middle">${label}${tag}</text><text class="lc-axis-label" x="330" y="128" text-anchor="middle">${opts.singleText}</text></svg>`;
  }

  const values = items.map((i) => i.v);
  const labels = items.map((i) => i.label);
  const rawMax = Math.max(...values);
  let niceMax = opts.minNiceMax && rawMax <= opts.minNiceMax
    ? opts.minNiceMax
    : Math.ceil((rawMax * 1.15) / 10) * 10;
  if (niceMax <= 0) niceMax = 10;

  const stepX = (right - left) / (values.length - 1);
  const y = (v) => bottom - (v / niceMax) * (bottom - top);
  const pts = values.map((v, i) => ({ x: left + i * stepX, y: y(v), v }));
  const linePath = "M" + pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L");
  const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${bottom} L${pts[0].x.toFixed(1)},${bottom} Z`;

  let grid = "";
  for (let g = 0; g <= 3; g++) {
    const gv = (niceMax * g) / 3;
    const gy = y(gv);
    grid += `<line class="lc-grid" x1="${left}" y1="${gy}" x2="${right}" y2="${gy}"/><text class="lc-axis-label" x="4" y="${gy + 3}">${opts.gridLabel(gv)}</text>`;
  }

  let goalLine = "";
  if (opts.goalPct != null && opts.goalPct <= niceMax) {
    const goalY = y(opts.goalPct);
    goalLine = `<line class="lc-goal" x1="${left}" y1="${goalY}" x2="${right}" y2="${goalY}"/><text class="lc-goal-label" x="${right - 2}" y="${goalY - 4}" text-anchor="end">Meta ${opts.goalPct}%</text>`;
  }

  const dots = pts
    .map((p, i) => {
      const isLast = i === pts.length - 1;
      const prov = opts.provisional?.(items[i].h);
      return `<circle class="lc-dot${prov ? " lc-dot-provisional" : ""}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${isLast ? 5 : 3.5}"><title>${escapeAttr(opts.dotTitle(items[i].h, p.v))}</title></circle>`;
    })
    .join("");

  const labelStep = values.length > 8 ? 2 : 1;
  const xLabels = pts
    .map((p, i) => (i % labelStep !== 0 && i !== pts.length - 1 ? "" : `<text class="lc-axis-label" x="${p.x.toFixed(1)}" y="182" text-anchor="middle">${labels[i]}</text>`))
    .join("");

  const lastPt = pts[pts.length - 1];
  const endLabel = `<text class="lc-endlabel" x="${(lastPt.x - 46).toFixed(1)}" y="${(lastPt.y - 10).toFixed(1)}">${opts.endLabel(lastPt.v)}</text>`;

  return `<svg viewBox="0 0 640 200" role="img">${grid}${goalLine}<path class="lc-area" d="${areaPath}"/><path class="lc-line" d="${linePath}"/>${dots}${endLabel}${xLabels}</svg>`;
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
function monthLabel(monthStr) {
  if (!monthStr) return "";
  const d = new Date(monthStr);
  return MESES[d.getUTCMonth()];
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
function escapeAttr(str) {
  return String(str ?? "").replace(/"/g, "&quot;");
}
