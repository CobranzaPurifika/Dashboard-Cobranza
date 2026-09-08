export default function runtimeConfig(_req, res) {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(
    `window.__APP_CONFIG__ = ${JSON.stringify({
      apiBase: "/api",
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    })};`
  );
}
