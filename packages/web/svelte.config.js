import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    // статичная сборка каталога (страницы пререндерятся обходом ссылок) + SPA-fallback для
    // живых роутов точки (/venues, /venue/[id]): они client-only (ssr=false), тянут API.
    adapter: adapter({ pages: "build", assets: "build", fallback: "200.html", precompress: false }),
    // абсолютные пути к ассетам (сайт отдаётся от корня) — иначе динамические импорты
    // на вложенных маршрутах (/brewery/<slug>/) резолвятся относительно URL и 404-ят
    paths: { relative: false },
    prerender: { handleHttpError: "warn" },
  },
};
