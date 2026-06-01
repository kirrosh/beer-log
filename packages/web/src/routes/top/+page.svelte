<script lang="ts">
  import { topBeersByReach, topBreweriesByReach, dealsBeers, demandMeta } from "$lib/catalog";
  import { catMeta } from "$lib/styles";
  import Chip from "$lib/Chip.svelte";

  type Tab = "beers" | "breweries" | "deals";
  let tab = $state<Tab>("beers");

  const topBeers = topBeersByReach(50);
  const topBrews = topBreweriesByReach(30);
  const deals = dealsBeers(50);

  const fmtPrice = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("ru")} ₽`);
  const plur = (n: number, one: string, few: string, many: string) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  };
</script>

<svelte:head><title>Топ — Beer Log</title></svelte:head>

<!-- ШАПКА -->
<section class="hero wrap">
  <h1>Топ российского крафта</h1>
  <p class="sub">
    Рейтинг по <b>ширине дистрибуции</b> — в скольких магазинах встречается сорт или пивоварня.
    Это рыночный сигнал спроса, <i>не</i> потребительский рейтинг. Чем больше магазинов в базе — тем точнее картина.
  </p>
  <div class="hstats">
    {#each [["магазинов в базе", demandMeta.shops], ["сортов в продаже", demandMeta.beersWithDemand], ["пивоварен в продаже", demandMeta.breweriesWithDemand]] as [label, n]}
      <div class="hs"><span class="mono">{n.toLocaleString("ru")}</span><i>{label}</i></div>
    {/each}
  </div>
</section>

<!-- ПЕРЕКЛЮЧАТЕЛЬ -->
<section class="tools wrap">
  <div class="seg-toggle" role="tablist">
    <button role="tab" aria-selected={tab === "beers"} class:on={tab === "beers"} onclick={() => (tab = "beers")}>Сорта</button>
    <button role="tab" aria-selected={tab === "breweries"} class:on={tab === "breweries"} onclick={() => (tab = "breweries")}>Пивоварни</button>
    <button role="tab" aria-selected={tab === "deals"} class:on={tab === "deals"} onclick={() => (tab = "deals")}>Со скидкой</button>
  </div>
</section>

<!-- РЕЗУЛЬТАТЫ -->
<section class="wrap results">
  {#if tab === "beers"}
    <div class="rows">
      {#each topBeers as b, i (b.slug + (b.brewerySlug ?? ""))}
        <a class="row beer" href={`/beer/${b.slug}`} style="--c: {catMeta(b.style?.category).color}; animation-delay: {Math.min(i, 28) * 16}ms">
          <span class="rk mono" class:top3={i < 3}>{i + 1}</span>
          <span class="nm">{b.name}</span>
          <span class="br">{b.breweryName ?? "—"}</span>
          <span class="ch"><Chip category={b.style?.category} /></span>
          <span class="reach mono"><b>{b.demand!.reach}</b> {plur(b.demand!.reach, "магазин", "магазина", "магазинов")}</span>
          <span class="lst mono">{b.demand!.listings} {plur(b.demand!.listings, "лист.", "лист.", "лист.")}</span>
          <span class="pr mono">{b.demand!.minPrice != null ? `от ${fmtPrice(b.demand!.minPrice)}` : "—"}</span>
        </a>
      {/each}
    </div>
  {:else if tab === "breweries"}
    <div class="rows">
      {#each topBrews as b, i (b.slug)}
        <a class="row brew" href={`/brewery/${b.slug}`} style="animation-delay: {Math.min(i, 28) * 16}ms">
          <span class="rk mono" class:top3={i < 3}>{i + 1}</span>
          <span class="nm">{b.name}</span>
          <span class="cy">{b.city ?? "—"}</span>
          <span class="reach mono"><b>{b.demand!.reach}</b> {plur(b.demand!.reach, "магазин", "магазина", "магазинов")}</span>
          <span class="lb mono">{b.demand!.listedBeers} {plur(b.demand!.listedBeers, "сорт", "сорта", "сортов")}</span>
          <span class="lst mono">{b.demand!.listings} лист.</span>
        </a>
      {/each}
    </div>
  {:else}
    <div class="rows">
      {#if deals.length}
        {#each deals as b, i (b.slug + (b.brewerySlug ?? ""))}
          <a class="row beer deal" href={`/beer/${b.slug}`} style="--c: {catMeta(b.style?.category).color}; animation-delay: {Math.min(i, 28) * 16}ms">
            <span class="rk mono"><span class="sale">%</span></span>
            <span class="nm">{b.name}</span>
            <span class="br">{b.breweryName ?? "—"}</span>
            <span class="ch"><Chip category={b.style?.category} /></span>
            <span class="reach mono"><b>{b.demand!.reach}</b> {plur(b.demand!.reach, "магазин", "магазина", "магазинов")}</span>
            <span class="lst mono"></span>
            <span class="pr mono">{b.demand!.minPrice != null ? `от ${fmtPrice(b.demand!.minPrice)}` : "—"}</span>
          </a>
        {/each}
      {:else}
        <div class="empty">Скидок в базе пока нет.</div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .hero { padding-top: 34px; }
  .hero h1 { font-family: var(--font-display); font-size: 34px; font-weight: 700; letter-spacing: 0.5px; margin: 0; }
  .hero .sub { max-width: 680px; margin: 12px 0 0; color: var(--ink-dim); font-size: 14.5px; line-height: 1.55; }
  .hero .sub b { color: var(--ink); font-weight: 600; }
  .hstats { display: flex; gap: 28px; margin-top: 22px; flex-wrap: wrap; }
  .hs { display: flex; flex-direction: column; gap: 3px; }
  .hs .mono { font-size: 26px; color: var(--amber); line-height: 1; }
  .hs i { font-style: normal; font-size: 12px; color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.5px; }

  .tools { margin-top: 26px; }
  .seg-toggle { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; padding: 3px; background: var(--bg-elev); }
  .seg-toggle button { font-family: var(--font-display); font-size: 14.5px; letter-spacing: 0.4px; color: var(--ink-dim); background: none; border: none; padding: 6px 18px; border-radius: 999px; cursor: pointer; transition: all 0.15s; }
  .seg-toggle button.on { background: var(--amber); color: #1a1206; font-weight: 600; }

  .results { margin-top: 18px; }
  .rows { border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; background: var(--bg-elev); }
  .row { display: grid; align-items: center; gap: 14px; padding: 12px 16px; border-bottom: 1px solid var(--line); animation: up 0.4s both; border-left: 2px solid transparent; transition: background 0.13s, border-left-color 0.13s; }
  .row:last-child { border-bottom: none; }
  .row:hover { background: var(--bg-elev-2); border-left-color: var(--c, var(--amber)); }
  .row .nm { font-weight: 600; font-size: 15px; }
  .rk { width: 30px; text-align: center; color: var(--ink-faint); font-size: 14px; }
  .rk.top3 { color: var(--amber); font-size: 17px; font-weight: 600; }
  .sale { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--c-specialty, var(--amber)); color: #1a1206; font-weight: 700; font-size: 12px; }

  .beer { grid-template-columns: 30px minmax(130px, 1.5fr) minmax(100px, 1fr) auto minmax(110px, 0.9fr) 64px minmax(80px, 0.8fr); }
  .beer .br { color: var(--ink-dim); font-size: 13.5px; }
  .brew { grid-template-columns: 30px minmax(150px, 1.7fr) minmax(110px, 1.1fr) minmax(110px, 0.9fr) 84px 80px; }
  .brew .cy { color: var(--ink-dim); font-size: 13.5px; }

  .reach { color: var(--ink); font-size: 13px; text-align: right; } .reach b { color: var(--amber); font-size: 15px; }
  .lst, .lb { color: var(--ink-faint); font-size: 12px; text-align: right; }
  .pr { color: var(--ink-dim); font-size: 13px; text-align: right; }

  .empty { padding: 40px; text-align: center; color: var(--ink-faint); }

  @media (max-width: 760px) {
    .beer { grid-template-columns: 26px 1fr auto 84px; }
    .beer .br, .beer .ch, .beer .lst { display: none; }
    .brew { grid-template-columns: 26px 1fr 84px 70px; }
    .brew .cy, .brew .lst { display: none; }
  }
  @keyframes up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
</style>
