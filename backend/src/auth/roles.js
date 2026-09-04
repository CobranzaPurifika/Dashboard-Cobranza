export function parseBearer(header) {
  const match = /^Bearer\s+(.+)$/i.exec(String(header ?? "").trim());
  return match?.[1] ?? null;
}

export function hasRole(role, allowedRoles) {
  return allowedRoles.includes(role);
}

export function isAuthenticatedUser(user) {
  return Boolean(user?.id && !user.isAnonymous);
}
