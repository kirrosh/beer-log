<script lang="ts">
  import { catMeta } from "$lib/styles";
  import { fmtPrice, plur, sellerLabel, sellerUrl, SELLER_KIND_LABEL, formatLabel,
    channelLabels, beerConfidence, confirmationLevel } from "$lib/catalog";
  import Chip from "$lib/Chip.svelte";
  import Thumb from "$lib/Thumb.svelte";
  let { data } = $props();
  const beer = $derived(data.beer);
  const brewery = $derived(data.brewery);
  const siblings = $derived(data.siblings);
  const m = $derived(catMeta(beer.style?.category));
  // провенанс (task-21): два рыночных сигнала + их комбинация
  const conf = $derived(beerConfidence(beer));
  const channelNames = $derived(channelLabels(beer));
  // уровень подтверждённости (task-26): число независимых офиц. каналов; ≥2 = cross-source канон
  const lvl = $derived(confirmationLevel(beer));
  const host = (u: string) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return u; } };
  // дата самого свежего снапшота среди точек продажи (данные best-effort, не живой остаток)
  const lastSeen = $derived(
    beer.demand?.places.length ? beer.demand.places.map((p) => p.seenAt).sort().at(-1) : null,
  );
</script>

<svelte:head><title>{beer.name} — {beer.breweryName ?? "Beer Log"}</title></svelte:head>

<article class="wrap detail" style="--c: {m.color}">
  <nav class="crumb">
    {#if brewery}<a href={`/brewery/${brewery.slug}`}>{brewery.name}</a>{:else}<span>{beer.breweryName ?? "—"}</span>{/if}
    {#if brewery?.city}<span class="dot">·</span><span class="city">{brewery.city}</span>{/if}
  </nav>

  <header class="head">
    <div class="accent"></div>
    <div class="htext">
      <h1>{beer.name}</h1>
      {#if beer.aliases.length}<div class="al">{beer.aliases.join(" · ")}</div>{/if}
      <div class="styline">
        <Chip category={beer.style?.category} />
        {#if beer.style?.name}<span class="sn">{beer.style.name}</span>{/if}
      </div>
    </div>
    <div class="label"><Thumb src={beer.imageUrl} name={beer.name} size={104} shape="rounded" /></div>
  </header>

  <div class="cells">
    <div class="cell"><div class="cn mono">{beer.abv != null ? beer.abv.toFixed(1) : "—"}<i>%</i></div><div class="cl">алкоголь</div></div>
    <div class="cell"><div class="cn mono">{beer.ibu ?? "—"}</div><div class="cl">IBU</div></div>
  </div>

  <!-- Провенанс (task-21): два независимых рыночных сигнала + комбинированная уверенность -->
  <section class="prov" class:gap={conf === "shop"}>
    <span class="sig" class:on={lvl} class:cross={lvl >= 2}>
      <i class="mk">{lvl ? "✓" : "·"}</i>
      <span class="st">варит пивоварня</span>
      {#if lvl}
        <span class="sub">подтверждён {lvl} {plur(lvl, "источником", "источниками", "источниками")}: {channelNames}</span>
        {#if lvl >= 2}<span class="badge" title="подтверждён несколькими независимыми офиц. каналами — самый надёжный канон">cross-source</span>{/if}
      {:else}<span class="sub off">у пивоварни не подтверждён</span>{/if}
    </span>
    <span class="sig" class:on={beer.demand}>
      <i class="mk">{beer.demand ? "✓" : "·"}</i>
      <span class="st">в продаже</span>
      {#if beer.demand}<span class="sub">{beer.demand.reach} {plur(beer.demand.reach, "точка", "точки", "точек")}</span>{:else}<span class="sub off">у продавцов не найден</span>{/if}
    </span>
    {#if conf === "shop"}
      <span class="hint">в продаже есть, но у пивоварни не подтверждён — кандидат на проверку каналов</span>
    {/if}
  </section>

  {#if beer.demand?.places.length}
    <section class="block where">
      <h2>Где найти <span class="rc mono">· {beer.demand.reach} {plur(beer.demand.reach, "точка", "точки", "точек")}</span></h2>
      <div class="places">
        {#each beer.demand.places as p}
          <div class="place" class:opt={p.kind === "opt"}>
            <span class="snm"><a class="slink" href={sellerUrl(p.seller)} target="_blank" rel="noopener">{sellerLabel(p.seller)} ↗</a><span class="kind k-{p.kind}">{SELLER_KIND_LABEL[p.kind]}</span></span>
            <span class="fmts">{#each p.formats as f}<span class="fmt">{formatLabel(f)}</span>{/each}</span>
            <span class="pr mono" class:disc={p.discounted}>
              {#if p.kind === "opt"}опт{:else if p.minPrice != null}от {fmtPrice(p.minPrice)}{:else if p.kind === "bar"}разлив{:else}—{/if}
            </span>
            <span class="dt mono">{p.seenAt}</span>
          </div>
        {/each}
      </div>
      <p class="note">Рыночная информация о доступности на {lastSeen} — best-effort, не живой остаток. Цена «от» — розница (опт и кег исключены).</p>
    </section>
  {/if}

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
            <Thumb src={s.imageUrl} name={s.name} size={30} shape="rounded" />
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

  .head { position: relative; padding: 18px 0 22px; display: flex; align-items: flex-start; gap: 20px; }
  .htext { flex: 1 1 auto; min-width: 0; }
  .label { flex: 0 0 auto; margin-top: 2px; }
  .accent { position: absolute; left: -22px; top: 22px; width: 4px; height: 46px; background: var(--c); border-radius: 4px; box-shadow: 0 0 16px color-mix(in srgb, var(--c) 60%, transparent); }
  h1 { font-size: 42px; font-weight: 600; line-height: 1.05; letter-spacing: 0.3px; }
  .al { color: var(--ink-faint); font-size: 13.5px; margin-top: 6px; }
  .styline { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
  .sn { color: var(--ink-dim); font-size: 14px; }

  .cells { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 6px 0 8px; }
  .cell { border: 1px solid var(--line); border-radius: var(--r); padding: 16px 18px; background: var(--bg-elev); }
  .cn { font-size: 32px; font-weight: 500; line-height: 1; color: var(--ink); } .cn i { font-size: 16px; color: var(--ink-faint); font-style: normal; margin-left: 2px; }
  .cl { margin-top: 8px; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--ink-faint); }

  /* Провенанс — два рыночных сигнала (task-21) */
  .prov { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0 4px; }
  .sig { display: inline-flex; align-items: baseline; gap: 8px; border: 1px solid var(--line); border-radius: 999px; padding: 8px 15px; background: var(--bg-elev); }
  .sig .mk { font-style: normal; color: var(--ink-faint); font-size: 14px; width: 1ch; text-align: center; }
  .sig.on { border-color: color-mix(in srgb, var(--c-specialty) 38%, var(--line)); }
  .sig.on .mk { color: var(--c-specialty); }
  .sig .st { font-weight: 500; color: var(--ink); font-size: 14px; }
  .sig .sub { color: var(--ink-dim); font-size: 12.5px; }
  .sig .sub.off { color: var(--ink-faint); }
  /* cross-source канон (task-26): ≥2 независимых офиц. канала — высший класс доверия */
  .sig.cross { border-color: color-mix(in srgb, var(--c-specialty) 58%, var(--line)); background: color-mix(in srgb, var(--c-specialty) 9%, var(--bg-elev)); }
  .sig.cross .mk { color: var(--c-specialty); font-weight: 700; }
  .sig .badge { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; color: var(--c-specialty); border: 1px solid color-mix(in srgb, var(--c-specialty) 45%, var(--line)); border-radius: 5px; padding: 1px 6px; }
  .prov .hint { flex-basis: 100%; font-size: 12.5px; color: var(--ink-faint); line-height: 1.5; }
  .prov.gap .sig:first-child { border-color: color-mix(in srgb, var(--amber) 34%, var(--line)); }
  .prov.gap .sig:first-child .sub.off { color: var(--amber-dim); }

  .block { margin-top: 28px; }
  .block h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--ink-faint); margin-bottom: 12px; }
  .desc { font-size: 16px; line-height: 1.65; color: var(--ink); max-width: 64ch; margin: 0; }

  .links { display: flex; flex-wrap: wrap; gap: 9px; }
  .lnk { font-size: 13px; color: var(--ink-dim); border: 1px solid var(--line); border-radius: 999px; padding: 7px 14px; font-family: var(--font-mono); transition: all 0.15s; }
  .lnk:hover { color: var(--ink); border-color: var(--amber-dim); }

  /* Где найти — блок ров доступности (task-20) */
  .where h2 .rc { color: var(--ink-dim); text-transform: none; letter-spacing: 0; font-size: 13px; }
  .places { border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; background: var(--bg-elev); }
  .place { display: grid; grid-template-columns: minmax(150px, 1.4fr) minmax(80px, 1fr) auto 92px; align-items: center; gap: 12px; padding: 11px 15px; border-bottom: 1px solid var(--line); border-left: 2px solid var(--c); }
  .place:last-child { border-bottom: none; }
  .place.opt { border-left-color: var(--line-strong); }
  .snm { font-weight: 500; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .slink { color: var(--ink); transition: color 0.15s; } .slink:hover { color: var(--amber); }
  .kind { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--ink-faint); border: 1px solid var(--line); border-radius: 5px; padding: 1px 6px; }
  .kind.k-bar { color: var(--c-specialty); border-color: color-mix(in srgb, var(--c-specialty) 40%, var(--line)); }
  .kind.k-opt { color: var(--ink-faint); }
  .fmts { display: flex; flex-wrap: wrap; gap: 6px; }
  .fmt { font-size: 11.5px; color: var(--ink-dim); background: var(--bg-elev-2); border-radius: 5px; padding: 2px 8px; }
  .place .pr { color: var(--ink); font-size: 14px; text-align: right; }
  .place .pr.disc { color: var(--c-specialty); }
  .place .dt { color: var(--ink-faint); font-size: 11.5px; text-align: right; }
  .note { margin: 11px 0 0; font-size: 12px; color: var(--ink-faint); line-height: 1.5; }

  .sib { border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
  .sibrow { display: grid; grid-template-columns: 30px 1fr auto 60px; align-items: center; gap: 12px; padding: 11px 15px; border-bottom: 1px solid var(--line); border-left: 2px solid transparent; transition: background 0.13s, border-color 0.13s; }
  .sibrow:last-child { border-bottom: none; }
  .sibrow:hover { background: var(--bg-elev-2); border-left-color: var(--c); }
  .sname { font-weight: 500; }
  .sabv { color: var(--ink-dim); font-size: 13px; text-align: right; }

  @media (max-width: 560px) {
    h1 { font-size: 32px; } .cells { grid-template-columns: 1fr 1fr; }
    .place { grid-template-columns: 1fr auto; gap: 6px 12px; }
    .place .fmts { grid-column: 1; } .place .dt { grid-column: 2; }
  }
</style>
