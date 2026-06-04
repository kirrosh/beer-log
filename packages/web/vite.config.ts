import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  // экран точки тянет живые данные из локального venue-server (scripts/venue-server.ts).
  // В dev проксируем /api на него, чтобы фронт и API были одного origin.
  server: {
    proxy: {
      "/api": { target: process.env.VENUE_API ?? "http://localhost:5174", changeOrigin: true },
    },
  },
});
