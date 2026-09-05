const BDD = Object.freeze({
  group: 1,
  rfc: 2,
  folio: 5,
  invoiceDate: 8,
  overdueDays: 11,
  balance: 21,
  status: 23,
});

const IMPORTABLE_BDD_STATUSES = new Set(["facturada", "pago parcial"]);
const FRANCHISE_PREFIXES = Object.freeze({ AGS: "aguascalientes", CUN: "cancun", MID: "merida" });
const TRAMOS = Object.freeze([
  { test: (days) => days <= 0, value: "good", label: "Al corriente" },
  { test: (days) => days <= 30, value: "warning", label: "1-30 días" },
  { test: (days) => days <= 60, value: "serious", label: "31-60 días" },
  { test: () => true, value: "critical", label: "+60 días" },
]);

export function buildBddSnapshot(franchiseId, rawRows) {
  const grouped = new Map();

  for (const rawRow of rawRows) {
    const row = rawRow.payload;
    const status = normalizeBusinessKey(row[BDD.status]);
    if (!IMPORTABLE_BDD_STATUSES.has(status)) continue;

    const name = cleanText(row[BDD.group]);
    const balance = parseMoney(row[BDD.balance]);
    if (!name || !Number.isFinite(balance) || balance <= 0) continue;

    const groupKey = normalizeBusinessKey(name);
    const rfc = cleanText(row[BDD.rfc]).toUpperCase();
    const overdueDays = parseInteger(row[BDD.overdueDays]);
    const folio = cleanText(row[BDD.folio]);
    if (!groupKey || !folio) continue;

    const invoice = {
      folio,
      balance,
      overdueDays,
      invoiceDate: parseDate(row[BDD.invoiceDate]),
    };
    const current = grouped.get(groupKey);
    if (current) {
      current.invoices.push(invoice);
      current.balance += balance;
      current.maxOverdueDays = Math.max(current.maxOverdueDays, overdueDays);
      if (!current.rfc && rfc) current.rfc = rfc;
      if (isDegenerateName(current.name) && !isDegenerateName(name)) current.name = name;
    } else {
      grouped.set(groupKey, {
        franchiseId,
        groupKey,
        name,
        rfc,
        balance,
        maxOverdueDays: overdueDays,
        invoices: [invoice],
      });
    }
  }

  const clients = [...grouped.values()].map((client) => {
    const segment = segmentFromRfc(client.rfc);
    const tramo = tramoFromDays(client.maxOverdueDays);
    return {
      ...client,
      idCandidate: clientIdFor(franchiseId, client.name),
      segment: segment.value,
      segmentLabel: segment.label,
      tramo: tramo.value,
      tramoLabel: tramo.label,
    };
  });

  return {
    franchiseId,
    clients,
    clientCount: clients.length,
    balance: roundMoney(clients.reduce((sum, client) => sum + client.balance, 0)),
    invoiceCount: clients.reduce((sum, client) => sum + client.invoices.length, 0),
  };
}

export function buildPayments(rawRows) {
  const payments = [];
  const seen = new Set();

  for (const rawRow of rawRows) {
    const payload = normalizeObjectKeys(rawRow.payload);
    const reference = cleanText(payload["serie/folio"]);
    const franchiseId = franchiseFromReference(reference);
    const paymentDate = latestDate(payload["fecha pago"]);
    const amount = parseMoney(payload["importe pagado"]);
    const invoice = cleanText(payload.factura || reference);
    const groupName = cleanText(payload["grupo de facturacion"]);

    if (!franchiseId || !paymentDate || !invoice || !Number.isFinite(amount) || amount <= 0) continue;

    const dedupeKey = paymentDedupeKey(invoice, paymentDate, amount);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    payments.push({
      franchiseId,
      groupName,
      groupKey: normalizeBusinessKey(groupName),
      paymentDate,
      amount,
      invoice,
      reference,
      paymentMethod: cleanText(payload.banco)
        ? "Transferencia bancaria"
        : "Comprobante enviado por cliente",
      dedupeKey,
    });
  }

  return payments;
}

export function anomalyThresholdForDate(date = new Date()) {
  const day = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", day: "numeric" }).format(date)
  );
  return day <= 5 ? 0.1 : 0.02;
}

export function evaluateSnapshotDrop({
  previousCount,
  previousBalance,
  nextCount,
  nextBalance,
  confirmedSettledCount = 0,
  confirmedSettledBalance = 0,
  date = new Date(),
}) {
  const threshold = anomalyThresholdForDate(date);
  const comparableCount = Math.max(0, Number(previousCount) - Number(confirmedSettledCount));
  const comparableBalance = Math.max(0, Number(previousBalance) - Number(confirmedSettledBalance));
  const clientDrop = ratioDrop(comparableCount, Number(nextCount));
  const balanceDrop = ratioDrop(comparableBalance, Number(nextBalance));
  return {
    threshold,
    clientDrop,
    balanceDrop,
    anomalous: clientDrop > threshold || balanceDrop > threshold,
  };
}

export function clientIdFor(franchiseId, groupName) {
  const prefix = { aguascalientes: "ags", cancun: "cun", merida: "mid" }[franchiseId];
  if (!prefix) throw new Error(`Franquicia desconocida: ${franchiseId}`);
  const slug = stripDiacritics(groupName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${prefix}-${slug || "cliente"}`;
}

export function segmentFromRfc(value) {
  const rfc = cleanText(value).replace(/\s+/g, "").toUpperCase();
  if (rfc.length === 12) return { value: "comercial", label: "Comercial" };
  return { value: "residencial", label: "Residencial" };
}

export function tramoFromDays(value) {
  const days = Number.isFinite(Number(value)) ? Number(value) : 0;
  return TRAMOS.find((tramo) => tramo.test(days));
}

export function normalizeBusinessKey(value) {
  return stripDiacritics(value).trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeInvoiceKey(value) {
  return normalizeBusinessKey(value).replace(/\s+/g, "");
}

export function isDegenerateName(value) {
  return !/[a-z0-9]/i.test(stripDiacritics(value));
}

export function parseMoney(value) {
  if (typeof value === "number") return value;
  let text = cleanText(value);
  if (!text) return Number.NaN;
  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  text = text.replace(/[^0-9.,]/g, "");
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma > lastDot && text.length - lastComma - 1 <= 2) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else {
    text = text.replace(/,/g, "");
  }
  const parsed = Number(text);
  return negative ? -parsed : parsed;
}

export function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  const text = cleanText(value);
  if (!text) return null;
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return validIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const local = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (local) return validIsoDate(Number(local[3]), Number(local[2]), Number(local[1]));
  return null;
}

export function latestDate(value) {
  const dates = cleanText(value)
    .split(/\s*,\s*/)
    .map(parseDate)
    .filter(Boolean)
    .sort();
  return dates.at(-1) ?? null;
}

function paymentDedupeKey(invoice, paymentDate, amount) {
  return `${normalizeInvoiceKey(invoice)}|${paymentDate}|${roundMoney(amount).toFixed(2)}`;
}

function franchiseFromReference(value) {
  const prefix = cleanText(value).toUpperCase().match(/^(AGS|CUN|MID)/);
  return prefix ? FRANCHISE_PREFIXES[prefix[1]] : null;
}

function normalizeObjectKeys(object) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [normalizeBusinessKey(key), value]));
}

function parseInteger(value) {
  const parsed = Number.parseInt(String(value ?? "").replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function validIsoDate(year, month, day) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) return null;
  return candidate.toISOString().slice(0, 10);
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function stripDiacritics(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function ratioDrop(previous, next) {
  if (!Number.isFinite(previous) || previous <= 0 || next >= previous) return 0;
  return (previous - Math.max(0, next)) / previous;
}
