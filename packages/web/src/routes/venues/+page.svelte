<script lang="ts">
  import type { VenueInfo } from "./+page";
  let { data } = $props();
  let q = $state("");

  const TYPE_LABEL: Record<string, string> = { bar: "бар", shop: "магазин", unknown: "точка" };
  const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

  const filtered = $derived.by(() => {
    const term = norm(q.trim());
    const list = (data.venues as VenueInfo[]).filter((v) =>
      !term || norm(`${v.name} ${v.city ?? ""}`).includes(term));
    return list;
  });

  // группировка по городу для навигации «по карте»
  const byCity = $derived.by(() => {
    const m = new Map<string, VenueInfo[]>();
    for (const v of filtered) {
      const c = v.city ?? "Без города";
      (m.get(c) ?? m.set(c, []).get(c)!).push(v);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  });
</script>

<svelte:head><title>Точки — Beer Log</title></svelte:head>

<section class="wrap head">
  <h1>Точки</h1>
  <p class="sub">Что налито и в холодильнике прямо сейчас — поиск «той самой» у полки, личные срезы и провенанс наличия.</p>
</section>

{#if data.offline}
  <section class="wrap">
    <div class="offline">
      <strong>API точек недоступен.</strong>
      <p>Экран точки тянет живые данные из локального сервера. Запусти его рядом с витриной:</p>
      <code>bun run venue:api</code>
      <p class="mono dim">или одной командой вместе с витриной: <code>bun run venue:dev</code></p>
    </div>
  </section>
{:else}
  <section class="wrap tools">
    <div class="search">
      <span class="si">⌕</span>
      <input placeholder="поиск точки или города…" bind:value={q} />
      {#if q}<button class="clr" onclick={() => (q = "")} aria-label="очистить">×</button>{/if}
    </div>
    <span class="rc mono">{filtered.length}</span><span class="rl">точек</span>
  </section>

  <section class="wrap list">
    {#each byCity as [city, venues]}
      <div class="citygrp">
        <div class="cityhd"><span>{city}</span><span class="mono">{venues.length}</span></div>
        <div class="cards">
          {#each venues as v (v.id)}
            <a class="card" href={`/venue/${v.id}`}>
              <span class="t t-{v.type}">{TYPE_LABEL[v.type] ?? v.type}</span>
              <span class="nm">{v.name}</span>
              <span class="meta mono">{v.poolSize} позиц.</span>
            </a>
          {/each}
        </div>
      </div>
    {/each}
    {#if !filtered.length}<div class="empty">Ничего не найдено.</div>{/if}
  </section>
{/if}

<style>
  .head { padding-top: 30px; max-width: 760px; }
  h1 { font-size: 40px; font-weight: 600; }
  .sub { color: var(--ink-dim); font-size: 15px; line-height: 1.6; margin: 10px 0 0; }

  .tools { display: flex; align-items: center; gap: 10px; margin-top: 24px; }
  .search { position: relative; flex: 1 1 280px; max-width: 440px; display: flex; align-items: center; }
  .search .si { position: absolute; left: 13px; color: var(--ink-faint); font-size: 16px; }
  .search input { width: 100%; background: var(--bg-elev); border: 1px solid var(--line); color: var(--ink); border-radius: 999px; padding: 9px 36px; font-family: var(--font-body); font-size: 14px; }
  .search input:focus { outline: none; border-color: var(--amber-dim); }
  .clr { position: absolute; right: 10px; background: none; border: none; color: var(--ink-faint); font-size: 19px; cursor: pointer; line-height: 1; }
  .rc { font-size: 20px; color: var(--amber); margin-left: 6px; }
  .rl { color: var(--ink-faint); font-size: 13px; }

  .list { margin-top: 22px; display: flex; flex-direction: column; gap: 26px; }
  .cityhd { display: flex; justify-content: space-between; font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--ink-faint); margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
  .card { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 10px; align-items: center; border: 1px solid var(--line); border-radius: var(--r); padding: 14px 16px; background: var(--bg-elev); border-left: 2px solid transparent; transition: background 0.13s, border-left-color 0.13s; }
  .card:hover { background: var(--bg-elev-2); border-left-color: var(--amber); }
  .card .nm { grid-column: 2; font-weight: 600; font-size: 15px; }
  .card .t { grid-row: 1 / 3; align-self: center; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--ink-faint); border: 1px solid var(--line-strong); border-radius: 5px; padding: 2px 7px; }
  .card .t-bar { color: var(--c-specialty); border-color: color-mix(in srgb, var(--c-specialty) 40%, var(--line)); }
  .card .meta { grid-column: 2; color: var(--ink-faint); font-size: 11.5px; margin-top: 2px; }

  .offline { margin-top: 24px; border: 1px solid var(--line); border-radius: var(--r); padding: 22px 24px; background: var(--bg-elev); max-width: 640px; }
  .offline p { color: var(--ink-dim); font-size: 14px; line-height: 1.6; margin: 8px 0; }
  .offline code { font-family: var(--font-mono); font-size: 13px; color: var(--amber); background: var(--bg-elev-2); border: 1px solid var(--line); border-radius: 6px; padding: 3px 8px; display: inline-block; }
  .offline .dim { color: var(--ink-faint); font-size: 12.5px; }
  .empty { padding: 40px; text-align: center; color: var(--ink-faint); }
</style>
