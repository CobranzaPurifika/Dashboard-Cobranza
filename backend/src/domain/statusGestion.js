// Genera una llave estable (value) a partir del nombre visible de un estatus nuevo, evitando
// colisiones con las llaves existentes -- los estatus ya guardados en clientes.estatus_value
// nunca cambian de llave, solo los nuevos la reciben aquí.
export function slugifyStatusValue(label, existingValues = []) {
  const base = String(label ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "estatus";

  const taken = new Set(existingValues);
  if (!taken.has(base)) return base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}_${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
}
