<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";
  import { generatedAt, counts } from "$lib/catalog";
  let { children } = $props();
  const isHome = $derived(page.url.pathname === "/");
</script>

<header class="top">
  <div class="wrap bar">
    <a class="brand" href="/">
      <span class="glyph">▰</span>
      <span class="wm">BEER&thinsp;LOG</span>
      <span class="tag">мета российского крафта</span>
    </a>
    <nav class="nav">
      <a class="navlink" class:on={isHome} href="/">Каталог</a>
      <a class="navlink" class:on={page.url.pathname === "/meta"} href="/meta">Мета</a>
      <a class="navlink" class:on={page.url.pathname === "/top"} href="/top">Топ</a>
    </nav>
  </div>
  <div class="hair"></div>
</header>

<main>
  {@render children()}
</main>

<footer class="foot">
  <div class="wrap fbar">
    <span>BEER LOG — открытый справочник крафта РФ. Рыночные данные, не потребительский рейтинг.</span>
    <span class="mono">{counts.breweries} пивоварен · {counts.beers} сортов · снапшот {generatedAt}</span>
  </div>
</footer>

<style>
  .top { position: sticky; top: 0; z-index: 20; backdrop-filter: blur(12px); background: color-mix(in srgb, var(--bg) 78%, transparent); }
  .bar { display: flex; align-items: center; justify-content: space-between; height: 58px; }
  .brand { display: flex; align-items: baseline; gap: 11px; }
  .glyph { color: var(--amber); font-size: 14px; transform: translateY(-1px); }
  .wm { font-family: var(--font-display); font-weight: 700; font-size: 22px; letter-spacing: 1.5px; }
  .tag { font-size: 12.5px; color: var(--ink-faint); letter-spacing: 0.3px; }
  @media (max-width: 560px) { .tag { display: none; } }
  .nav { display: flex; gap: 4px; }
  .navlink { font-size: 13.5px; color: var(--ink-dim); padding: 6px 14px; border-radius: 999px; transition: color 0.15s, background 0.15s; }
  .navlink:hover { color: var(--ink); }
  .navlink.on { color: var(--amber); background: color-mix(in srgb, var(--amber) 12%, transparent); }
  .hair { height: 1px; background: linear-gradient(90deg, transparent, var(--line-strong) 18%, var(--line-strong) 82%, transparent); }

  main { min-height: calc(100vh - 58px - 64px); }

  .foot { margin-top: 56px; border-top: 1px solid var(--line); }
  .fbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; height: 64px; flex-wrap: wrap; font-size: 12px; color: var(--ink-faint); }
  .fbar .mono { font-size: 11.5px; }
</style>
