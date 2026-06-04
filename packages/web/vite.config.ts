import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  // экран точки тянет живые данные из локального venue-server (scripts/venue-server.ts).
  // В dev проксируем /api на него, чтобы фронт и API были одного origin.
  server: {
    // слушаем все интерфейсы — иначе туннель (cloudflared/ngrok) может не достучаться до IPv4
    host: true,
    proxy: {
      "/api": { target: process.env.VENUE_API ?? "http://localhost:5174", changeOrigin: true },
    },
    // мини-апп открывается через ngrok-туннель (TASK-34 #2) — пускаем туннельные хосты в dev
    allowedHosts: [".ngrok-free.app", ".ngrok.io", ".ngrok.app", ".trycloudflare.com"],
  },
});
