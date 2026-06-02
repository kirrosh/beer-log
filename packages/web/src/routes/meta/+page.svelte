<script lang="ts">
  import { digest, isFull, generatedAt, plur } from "$lib/catalog";
  import { catMeta } from "$lib/styles";

  const { facts, prose, mode } = digest;
  const c = facts.counts;
  const distTotal = facts.styleDist.reduce((s, d) => s + d.count, 0) || 1;

  // Мини-рендер markdown прозы: ## → заголовок, **жирный** → <strong>, пустая строка → абзац.
  // Контент наш (генерится gen-digest.ts), не пользовательский — @html безопасен.
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  type Block = { kind: "h2" | "p"; html: string };
  const blocks: Block[] = prose.split(/\n{2,}/).map((para) => {
    const t = para.trim();
    return t.startsWith("## ")
      ? { kind: "h2", html: inline(t.slice(3).trim()) }
      : { kind: "p", html: inline(t.replace(/\n/g, " ")) };
  });

  const headline: [string, number][] = [
    ["пивоварен", c.breweries], ["сортов", c.beers], ["городов", c.cities],
    ["в продаже", c.beersWithDemand], ["со скидкой", c.deals], ["подтверждено", c.verified],
  ];
</script>

<svelte:head><title>Мета — Beer Log</title></svelte:head>

<!-- ШАПКА -->
<section class="hero wrap">
  <h1>Мета российского крафта</h1>
  <p class="sub">
    Автодайджест по каталогу: что варят, где это продаётся, куда смещены стили. Только
    наблюдаемые рыночные сигналы — <i>не</i> потребительский рейтинг.
  </p>
  <div class="hstats">
    {#each headline as [label, n]}
      <div class="hs"><span class="mono">{n.toLocaleString("ru")}</span><i>{label}</i></div>
    {/each}
  </div>
</section>

<!-- РАСПРЕДЕЛЕНИЕ ПО СТИЛЯМ -->
<section class="wrap block">
  <div class="bhead"><span>Распределение по стилям</span><span class="mono">{distTotal.toLocaleString("ru")} сортов</span></div>
  <div class="bar" role="img" aria-label="распределение сортов по категориям стилей">
    {#each facts.styleDist as d}
      <div class="seg" style="flex: {d.count}; background: {catMeta(d.category).color}" title="{d.label}: {d.pct}%"></div>
    {/each}
  </div>
  <div class="legend">
    {#each facts.styleDist as d}
      <span class="lg"><i class="sw" style="background: {catMeta(d.category).color}"></i>{d.label}<b class="mono">{d.pct}%</b></span>
    {/each}
  </div>
</section>

<!-- ПРОЗА-ДАЙДЖЕСТ -->
<section class="wrap block prose">
  {#each blocks as b}
    {#if b.kind === "h2"}<h2>{@html b.html}</h2>{:else}<p>{@html b.html}</p>{/if}
  {/each}
</section>

<!-- ТОП ПО ОХВАТУ -->
<section class="wrap block tops">
  <div class="col">
    <div class="bhead"><span>Шире всего в продаже — пивоварни</span></div>
    <ol class="tlist">
      {#each facts.topBreweries.slice(0, 6) as b, i}
        <li><span class="rk mono">{i + 1}</span><span class="nm">{b.name}</span><span class="ct">{b.city ?? "—"}</span><span class="rh mono">{b.reach} {plur(b.reach, "маг.", "маг.", "маг.")}</span></li>
      {/each}
    </ol>
  </div>
  <div class="col">
    <div class="bhead"><span>Шире всего в продаже — сорта</span></div>
    <ol class="tlist">
      {#each facts.topBeers.slice(0, 6) as b, i}
        <li><span class="rk mono">{i + 1}</span><span class="nm">{b.name}</span><span class="ct">{b.brewery ?? "—"}</span><span class="rh mono">{b.reach} {plur(b.reach, "маг.", "маг.", "маг.")}</span></li>
      {/each}
    </ol>
  </div>
</section>

<!-- ГЕЙТ -->
{#if !isFull}
  <section class="wrap gate">
    <span class="lock">🔒</span>
    <div>
      <b>Гранулярная аналитика спроса — по запросу.</b>
      Цены и динамика по каждой точке, история листингов, разбивка спроса по магазинам и городам
      доступны под замком. Открытый справочник показывает агрегаты; детальная B2B-аналитика — по запросу.
    </div>
  </section>
{/if}

<p class="genline wrap mono">
  дайджест · {mode === "prose-file" ? "проза от агента" : "авто-шаблон"} · снапшот {generatedAt}
</p>

<style>
  .hero { padding: 40px 22px 24px; }
  h1 { font-size: clamp(28px, 5vw, 44px); }
  .sub { max-width: 60ch; margin-top: 12px; color: var(--ink-dim); font-size: 15px; line-height: 1.55; }
  .hstats { display: flex; flex-wrap: wrap; gap: 26px; margin-top: 24px; }
  .hs { display: flex; flex-direction: column; gap: 2px; }
  .hs .mono { font-size: 24px; color: var(--amber); }
  .hs i { font-size: 12px; color: var(--ink-faint); font-style: normal; letter-spacing: 0.3px; }

  .block { margin-top: 30px; }
  .bhead { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; color: var(--ink-dim); margin-bottom: 10px; }
  .bhead .mono { font-size: 12px; color: var(--ink-faint); }

  .bar { display: flex; height: 16px; border-radius: 5px; overflow: hidden; background: var(--bg-elev); }
  .seg { min-width: 2px; transition: flex 0.4s; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 12px; }
  .lg { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--ink-dim); }
  .lg .sw { width: 9px; height: 9px; border-radius: 2px; }
  .lg b { color: var(--ink-faint); font-size: 11.5px; }

  .prose { max-width: 72ch; }
  .prose :global(h2) { font-size: 19px; color: var(--amber); margin-top: 22px; }
  .prose :global(p) { margin-top: 8px; color: var(--ink); font-size: 15px; line-height: 1.6; }
  .prose :global(strong) { color: var(--ink); font-weight: 600; }

  .tops { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
  @media (max-width: 640px) { .tops { grid-template-columns: 1fr; } }
  .tlist { list-style: none; display: flex; flex-direction: column; gap: 2px; }
  .tlist li { display: grid; grid-template-columns: 22px 1fr auto; align-items: baseline; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--line); }
  .tlist .rk { color: var(--amber-dim); font-size: 12px; }
  .tlist .nm { color: var(--ink); font-size: 14px; }
  .tlist .ct { grid-column: 2; color: var(--ink-faint); font-size: 11.5px; }
  .tlist .rh { grid-row: 1; grid-column: 3; color: var(--ink-dim); font-size: 12px; }

  .gate { display: flex; gap: 14px; align-items: flex-start; margin-top: 34px; padding: 16px 18px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--bg-elev); }
  .gate .lock { font-size: 18px; line-height: 1.3; }
  .gate div { font-size: 13.5px; line-height: 1.55; color: var(--ink-dim); }
  .gate b { color: var(--ink); }

  .genline { margin: 26px auto; color: var(--ink-faint); font-size: 11.5px; }
</style>
