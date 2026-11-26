import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En desarrollo, /api se reenvía a Django para compartir origen (cookies de sesión + CSRF).
export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom" },
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
});
