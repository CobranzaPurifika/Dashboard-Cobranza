export const FRANCHISE_IDS = Object.freeze(["aguascalientes", "cancun", "merida"]);

export function resolveFranchiseScope(user, requested = "todas") {
  if (requested !== "todas" && !FRANCHISE_IDS.includes(requested)) {
    const error = new Error("Franquicia desconocida");
    error.statusCode = 400;
    throw error;
  }

  if (user.role !== "gestor") {
    return requested === "todas" ? [...FRANCHISE_IDS] : [requested];
  }

  const assigned = Array.isArray(user.franchise_ids) ? user.franchise_ids : [];
  if (requested === "todas") return assigned.filter((id) => FRANCHISE_IDS.includes(id));
  if (!assigned.includes(requested)) {
    const error = new Error("No tienes acceso a esta franquicia");
    error.statusCode = 403;
    throw error;
  }
  return [requested];
}

export function canAccessFranchise(user, franchiseId) {
  try {
    return resolveFranchiseScope(user, franchiseId).length === 1;
  } catch {
    return false;
  }
}
