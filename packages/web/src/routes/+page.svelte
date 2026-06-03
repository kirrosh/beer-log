<script lang="ts">
  import { beers, breweries, counts, styleDistribution, cities, beersOf, verifiedByBrewery, inShops } from "$lib/catalog";
  import { catMeta } from "$lib/styles";
  import Chip from "$lib/Chip.svelte";
  import Thumb from "$lib/Thumb.svelte";

  type View = "beers" | "breweries";
  let view = $state<View>("beers");
  let q = $state("");
  let activeCats = $state<string[]>([]);
  let city = $state("");
  let minAbv = $state(0);
  let onlyValidated = $state(false);
  let onlyVerified = $state(false); // провенанс task-21: подтверждён офиц. каналом пивоварни
  let onlyInShops = $state(false);  // встречается у продавцов (demand)
  let onlyTg = $state(false);
  let sort = $state("name");

  const dist = styleDistribution(); // мета по всему каталогу (headline)
  const cityList = cities();
  const total = beers.length;

  // категории, которые есть у каждой пивоварни — для фильтра во вкладке «Пивоварни»
  const brewCats = new Map<string, Set<string>>(
    breweries.map((b) => [b.slug, new Set(beersOf(b.slug).map((x) => x.style?.category ?? "unknown"))]),
  );

  function toggleCat(c: string) {
    activeCats = activeCats.includes(c) ? activeCats.filter((x) => x !== c) : [...activeCats, c];
  }
  const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

  const filteredBeers = $derived.by(() => {
    const term = norm(q.trim());
    let r = beers.filter((b) => {
      if (activeCats.length && !activeCats.includes(b.style?.category ?? "unknown")) return false;
      if (onlyValidated && b.status !== "validated") return false;
      if (onlyVerified && !verifiedByBrewery(b)) return false;
      if (onlyInShops && !inShops(b)) return false;
      if (minAbv > 0 && (b.abv ?? 0) < minAbv) return false;
      if (city) { const br = b.brewerySlug ? breweries.find((x) => x.slug === b.brewerySlug) : null; if (br?.city !== city) return false; }
      if (term) {
        const hay = norm(`${b.name} ${b.breweryName ?? ""} ${b.style?.name ?? ""} ${b.aliases.join(" ")}`);
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    r = [...r].sort((a, b) =>
      sort === "abv" ? (b.abv ?? -1) - (a.abv ?? -1)
      : sort === "brewery" ? (a.breweryName ?? "").localeCompare(b.breweryName ?? "", "ru")
      : a.name.localeCompare(b.name, "ru"));
    return r;
  });

  const filteredBreweries = $derived.by(() => {
    const term = norm(q.trim());
    let r = breweries.filter((b) => {
      if (city && b.city !== city) return false;
      if (onlyTg && !b.links.some((l) => l.kind === "telegram")) return false;
      if (activeCats.length) { const cs = brewCats.get(b.slug); if (!cs || !activeCats.some((c) => cs.has(c))) return false; }
      if (term) {
        const hay = norm(`${b.name} ${b.aliases.join(" ")} ${b.city ?? ""}`);
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    r = [...r].sort((a, b) =>
      sort === "abv" ? b.beerCount - a.beerCount
      : sort === "brewery" ? (a.city ?? "").localeCompare(b.city ?? "", "ru")
      : a.name.localeCompare(b.name, "ru"));
    return r;
  });

  const resultCount = $derived(view === "beers" ? filteredBeers.length : filteredBreweries.length);
  const hasFilters = $derived(activeCats.length > 0 || !!city || minAbv > 0 || onlyValidated || onlyVerified || onlyInShops || onlyTg || !!q.trim());
  function reset() { q = ""; activeCats = []; city = ""; minAbv = 0; onlyValidated = false; onlyVerified = false; onlyInShops = false; onlyTg = false; }
  const fmtAbv = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);
</script>

<svelte:head><title>Beer Log — мета российского крафта</title></svelte:head>

<!-- МЕТА-ПОЛОСА -->
<section class="meta wrap">
  <div class="stats">
    {#each [["Пивоварен", counts.breweries], ["Сортов", counts.beers], ["Городов", counts.cities], ["Стилей", counts.styles]] as [label, n], i}
      <div class="stat" style="animation-delay: {i * 70}ms">
        <div class="n mono">{n}</div>
        <div class="l">{label}</div>
      </div>
    {/each}
  </div>

  <div class="distwrap">
    <div class="disthead"><span>Распределение по стилям</span><span class="mono">{total} сортов</span></div>
    <div class="bar" role="img" aria-label="распределение сортов по категориям стилей">
      {#each dist as d}
        <button class="seg" style="flex: {d.count}; background: {catMeta(d.category).color}"
          title="{catMeta(d.category).label}: {d.count}"
          class:on={activeCats.includes(d.category)}
          onclick={() => toggleCat(d.category)} aria-label="{catMeta(d.category).label}: {d.count}"></button>
      {/each}
    </div>
    <div class="legend">
      {#each dist as d}
        <button class="lg" onclick={() => toggleCat(d.category)}>
          <Chip category={d.category} count={d.count} dim={activeCats.length > 0 && !activeCats.includes(d.category)} />
        </button>
      {/each}
    </div>
  </div>
</section>

<!-- ТУЛБАР -->
<section class="tools wrap">
  <div class="seg-toggle" role="tablist">
    <button role="tab" aria-selected={view === "beers"} class:on={view === "beers"} onclick={() => (view = "beers")}>Сорта</button>
    <button role="tab" aria-selected={view === "breweries"} class:on={view === "breweries"} onclick={() => (view = "breweries")}>Пивоварни</button>
  </div>

  <div class="search">
    <span class="si">⌕</span>
    <input placeholder={view === "beers" ? "поиск сорта, стиля, пивоварни…" : "поиск пивоварни, города…"} bind:value={q} />
    {#if q}<button class="clr" onclick={() => (q = "")} aria-label="очистить">×</button>{/if}
  </div>

  <div class="filters">
    <select bind:value={city} aria-label="город">
      <option value="">все города</option>
      {#each cityList as c}<option value={c.city}>{c.city} · {c.count}</option>{/each}
    </select>
    {#if view === "beers"}
      <select bind:value={minAbv} aria-label="мин. ABV">
        <option value={0}>любой ABV</option>
        <option value={5}>≥ 5%</option>
        <option value={7}>≥ 7%</option>
        <option value={10}>≥ 10%</option>
      </select>
      <label class="chk"><input type="checkbox" bind:checked={onlyValidated} /> verified</label>
      <label class="chk" title="есть офиц. источник пивоварни"><input type="checkbox" bind:checked={onlyVerified} /> ✓ пивоварня</label>
      <label class="chk" title="встречается у продавцов"><input type="checkbox" bind:checked={onlyInShops} /> в продаже</label>
    {:else}
      <label class="chk"><input type="checkbox" bind:checked={onlyTg} /> с офиц. TG</label>
    {/if}
    <select bind:value={sort} aria-label="сортировка">
      <option value="name">по алфавиту</option>
      {#if view === "beers"}<option value="abv">по ABV ↓</option><option value="brewery">по пивоварне</option>
      {:else}<option value="abv">по числу сортов ↓</option><option value="brewery">по городу</option>{/if}
    </select>
  </div>
</section>

<section class="wrap rhead">
  <span class="rc mono">{resultCount}</span>
  <span class="rl">{view === "beers" ? "сортов" : "пивоварен"}</span>
  {#if hasFilters}<button class="reset" onclick={reset}>сбросить фильтры</button>{/if}
</section>

<!-- РЕЗУЛЬТАТЫ -->
<section class="wrap results">
  {#if view === "beers"}
    <div class="rows beers">
      {#each filteredBeers as b, i (b.slug + (b.brewerySlug ?? ""))}
        <a class="row beer" href={b.brewerySlug ? `/beer/${b.slug}` : "#"} style="--c: {catMeta(b.style?.category).color}; animation-delay: {Math.min(i, 28) * 16}ms">
          <Thumb src={b.imageUrl} name={b.name} size={32} shape="rounded" />
          <span class="nm">{b.name}</span>
          <span class="br">{b.breweryName ?? "—"}</span>
          <span class="ch"><Chip category={b.style?.category} /></span>
          <span class="st">{b.style?.name ?? "—"}</span>
          <span class="ab mono">{fmtAbv(b.abv)}</span>
          <span class="ib mono">{b.ibu != null ? `${b.ibu} IBU` : "—"}</span>
          <span class="sd" class:val={b.status === "validated"} title={b.status}></span>
        </a>
      {/each}
      {#if !filteredBeers.length}<div class="empty">Ничего не найдено. <button onclick={reset}>сбросить</button></div>{/if}
    </div>
  {:else}
    <div class="rows brews">
      {#each filteredBreweries as b, i (b.slug)}
        <a class="row brew" href={`/brewery/${b.slug}`} style="animation-delay: {Math.min(i, 28) * 16}ms">
          <Thumb src={b.imageUrl} name={b.name} size={36} shape="round" />
          <span class="nm">{b.name}</span>
          <span class="cy">{b.city ?? "—"}</span>
          <span class="cnt mono">{b.beerCount}<i>сорт.</i></span>
          <span class="lk">
            {#each b.links.filter((l) => ["telegram", "website", "vk"].includes(l.kind)) as l}
              <span class="badge">{l.kind === "telegram" ? "TG" : l.kind === "website" ? "сайт" : "VK"}</span>
            {/each}
          </span>
        </a>
      {/each}
      {#if !filteredBreweries.length}<div class="empty">Ничего не найдено. <button onclick={reset}>сбросить</button></div>{/if}
    </div>
  {/if}
</section>

<style>
  /* мета */
  .meta { padding-top: 30px; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
  .stat { border: 1px solid var(--line); border-radius: var(--r); padding: 16px 18px; background: linear-gradient(180deg, var(--bg-elev), color-mix(in srgb, var(--bg-elev) 70%, var(--bg))); animation: up 0.5s both; }
  .stat .n { font-size: 38px; font-weight: 500; line-height: 1; color: var(--ink); }
  .stat .l { margin-top: 7px; font-size: 12px; letter-spacing: 0.6px; text-transform: uppercase; color: var(--ink-faint); }
  @media (max-width: 620px) { .stats { grid-template-columns: repeat(2, 1fr); } .stat .n { font-size: 30px; } }

  .distwrap { margin-top: 18px; }
  .disthead { display: flex; justify-content: space-between; font-size: 12px; color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 8px; }
  .bar { display: flex; gap: 2px; height: 14px; border-radius: 4px; overflow: hidden; }
  .seg { border: none; padding: 0; cursor: pointer; transition: opacity 0.15s, transform 0.15s; opacity: 0.92; }
  .seg:hover { opacity: 1; transform: scaleY(1.18); }
  .seg.on { box-shadow: inset 0 0 0 2px rgba(255,255,255,0.55); }
  .legend { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
  .lg { background: none; border: none; padding: 0; cursor: pointer; }

  /* тулбар */
  .tools { display: flex; align-items: center; gap: 12px; margin-top: 26px; flex-wrap: wrap; }
  .seg-toggle { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; padding: 3px; background: var(--bg-elev); }
  .seg-toggle button { font-family: var(--font-display); font-size: 14.5px; letter-spacing: 0.4px; color: var(--ink-dim); background: none; border: none; padding: 6px 18px; border-radius: 999px; cursor: pointer; transition: all 0.15s; }
  .seg-toggle button.on { background: var(--amber); color: #1a1206; font-weight: 600; }

  .search { position: relative; flex: 1 1 280px; display: flex; align-items: center; }
  .search .si { position: absolute; left: 13px; color: var(--ink-faint); font-size: 16px; }
  .search input { width: 100%; background: var(--bg-elev); border: 1px solid var(--line); color: var(--ink); border-radius: 999px; padding: 9px 36px; font-family: var(--font-body); font-size: 14px; transition: border-color 0.15s; }
  .search input:focus { outline: none; border-color: var(--amber-dim); }
  .clr { position: absolute; right: 10px; background: none; border: none; color: var(--ink-faint); font-size: 19px; cursor: pointer; line-height: 1; }

  .filters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  select { background: var(--bg-elev); color: var(--ink-dim); border: 1px solid var(--line); border-radius: 999px; padding: 8px 14px; font-family: var(--font-body); font-size: 13px; cursor: pointer; }
  select:hover { border-color: var(--line-strong); }
  .chk { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink-dim); border: 1px solid var(--line); border-radius: 999px; padding: 7px 13px; cursor: pointer; }
  .chk input { accent-color: var(--amber); }

  .rhead { display: flex; align-items: baseline; gap: 8px; margin-top: 22px; margin-bottom: 8px; }
  .rc { font-size: 20px; color: var(--amber); }
  .rl { color: var(--ink-faint); font-size: 13px; }
  .reset { margin-left: 8px; background: none; border: none; color: var(--ink-dim); font-size: 12.5px; cursor: pointer; text-decoration: underline dotted; }

  /* строки */
  .rows { border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; background: var(--bg-elev); }
  .row { display: grid; align-items: center; gap: 14px; padding: 12px 16px; border-bottom: 1px solid var(--line); position: relative; animation: up 0.4s both; border-left: 2px solid transparent; transition: background 0.13s, border-left-color 0.13s; }
  .row:last-child { border-bottom: none; }
  .row:hover { background: var(--bg-elev-2); border-left-color: var(--c, var(--amber)); }
  .row .nm { font-weight: 600; font-size: 15px; }

  .beer { grid-template-columns: 32px minmax(140px, 1.6fr) minmax(110px, 1fr) auto minmax(90px, 1.2fr) 62px 70px 10px; }
  .beer .br { color: var(--ink-dim); font-size: 13.5px; }
  .beer .st { color: var(--ink-faint); font-size: 12.5px; }
  .beer .ab { color: var(--ink); font-size: 13.5px; text-align: right; }
  .beer .ib { color: var(--ink-faint); font-size: 12px; text-align: right; }
  .beer .sd { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-faint); opacity: 0.5; justify-self: center; }
  .beer .sd.val { background: var(--c-specialty); opacity: 1; box-shadow: 0 0 7px color-mix(in srgb, var(--c-specialty) 60%, transparent); }

  .brew { grid-template-columns: 36px minmax(160px, 2fr) minmax(120px, 1.4fr) 80px auto; }
  .brew .cy { color: var(--ink-dim); font-size: 13.5px; }
  .brew .cnt { color: var(--ink); font-size: 14px; } .brew .cnt i { color: var(--ink-faint); font-style: normal; font-size: 11px; margin-left: 4px; }
  .brew .lk { display: flex; gap: 5px; justify-content: flex-end; }
  .badge { font-size: 10.5px; letter-spacing: 0.4px; color: var(--ink-dim); border: 1px solid var(--line-strong); border-radius: 4px; padding: 1px 6px; text-transform: uppercase; }

  @media (max-width: 720px) {
    .beer { grid-template-columns: 32px 1fr auto 60px; }
    .beer .br, .beer .st, .beer .ib { display: none; }
    .brew { grid-template-columns: 36px 1fr auto auto; }
  }

  .empty { padding: 40px; text-align: center; color: var(--ink-faint); }
  .empty button { color: var(--amber); background: none; border: none; cursor: pointer; text-decoration: underline; }

  @keyframes up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
</style>
