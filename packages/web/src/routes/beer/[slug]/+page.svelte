<script lang="ts">
  import { catMeta } from "$lib/styles";
  import Chip from "$lib/Chip.svelte";
  let { data } = $props();
  const beer = $derived(data.beer);
  const brewery = $derived(data.brewery);
  const siblings = $derived(data.siblings);
  const m = $derived(catMeta(beer.style?.category));
  const host = (u: string) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return u; } };
</script>

<svelte:head><title>{beer.name} — {beer.breweryName ?? "Beer Log"}</title></svelte:head>

<article class="wrap detail" style="--c: {m.color}">
  <nav class="crumb">
    {#if brewery}<a href={`/brewery/${brewery.slug}`}>{brewery.name}</a>{:else}<span>{beer.breweryName ?? "—"}</span>{/if}
    {#if brewery?.city}<span class="dot">·</span><span class="city">{brewery.city}</span>{/if}
  </nav>

  <header class="head">
    <div class="accent"></div>
    <h1>{beer.name}</h1>
    {#if beer.aliases.length}<div class="al">{beer.aliases.join(" · ")}</div>{/if}
    <div class="styline">
      <Chip category={beer.style?.category} />
      {#if beer.style?.name}<span class="sn">{beer.style.name}</span>{/if}
    </div>
  </header>

  <div class="cells">
    <div class="cell"><div class="cn mono">{beer.abv != null ? beer.abv.toFixed(1) : "—"}<i>%</i></div><div class="cl">алкоголь</div></div>
    <div class="cell"><div class="cn mono">{beer.ibu ?? "—"}</div><div class="cl">IBU</div></div>
    <div class="cell"><div class="cn st" class:val={beer.status === "validated"}>{beer.status === "validated" ? "✓" : "~"}</div><div class="cl">{beer.status === "validated" ? "из офиц. канала" : "не подтверждён"}</div></div>
  </div>

  {#if beer.description}
    <section class="block">
      <h2>Описание</h2>
      <p class="desc">{beer.description}</p>
    </section>
  {/if}

  {#if beer.sources.length}
    <section class="block">
      <h2>Источники</h2>
      <div class="links">
        {#each beer.sources as s}<a class="lnk" href={s} target="_blank" rel="noopener">{host(s)} ↗</a>{/each}
      </div>
    </section>
  {/if}

  {#if siblings.length}
    <section class="block">
      <h2>Ещё у {brewery?.name}</h2>
      <div class="sib">
        {#each siblings as s}
          <a class="sibrow" href={`/beer/${s.slug}`} style="--c: {catMeta(s.style?.category).color}">
            <span class="sname">{s.name}</span>
            <Chip category={s.style?.category} />
            <span class="sabv mono">{s.abv != null ? `${s.abv.toFixed(1)}%` : "—"}</span>
          </a>
        {/each}
      </div>
    </section>
  {/if}
</article>

<style>
  .detail { padding-top: 26px; max-width: 860px; }
  .crumb { font-size: 13.5px; color: var(--ink-dim); display: flex; align-items: center; gap: 8px; }
  .crumb a { color: var(--amber); } .crumb a:hover { text-decoration: underline; }
  .crumb .dot { color: var(--ink-faint); } .crumb .city { color: var(--ink-faint); }

  .head { position: relative; padding: 18px 0 22px; }
  .accent { position: absolute; left: -22px; top: 22px; width: 4px; height: 46px; background: var(--c); border-radius: 4px; box-shadow: 0 0 16px color-mix(in srgb, var(--c) 60%, transparent); }
  h1 { font-size: 42px; font-weight: 600; line-height: 1.05; letter-spacing: 0.3px; }
  .al { color: var(--ink-faint); font-size: 13.5px; margin-top: 6px; }
  .styline { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
  .sn { color: var(--ink-dim); font-size: 14px; }

  .cells { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 6px 0 8px; }
  .cell { border: 1px solid var(--line); border-radius: var(--r); padding: 16px 18px; background: var(--bg-elev); }
  .cn { font-size: 32px; font-weight: 500; line-height: 1; color: var(--ink); } .cn i { font-size: 16px; color: var(--ink-faint); font-style: normal; margin-left: 2px; }
  .cn.st { color: var(--ink-faint); } .cn.st.val { color: var(--c-specialty); }
  .cl { margin-top: 8px; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--ink-faint); }

  .block { margin-top: 28px; }
  .block h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--ink-faint); margin-bottom: 12px; }
  .desc { font-size: 16px; line-height: 1.65; color: var(--ink); max-width: 64ch; margin: 0; }

  .links { display: flex; flex-wrap: wrap; gap: 9px; }
  .lnk { font-size: 13px; color: var(--ink-dim); border: 1px solid var(--line); border-radius: 999px; padding: 7px 14px; font-family: var(--font-mono); transition: all 0.15s; }
  .lnk:hover { color: var(--ink); border-color: var(--amber-dim); }

  .sib { border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
  .sibrow { display: grid; grid-template-columns: 1fr auto 60px; align-items: center; gap: 12px; padding: 11px 15px; border-bottom: 1px solid var(--line); border-left: 2px solid transparent; transition: background 0.13s, border-color 0.13s; }
  .sibrow:last-child { border-bottom: none; }
  .sibrow:hover { background: var(--bg-elev-2); border-left-color: var(--c); }
  .sname { font-weight: 500; }
  .sabv { color: var(--ink-dim); font-size: 13px; text-align: right; }

  @media (max-width: 560px) { h1 { font-size: 32px; } .cells { grid-template-columns: 1fr 1fr; } }
</style>
