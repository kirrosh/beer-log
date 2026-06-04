<script lang="ts">
  import { onMount } from "svelte";
  import { formatLabel, fmtPrice, plur } from "$lib/catalog";
  import { catMeta } from "$lib/styles";
  import { tgWebApp, haptic } from "$lib/telegram";
  import type { PoolItem, SearchResult } from "./+page";

  let { data } = $props();
  const venue = $derived(data.venue);

  // ── MainButton «Выбрать за меня» (нативный Telegram, TASK-34 #2) ─────────────
  // Случайный сорт из непробованного (фолбэк — весь пул) показываем нативным showPopup.
  function roll() {
    const src = (data.notTasted as PoolItem[]).length ? (data.notTasted as PoolItem[]) : (data.pool as PoolItem[]);
    if (!src.length) return;
    const p = src[Math.floor(Math.random() * src.length)];
    haptic.notify("success");
    const price = p.price != null ? ` · ${fmtPrice(p.price)}` : "";
    const tg = tgWebApp();
    tg?.showPopup?.(
      {
        title: "Бери это 🍺",
        message: `${p.beerName}\n${p.breweryName ?? ""} · ${formatLabel(p.format)}${price}`,
        buttons: [
          { id: "again", type: "default", text: "Ещё" },
          { type: "close", text: "Беру" },
        ],
      },
      (id: string) => { if (id === "again") roll(); },
    );
  }
  onMount(() => {
    const tg = tgWebApp();
    const mb = tg?.MainButton;
    if (!mb) return;
    mb.setText("🎲 Выбрать за меня");
    mb.show();
    mb.onClick(roll);
    return () => { mb.offClick(roll); mb.hide(); };
  });

  const TYPE_LABEL: Record<string, string> = { bar: "бар", shop: "магазин", unknown: "точка" };
  const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

  // beerId → slug (из пула) — для линка кандидатов поиска на карточку сорта
  const slugByBeerId = $derived.by(() => {
    const m = new Map<string, string>();
    for (const p of data.pool as PoolItem[]) if (p.beerId && p.beerSlug) m.set(p.beerId, p.beerSlug);
    return m;
  });

  // ── Каскад «найти ту самую» (горячий путь у полки) ───────────────────────────
  let q = $state("");
  let result = $state<SearchResult | null>(null);
  let searching = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const LEVEL: Record<string, { label: string; tone: string; hint: string }> = {
    exact:   { label: "есть на точке",       tone: "ok",   hint: "точное совпадение в пуле" },
    fuzzy:   { label: "похоже, есть",        tone: "ok",   hint: "близкие по названию позиции пула" },
    brewery: { label: "сорт не узнал — вот бренд", tone: "warn", hint: "этого сорта не нашёл, но пивоварня на точке есть" },
    absent:  { label: "нет на точке",        tone: "miss", hint: "есть в каталоге, но в этом пуле не найдено" },
    none:    { label: "не нашёл",            tone: "miss", hint: "ни на точке, ни в каталоге" },
  };

  function runSearch() {
    const term = q.trim();
    if (!term) { result = null; searching = false; return; }
    searching = true;
    fetch(`/api/venue/${encodeURIComponent(venue.id)}/search?q=${encodeURIComponent(term)}`)
      .then((r) => r.json())
      .then((r: SearchResult) => {
        if (q.trim() !== term) return;
        result = r;
        // тактильный сигнал по тону каскада: нашли/грубо/мимо
        haptic.notify(r.level === "exact" || r.level === "fuzzy" ? "success"
          : r.level === "brewery" ? "warning" : "error");
      })
      .catch(() => { result = null; })
      .finally(() => { searching = false; });
  }
  function onInput() { clearTimeout(timer); timer = setTimeout(runSearch, 180); }
  function clearSearch() { q = ""; result = null; clearTimeout(timer); }

  // ── Пул точки + базовые фильтры ──────────────────────────────────────────────
  let fmtFilter = $state("");
  let poolQ = $state("");

  const formats = $derived.by(() => {
    const m = new Map<string, number>();
    for (const p of data.pool as PoolItem[]) m.set(p.format, (m.get(p.format) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  });

  const filteredPool = $derived.by(() => {
    const term = norm(poolQ.trim());
    return (data.pool as PoolItem[])
      .filter((p) => {
        if (fmtFilter && p.format !== fmtFilter) return false;
        if (term && !norm(`${p.beerName} ${p.breweryName ?? ""} ${p.rawTitle}`).includes(term)) return false;
        return true;
      })
      .sort((a, b) =>
        (a.breweryName ?? "я").localeCompare(b.breweryName ?? "я", "ru") ||
        a.beerName.localeCompare(b.beerName, "ru"));
  });

  // ── Личные срезы ─────────────────────────────────────────────────────────────
  const notTasted = $derived(data.notTasted as PoolItem[]);
  const fromFav = $derived(data.fromFavorites as PoolItem[]);
  const highlights = $derived(data.highlights);
  let showAllNew = $state(false);
  const NEW_CAP = 10;

  // свежесть наблюдения (best-effort, не живой остаток)
  const today = new Date();
  function ageDays(d: string): number {
    const t = new Date(d).getTime();
    if (Number.isNaN(t)) return -1;
    return Math.round((today.getTime() - t) / 86_400_000);
  }
  const lastSeen = $derived(
    (data.pool as PoolItem[]).map((p) => p.seenAt).filter(Boolean).sort().at(-1) ?? null,
  );
</script>

<svelte:head><title>{venue.name} — Beer Log</title></svelte:head>

<article class="wrap page">
  <nav class="crumb"><a href="/venues">Точки</a><span class="d">·</span><span>{venue.city ?? "—"}</span></nav>

  <header class="head">
    <span class="type t-{venue.type}">{TYPE_LABEL[venue.type] ?? venue.type}</span>
    <h1>{venue.name}</h1>
    <div class="hmeta">
      <span class="mono">{data.pool.length}</span> позиций в пуле
      {#if data.stats.tastedHere}<span class="d">·</span> пробовал тут <span class="mono">{data.stats.tastedHere}</span>{/if}
    </div>
  </header>

  <!-- ПОИСК «НАЙТИ ТУ САМУЮ» — горячий путь -->
  <section class="finder">
    <div class="search">
      <span class="si">⌕</span>
      <input
        placeholder="что на банке / из головы — найти на этой точке…"
        bind:value={q} oninput={onInput} autocomplete="off" autocapitalize="off" spellcheck="false" />
      {#if q}<button class="clr" onclick={clearSearch} aria-label="очистить">×</button>{/if}
    </div>

    {#if result}
      {@const lv = LEVEL[result.level]}
      <div class="res tone-{lv.tone}">
        <div class="resbar">
          <span class="lvl">{lv.label}</span>
          <span class="lvh">{lv.hint}</span>
        </div>
        {#if result.candidates.length}
          <div class="cands">
            {#each result.candidates as c}
              {@const slug = c.beerId ? slugByBeerId.get(c.beerId) : null}
              <div class="cand">
                {#if slug}<a class="cnm" href={`/beer/${slug}`}>{c.beerName}</a>{:else}<span class="cnm plain">{c.beerName}</span>{/if}
                <span class="cbr">{c.breweryName ?? "—"}</span>
                {#if result.level !== "absent"}<span class="cfmt">{formatLabel(c.format)}</span>{/if}
                {#if c.score > 0}<span class="cscore mono" title="сходство с запросом">{Math.round(c.score * 100)}%</span>{/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {:else if searching}
      <div class="hint">ищу…</div>
    {/if}
  </section>

  <!-- ЛИЧНОЕ -->
  {#if highlights.length}
    <section class="block">
      <h2>Топ точки</h2>
      <div class="hl">
        {#each highlights as h}
          {@const slug = h.item?.beerSlug}
          <div class="hlrow" class:gone={!h.inPool}>
            <span class="badge">{h.badge}</span>
            <div class="hlmain">
              {#if slug}<a class="hnm" href={`/beer/${slug}`}>{h.beer}</a>{:else}<span class="hnm">{h.beer}</span>{/if}
              <span class="hreason">{h.reason}</span>
            </div>
            {#if h.inPool && h.item}<span class="hfmt">{formatLabel(h.item.format)}</span>
            {:else}<span class="hgone">нет сейчас</span>{/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if fromFav.length}
    <section class="block">
      <h2>От твоих любимых <span class="rc mono">· {fromFav.length}</span></h2>
      <div class="rows">
        {#each fromFav as p}
          <div class="prow" style="--c: {catMeta(p.styleCategory).color}">
            {#if p.beerSlug}<a class="pnm" href={`/beer/${p.beerSlug}`}>{p.beerName}</a>{:else}<span class="pnm plain">{p.beerName || p.rawTitle}</span>{/if}
            <span class="pbr">{p.breweryName ?? "—"}</span>
            <span class="pfmt">{formatLabel(p.format)}</span>
            <span class="ppr mono">{p.price != null ? fmtPrice(p.price) : "—"}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if notTasted.length}
    <section class="block">
      <h2>Ещё не пробовал тут <span class="rc mono">· {notTasted.length}</span></h2>
      <div class="rows">
        {#each (showAllNew ? notTasted : notTasted.slice(0, NEW_CAP)) as p}
          <div class="prow" style="--c: {catMeta(p.styleCategory).color}">
            {#if p.beerSlug}<a class="pnm" href={`/beer/${p.beerSlug}`}>{p.beerName}</a>{:else}<span class="pnm plain">{p.beerName || p.rawTitle}</span>{/if}
            <span class="pbr">{p.breweryName ?? "—"}</span>
            <span class="pfmt">{formatLabel(p.format)}</span>
            <span class="ppr mono">{p.price != null ? fmtPrice(p.price) : "—"}</span>
          </div>
        {/each}
      </div>
      {#if notTasted.length > NEW_CAP}
        <button class="more" onclick={() => (showAllNew = !showAllNew)}>
          {showAllNew ? "свернуть" : `показать все ${notTasted.length}`}
        </button>
      {/if}
    </section>
  {/if}

  <!-- ПУЛ ТОЧКИ -->
  <section class="block">
    <h2>Что на точке <span class="rc mono">· {filteredPool.length}</span></h2>
    <div class="pooltools">
      <div class="fmtchips">
        <button class="fc" class:on={!fmtFilter} onclick={() => { haptic.select(); fmtFilter = ""; }}>все</button>
        {#each formats as [f, n]}
          <button class="fc" class:on={fmtFilter === f} onclick={() => { haptic.select(); fmtFilter = f; }}>{formatLabel(f)} <span class="fn mono">{n}</span></button>
        {/each}
      </div>
      <div class="search sm">
        <span class="si">⌕</span>
        <input placeholder="фильтр по пулу…" bind:value={poolQ} />
        {#if poolQ}<button class="clr" onclick={() => (poolQ = "")} aria-label="очистить">×</button>{/if}
      </div>
    </div>
    <div class="rows">
      {#each filteredPool as p (p.rawTitle + p.format)}
        <div class="prow" style="--c: {catMeta(p.styleCategory).color}">
          {#if p.beerSlug}<a class="pnm" href={`/beer/${p.beerSlug}`}>{p.beerName}</a>{:else}<span class="pnm plain">{p.beerName || p.rawTitle}</span>{/if}
          <span class="pbr">{p.breweryName ?? "—"}</span>
          <span class="pfmt">{formatLabel(p.format)}</span>
          <span class="ppr mono">{p.price != null ? fmtPrice(p.price) : "—"}</span>
          <span class="pdt mono" title="дата наблюдения">{p.seenAt}</span>
        </div>
      {/each}
      {#if !filteredPool.length}<div class="empty">Ничего не нашлось под фильтр.</div>{/if}
    </div>
    {#if lastSeen}
      <p class="note">Наличие — best-effort по последнему срезу меню ({lastSeen}{#if ageDays(lastSeen) >= 0}, {ageDays(lastSeen)} {plur(ageDays(lastSeen), "день", "дня", "дней")} назад{/if}), не живой остаток. Кран ротируется быстро.</p>
    {/if}
  </section>
</article>

<style>
  .page { padding-top: 24px; max-width: 880px; }
  .crumb { font-size: 13.5px; color: var(--ink-dim); display: flex; align-items: center; gap: 8px; }
  .crumb a { color: var(--amber); } .crumb a:hover { text-decoration: underline; }
  .crumb .d { color: var(--ink-faint); }

  .head { padding: 14px 0 8px; }
  .type { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--ink-faint); border: 1px solid var(--line-strong); border-radius: 5px; padding: 2px 8px; }
  .type.t-bar { color: var(--c-specialty); border-color: color-mix(in srgb, var(--c-specialty) 40%, var(--line)); }
  h1 { font-size: 38px; font-weight: 600; line-height: 1.05; margin: 12px 0 0; }
  .hmeta { color: var(--ink-dim); font-size: 13.5px; margin-top: 8px; }
  .hmeta .d { color: var(--ink-faint); margin: 0 4px; }

  /* поиск */
  .finder { margin: 20px 0 6px; }
  .search { position: relative; display: flex; align-items: center; }
  .search .si { position: absolute; left: 15px; color: var(--ink-faint); font-size: 17px; }
  .search input { width: 100%; background: var(--bg-elev); border: 1px solid var(--line-strong); color: var(--ink); border-radius: 12px; padding: 14px 42px; font-family: var(--font-body); font-size: 16px; transition: border-color 0.15s; }
  .search input:focus { outline: none; border-color: var(--amber-dim); }
  .search .clr { position: absolute; right: 12px; background: none; border: none; color: var(--ink-faint); font-size: 21px; cursor: pointer; line-height: 1; }
  .search.sm input { padding: 9px 36px; font-size: 14px; border-radius: 999px; border-color: var(--line); }
  .search.sm .si { font-size: 15px; left: 13px; }
  .search.sm .clr { font-size: 18px; }

  .res { margin-top: 12px; border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; background: var(--bg-elev); border-left: 3px solid var(--ink-faint); }
  .res.tone-ok { border-left-color: var(--c-specialty); }
  .res.tone-warn { border-left-color: var(--amber); }
  .res.tone-miss { border-left-color: var(--sour, var(--c-sour-wild)); }
  .resbar { display: flex; align-items: baseline; gap: 10px; padding: 11px 16px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .lvl { font-family: var(--font-display); font-size: 16px; font-weight: 600; }
  .tone-ok .lvl { color: var(--c-specialty); } .tone-warn .lvl { color: var(--amber); } .tone-miss .lvl { color: var(--c-sour-wild); }
  .lvh { color: var(--ink-faint); font-size: 12.5px; }
  .cands { display: flex; flex-direction: column; }
  .cand { display: grid; grid-template-columns: minmax(140px, 1.6fr) minmax(100px, 1fr) auto auto; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--line); }
  .cand:last-child { border-bottom: none; }
  .cnm { font-weight: 600; color: var(--ink); } .cnm:hover { color: var(--amber); } .cnm.plain:hover { color: var(--ink); }
  .cbr { color: var(--ink-dim); font-size: 13px; }
  .cfmt { font-size: 11.5px; color: var(--ink-dim); background: var(--bg-elev-2); border-radius: 5px; padding: 2px 8px; }
  .cscore { font-size: 12px; color: var(--ink-faint); text-align: right; }

  .hint { margin-top: 12px; color: var(--ink-faint); font-size: 13px; }

  /* блоки */
  .block { margin-top: 30px; }
  .block h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--ink-faint); margin-bottom: 12px; }
  .block h2 .rc { color: var(--amber); text-transform: none; letter-spacing: 0; font-size: 14px; }

  .rows { border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; background: var(--bg-elev); }
  .prow { display: grid; grid-template-columns: minmax(140px, 1.7fr) minmax(110px, 1fr) auto 74px 92px; align-items: center; gap: 12px; padding: 10px 15px; border-bottom: 1px solid var(--line); border-left: 2px solid var(--c, transparent); transition: background 0.12s; }
  .prow:last-child { border-bottom: none; }
  .prow:hover { background: var(--bg-elev-2); }
  .pnm { font-weight: 600; color: var(--ink); } .pnm:hover { color: var(--amber); } .pnm.plain { color: var(--ink-dim); }
  .pbr { color: var(--ink-dim); font-size: 13px; }
  .pfmt { font-size: 11.5px; color: var(--ink-dim); background: var(--bg-elev-2); border-radius: 5px; padding: 2px 8px; justify-self: start; }
  .ppr { color: var(--ink); font-size: 13.5px; text-align: right; }
  .pdt { color: var(--ink-faint); font-size: 11.5px; text-align: right; }
  .more { margin-top: 10px; background: none; border: none; color: var(--amber); font-size: 13px; cursor: pointer; text-decoration: underline dotted; }

  /* highlights */
  .hl { display: flex; flex-direction: column; gap: 8px; }
  .hlrow { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; border: 1px solid var(--line); border-radius: var(--r); padding: 12px 15px; background: var(--bg-elev); border-left: 2px solid var(--amber); }
  .hlrow.gone { border-left-color: var(--line-strong); opacity: 0.62; }
  .badge { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; color: #1a1206; background: var(--amber); border-radius: 5px; padding: 3px 8px; }
  .hlrow.gone .badge { background: var(--ink-faint); color: var(--bg); }
  .hlmain { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .hnm { font-weight: 600; color: var(--ink); } a.hnm:hover { color: var(--amber); }
  .hreason { color: var(--ink-dim); font-size: 12.5px; }
  .hfmt { font-size: 11.5px; color: var(--ink-dim); background: var(--bg-elev-2); border-radius: 5px; padding: 2px 8px; }
  .hgone { font-size: 11.5px; color: var(--ink-faint); }

  /* пул-тулбар */
  .pooltools { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
  .fmtchips { display: flex; gap: 6px; flex-wrap: wrap; }
  .fc { font-size: 12.5px; color: var(--ink-dim); background: var(--bg-elev); border: 1px solid var(--line); border-radius: 999px; padding: 6px 12px; cursor: pointer; transition: all 0.13s; }
  .fc:hover { border-color: var(--line-strong); }
  .fc.on { color: #1a1206; background: var(--amber); border-color: var(--amber); font-weight: 600; }
  .fc .fn { font-size: 11px; opacity: 0.75; }
  .pooltools .search.sm { flex: 1 1 200px; max-width: 320px; }

  .note { margin: 11px 0 0; font-size: 12px; color: var(--ink-faint); line-height: 1.5; }
  .empty { padding: 28px; text-align: center; color: var(--ink-faint); }

  @media (max-width: 600px) {
    h1 { font-size: 30px; }
    .prow { grid-template-columns: 1fr auto auto; gap: 5px 10px; }
    .prow .pbr { grid-column: 1; font-size: 12px; }
    .prow .pdt { display: none; }
    .cand { grid-template-columns: 1fr auto; }
    .cand .cbr { grid-column: 1; }
  }
</style>
