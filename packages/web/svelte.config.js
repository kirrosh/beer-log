import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    // полностью статичная сборка: витрина читает JSON-снапшот каталога.
    // Без SPA-fallback: все страницы пререндерятся (обходом ссылок).
    adapter: adapter({ pages: "build", assets: "build", precompress: false }),
    // абсолютные пути к ассетам (сайт отдаётся от корня) — иначе динамические импорты
    // на вложенных маршрутах (/brewery/<slug>/) резолвятся относительно URL и 404-ят
    paths: { relative: false },
    prerender: { handleHttpError: "warn" },
  },
};
