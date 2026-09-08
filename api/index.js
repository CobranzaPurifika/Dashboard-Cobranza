import app from "../backend/src/app.js";

// Vercel agrupa Express en una sola Function. El rewrite conserva la ruta
// original (/api/...) para que los routers existentes funcionen sin duplicarse.
export default app;
