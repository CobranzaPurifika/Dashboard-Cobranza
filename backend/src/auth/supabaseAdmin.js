// Admin API de Supabase Auth (crear/borrar usuarios con contraseña) -- requiere la
// service_role key, nunca la anon key. Se usa solo desde la creación de usuarios en
// Configuración (admin), nunca se expone al frontend.
function config() {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) throw new Error("SUPABASE_URL no está configurada");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY no está configurada en el servidor");
  return { supabaseUrl, serviceRoleKey };
}

export async function createAuthUser({ email, password }) {
  const { supabaseUrl, serviceRoleKey } = config();
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.msg ?? payload.error_description ?? payload.error ?? "No fue posible crear el usuario";
    throw new Error(/already.*registered|already.*exists/i.test(message) ? "Ese correo ya tiene una cuenta" : message);
  }
  return payload;
}

// Limpieza si falla el insert en app_users después de crear el usuario en Auth -- evita
// dejar una cuenta huérfana (existe en Auth pero no puede iniciar sesión en la app).
export async function deleteAuthUser(id) {
  const { supabaseUrl, serviceRoleKey } = config();
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  }).catch(() => undefined);
}
