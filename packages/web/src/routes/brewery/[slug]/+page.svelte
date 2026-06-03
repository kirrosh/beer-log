<script lang="ts">
  import { catMeta, LINK_LABEL } from "$lib/styles";
  import { plur, sellerLabel, sellerUrl, SELLER_KIND_LABEL, CHANNEL_LABEL, CHANNEL_ORDER } from "$lib/catalog";
  import Chip from "$lib/Chip.svelte";
  let { data } = $props();
  const brewery = $derived(data.brewery);
  const beers = $derived(data.beers);
  const dist = $derived(data.dist);
  const total = $derived(beers.length);
  const segLabel = $derived(brewery.segment === "craft" ? "крафт" : brewery.segment === "mainstream" ? "мейнстрим" : "—");
  const order = ["website", "telegram", "vk", "untappd"];
  const orderedLinks = $derived(brewery.links.slice().sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)));
  // богатство источников (task-26): какими офиц. каналами реально подтверждён канон пивоварни,
  // сколько сортов подтверждено и сколько из них — cross-source (≥2 независимых канала).
  const provChannels = $derived(
    [...new Set(beers.flatMap((b) => b.channels))].sort((a, b) => CHANNEL_ORDER.indexOf(a) - CHANNEL_ORDER.indexOf(b)),
  );
  const verifiedCount = $derived(beers.filter((b) => b.channels.length).length);
  const crossCount = $derived(beers.filter((b) => b.channels.length >= 2).length);
</script>

<svelte:head><title>{brewery.name} — Beer Log</title></svelte:head>

<article class="wrap detail">
  <header class="head">
    <h1>{brewery.name}</h1>
    {#if brewery.aliases.length}<div class="al">{brewery.aliases.join(" · ")}</div>{/if}
    <div class="meta">
      {#if brewery.city}<span class="city">{brewery.city}</span><span class="sep">·</span>{/if}
      <span class="seg">{segLabel}</span>
      <span class="sep">·</span>
      <span class="mono cnt">{total} сорт.</span>
    </div>
  </header>

  {#if orderedLinks.length}
    <div class="links">
      {#each orderedLinks as l}
        <a class="lnk" class:primary={l.kind === "telegram"} href={l.url} target="_blank" rel="noopener">
          {LINK_LABEL[l.kind] ?? l.kind} ↗
        </a>
      {/each}
    </div>
  {/if}

  <!-- Богатство источников (task-26): какими офиц. каналами подтверждён канон пивоварни -->
  {#if verifiedCount}
    <div class="prov">
      <span class="pl">канон из источников:</span>
      {#each provChannels as c}<span class="pch">{CHANNEL_LABEL[c]}</span>{/each}
      <span class="pn">
        {verifiedCount} из {total} {plur(total, "сорта", "сортов", "сортов")} подтверждено
        {#if crossCount}<span class="cross">· {crossCount} cross-source (≥2 канала)</span>{/if}
      </span>
    </div>
  {/if}

  {#if brewery.demand}
    <section class="block where">
      <h2>Где найти <span class="rc mono">· {brewery.demand.reach} {plur(brewery.demand.reach, "точка", "точки", "точек")}</span></h2>
      <div class="places">
        {#each brewery.demand.places as p}
          <span class="place" class:opt={p.kind === "opt"}>
            <a class="snm slink" href={sellerUrl(p.seller)} target="_blank" rel="noopener">{sellerLabel(p.seller)} ↗</a>
            <span class="kind k-{p.kind}">{SELLER_KIND_LABEL[p.kind]}</span>
            {#if p.listedBeers != null}<span class="cnt mono">{p.listedBeers} {plur(p.listedBeers, "сорт", "сорта", "сортов")}</span>{/if}
          </span>
        {/each}
      </div>
      <p class="note">{brewery.demand.listedBeers} {plur(brewery.demand.listedBeers, "сорт", "сорта", "сортов")} в продаже · {brewery.demand.listings} лист. — рыночная информация о доступности, best-effort.</p>
    </section>
  {/if}

  {#if dist.length}
    <div class="dist">
      <div class="bar">
        {#each dist as d}<span class="seg2" style="flex: {d.count}; background: {catMeta(d.category).color}" title="{catMeta(d.category).label}: {d.count}"></span>{/each}
      </div>
      <div class="legend">{#each dist as d}<Chip category={d.category} count={d.count} />{/each}</div>
    </div>
  {/if}

  <section class="block">
    <h2>Сорта{#if total}<span class="mono"> · {total}</span>{/if}</h2>
    {#if total}
      <div class="rows">
        {#each beers as b}
          <a class="row" href={`/beer/${b.slug}`} style="--c: {catMeta(b.style?.category).color}">
            <span class="nm">{b.name}</span>
            <span class="ch"><Chip category={b.style?.category} /></span>
            <span class="st">{b.style?.name ?? "—"}</span>
            <span class="ab mono">{b.abv != null ? `${b.abv.toFixed(1)}%` : "—"}</span>
            <span class="ib mono">{b.ibu != null ? `${b.ibu} IBU` : "—"}</span>
          </a>
        {/each}
      </div>
    {:else}
      <p class="none">Сорта из офиц. источников пока не собраны. <a href="/">К каталогу →</a></p>
    {/if}
  </section>
</article>

<style>
  .detail { padding-top: 26px; max-width: 900px; }
  .head { padding-bottom: 18px; }
  h1 { font-size: 44px; font-weight: 600; line-height: 1.05; }
  .al { color: var(--ink-faint); font-size: 13.5px; margin-top: 7px; }
  .meta { display: flex; align-items: center; gap: 9px; margin-top: 13px; font-size: 14px; color: var(--ink-dim); }
  .meta .city { color: var(--ink); } .meta .seg { color: var(--amber); } .meta .sep { color: var(--ink-faint); } .meta .cnt { color: var(--ink-dim); }

  .links { display: flex; flex-wrap: wrap; gap: 9px; margin: 4px 0 8px; }
  .lnk { font-size: 13.5px; color: var(--ink-dim); border: 1px solid var(--line); border-radius: 999px; padding: 8px 16px; transition: all 0.15s; }
  .lnk:hover { color: var(--ink); border-color: var(--line-strong); }
  .lnk.primary { color: #1a1206; background: var(--amber); border-color: var(--amber); font-weight: 600; }
  .lnk.primary:hover { background: color-mix(in srgb, var(--amber) 88%, #fff); }

  /* Богатство источников (task-26) */
  .prov { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 2px 0 8px; font-size: 13px; }
  .prov .pl { color: var(--ink-faint); }
  .prov .pch { color: var(--c-specialty); border: 1px solid color-mix(in srgb, var(--c-specialty) 36%, var(--line)); border-radius: 999px; padding: 2px 10px; font-size: 12.5px; }
  .prov .pn { color: var(--ink-dim); }
  .prov .pn .cross { color: var(--c-specialty); font-weight: 500; }

  /* Где найти — агрегат доступности (task-20) */
  .where { margin-top: 24px; }
  .where h2 .rc { color: var(--ink-dim); text-transform: none; letter-spacing: 0; font-size: 13px; }
  .places { display: flex; flex-wrap: wrap; gap: 8px; }
  .place { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-left: 2px solid var(--amber-dim); border-radius: var(--r); padding: 7px 12px; background: var(--bg-elev); }
  .place.opt { border-left-color: var(--line-strong); }
  .place .snm { font-weight: 500; font-size: 14px; color: var(--ink); transition: color 0.15s; }
  .place .slink:hover { color: var(--amber); }
  .place .kind { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--ink-faint); border: 1px solid var(--line); border-radius: 5px; padding: 1px 6px; }
  .place .kind.k-bar { color: var(--c-specialty); border-color: color-mix(in srgb, var(--c-specialty) 40%, var(--line)); }
  .place .cnt { font-size: 12px; color: var(--ink-dim); }
  .where .note { margin: 11px 0 0; font-size: 12px; color: var(--ink-faint); }

  .dist { margin: 22px 0 4px; }
  .bar { display: flex; gap: 2px; height: 12px; border-radius: 4px; overflow: hidden; }
  .seg2 { display: block; }
  .legend { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }

  .block { margin-top: 30px; }
  .block h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--ink-faint); margin-bottom: 12px; }
  .block h2 .mono { color: var(--ink-dim); }
  .rows { border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; background: var(--bg-elev); }
  .row { display: grid; grid-template-columns: minmax(140px, 1.7fr) auto minmax(90px, 1.1fr) 62px 70px; align-items: center; gap: 14px; padding: 12px 16px; border-bottom: 1px solid var(--line); border-left: 2px solid transparent; transition: background 0.13s, border-color 0.13s; }
  .row:last-child { border-bottom: none; }
  .row:hover { background: var(--bg-elev-2); border-left-color: var(--c); }
  .row .nm { font-weight: 600; }
  .row .st { color: var(--ink-faint); font-size: 12.5px; }
  .row .ab { font-size: 13.5px; text-align: right; }
  .row .ib { color: var(--ink-faint); font-size: 12px; text-align: right; }
  .none { color: var(--ink-faint); } .none a { color: var(--amber); }

  @media (max-width: 640px) { h1 { font-size: 34px; } .row { grid-template-columns: 1fr auto 60px; } .row .st, .row .ib { display: none; } }
</style>
