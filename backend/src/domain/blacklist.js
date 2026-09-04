export function normalizeBlacklistReason(value) {
  const reason = String(value ?? "").trim();
  return reason || null;
}
