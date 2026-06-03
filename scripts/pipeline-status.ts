// Трекер конвейера (control plane): ВЫВОДИТ состояние каждой пивоварни/магазина/города
// из catalog.sqlite + ingest-hints + breweries.links, накладывает ручные overrides.json
// (валидация/блокеры/приоритет) и печатает дашборд-чеклист + очередь «следующих действий».
// Источник правды по данным — БД; этот скрипт ничего не меняет в каталоге (read-only).
//
//   bun run scripts/pipeline-status.ts            # дашборд + queue
//   bun run scripts/pipeline-status.ts --json     # только записать data/pipeline/state.json
import { Database } from "bun:sqlite";
import { classifyUntappdBeerListUrl, sourceChannelOfUrl } from "@beer-log/parsers";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const db = new Database(DB_PATH, { readonly: true });
const jsonOnly = process.argv.includes("--json");
const planOnly = process.argv.includes("--plan");

const hints = (await Bun.file("data/ingest-hints.json").exists())
  ? (JSON.parse(await Bun.file("data/ingest-hints.json").text()).breweries ?? {}) : {};
const overrides = (await Bun.file("data/pipeline/overrides.json").exists())
  ? JSON.parse(await Bun.file("data/pipeline/overrides.json").text()) : { breweries: {}, shops: {}, cities: {} };
const shopRegistry: any[] = (await Bun.file("data/pipeline/shops.json").exists())
  ? (JSON.parse(await Bun.file("data/pipeline/shops.json").text()).shops ?? []) : [];

// Конвенция давности источников (task-24/25; манифест — vault/product/entity-researchers.md).
// refresh/recurring — дешёвые поддерживающие действия: ставятся в очередь по давности, идут
// ПОСЛЕ первичной заливки. Анти-оверкилл: TG инкрементален, Untappd — только page-1.
const today = new Date().toISOString().slice(0, 10);
const FRESH = { tgDays: 3, untappdDays: 14, shopDays: 7 };
const daysSince = (d?: string | null): number | null => {
  if (!d) return null;
  const ms = Date.parse(today) - Date.parse(d);
  return Number.isNaN(ms) ? null : Math.floor(ms / 86_400_000);
};
const stale = (d: string | null | undefined, n: number): boolean => {
  const x = daysSince(d);
  return x != null && x > n;
};

type B = { id: string; name: string; slug: string; city: string | null; links: string; aliases: string };
const breweries = db.query("SELECT id, name, slug, city, links, aliases FROM breweries ORDER BY name").all() as B[];

// СТАДИИ пивоварни: discovered → sourced → ingested → validated → demand_linked
const SOURCE_KINDS = ["telegram", "vk", "website", "untappd"];
// Машинно-читаемые источники для ingest-sorts: только telegram (fetch-channels) и untappd
// (ingest-untappd, и то лишь с валидным URL) реально парсятся. website/vk — НЕ ingestable:
// дают стадию sourced, но добор сортов невозможен → такие идут в brewery-research. См. ниже.
const brewState = breweries.map((b) => {
  const links = JSON.parse(b.links || "[]") as { kind: string; url?: string }[];
  const h = (hints as Record<string, any>)[b.slug] ?? {};
  const ov = overrides.breweries?.[b.slug] ?? {};
  const sources = new Set<string>(links.map((l) => l.kind).filter((k) => SOURCE_KINDS.includes(k)));
  if (h.channel) sources.add("telegram");
  if (h.untappd) sources.add("untappd");
  // ingestable = реально парсимые источники. telegram — да; untappd — только если URL валиден
  // (не venue /v/, не зеркало, не неполный /w/ — иначе ingest-untappd зациклится на фейле).
  const untappdUrl = h.untappd?.url ?? links.find((l) => l.kind === "untappd" && l.url)?.url;
  const untappdIngestable = !!untappdUrl && classifyUntappdBeerListUrl(untappdUrl).ok;
  const ingestable = [...sources].filter(
    (k) => k === "telegram" || (k === "untappd" && untappdIngestable),
  );
  const counts = db.query(
    "SELECT COUNT(*) total, SUM(status='validated') val, SUM(status='auto') auto FROM beers WHERE brewery_id = ?",
  ).get(b.id) as { total: number; val: number; auto: number };
  const dem = db.query(
    "SELECT COUNT(*) listings FROM price_listings pl JOIN beers be ON be.id = pl.beer_id WHERE be.brewery_id = ?",
  ).get(b.id) as { listings: number };
  const total = counts.total ?? 0, val = counts.val ?? 0, auto = counts.auto ?? 0;

  // провенанс сортов (task-21): подтверждён офиц. каналом (есть beer_sources) vs только в продаже
  // у магазина (есть листинг, beer_sources нет) — последнее = рабочая очередь прохода по каналам.
  const prov = db.query(
    `SELECT
       SUM(CASE WHEN EXISTS(SELECT 1 FROM beer_sources s WHERE s.beer_id = be.id) THEN 1 ELSE 0 END) official,
       SUM(CASE WHEN EXISTS(SELECT 1 FROM price_listings pl WHERE pl.beer_id = be.id AND pl.seller IS NOT NULL)
                 AND NOT EXISTS(SELECT 1 FROM beer_sources s WHERE s.beer_id = be.id) THEN 1 ELSE 0 END) shopOnly
     FROM beers be WHERE be.brewery_id = ?`,
  ).get(b.id) as { official: number; shopOnly: number };

  const stage =
    ov.blocked ? "blocked"
    : val > 0 && auto === 0 ? "validated"
    : total > 0 && auto > 0 ? "ingested"
    : total > 0 ? "ingested"
    : sources.size > 0 ? "sourced"
    : "discovered";

  // liveness (task-24 #2): если ВСЕ ingestable-источники протухли (проба check-liveness.ts),
  // пивоварня — на повторный brewery-research, даже если уже validated (источник умер во времени).
  const lv = h.liveness?.sources as Record<string, string> | undefined;
  const deadIngestable = !!lv && ingestable.length > 0
    && ingestable.every((k) => ["dead", "empty", "private", "unparseable"].includes(lv[k] ?? ""));

  // следующее действие (что делать дальше по этой пивоварне)
  let nextAction = "ok";
  if (ov.blocked) nextAction = `blocked: ${ov.blocked}`;
  else if (deadIngestable) nextAction = `brewery-research (источник протух: ${ingestable.map((k) => `${k}=${lv![k]}`).join(",")})`;
  else if (sources.size === 0) nextAction = "brewery-research (нет источников)";
  else if (total === 0 && ingestable.length === 0)
    nextAction = `brewery-research (нет читаемого источника: ${[...sources].join(",")})`;
  else if (total === 0) nextAction = `ingest-sorts (источники: ${ingestable.join(",")})`;
  else if (auto > 0 && auto <= (ov.needsReview?.length ?? 0)) nextAction = `human-review (${auto} спорных)`;
  else if (auto > 0) nextAction = `promote-sorts (${auto} auto)`;
  // refresh/freshness (task-24): «готовая» пивоварня возвращается в очередь по давности живого
  // источника. TG — инкремент (дёшево, чаще); Untappd — page-1 новейших (реже). Только активные
  // (не blocked, источник ingestable) — гарантируется условиями выше по цепочке. СТОИТ ПЕРЕД demand:
  // свежесть каталога ортогональна продаже в магазинах (иначе пивоварни без листингов не рефрешатся).
  else if (h.channel && stale(h.lastRun, FRESH.tgDays)) nextAction = `refresh-tg (${daysSince(h.lastRun)}д)`;
  else if (untappdUrl && untappdIngestable && stale(h.untappd?.lastRun, FRESH.untappdDays))
    nextAction = `refresh-untappd (${daysSince(h.untappd?.lastRun)}д)`;
  else if (dem.listings === 0) nextAction = "demand: нет листингов (магазин города)";

  // partial: untappd-ингест добрал меньше реального тотала (логин-гейт без cookie / догрузка не
  // дошла до конца). Не гейт: мягкая очередь на дозагрузку с авторизованной пагинацией (task-16).
  // "ok-untappd-capped" — легаси-статус до перехода на честное покрытие, тоже считаем недобором.
  const partial = h.untappd?.status === "ok-untappd-partial" || h.untappd?.status === "ok-untappd-capped";
  const untappdCoverage = partial && typeof h.untappd?.sortsTotal === "number"
    ? { got: (h.untappd.sortsIngested as number) ?? 0, total: h.untappd.sortsTotal as number }
    : null;

  return {
    slug: b.slug, name: b.name, city: b.city, stage,
    sources: [...sources], sorts: { total, validated: val, auto }, demandListings: dem.listings,
    provenance: { official: prov.official ?? 0, shopOnly: prov.shopOnly ?? 0 },
    needsReview: ov.needsReview ?? [], blocked: ov.blocked ?? null, priority: ov.priority ?? null, partial, untappdCoverage, nextAction,
  };
});

// магазины: из продавцов в листингах (+overrides). Стадии: discovered→scanned→recurring
const sellers = db.query(
  "SELECT seller, COUNT(*) listings, COUNT(DISTINCT beer_id) linked, MAX(seen_at) lastSeen FROM price_listings WHERE seller IS NOT NULL GROUP BY seller",
).all() as { seller: string; listings: number; linked: number; lastSeen: string }[];

// recurring/freshness (task-25): парсибельный магазин (есть ingestConfig), чей lastScan старше
// порога (или null) → стадия recurring-due → очередь rescan-shop. История цен копится сама
// (price_snapshots в repo.ts), перескан её не затирает. blocked/без-конфига — не трогаем.
const shopState = shopRegistry
  .filter((s) => s.ingestConfig)
  .map((s) => ({
    id: s.id, name: s.name, platform: s.ingestConfig?.platform ?? null,
    lastScan: s.lastScan ?? null, daysOld: daysSince(s.lastScan),
    recurringDue: s.lastScan == null || stale(s.lastScan, FRESH.shopDays),
  }));

// города: из городов пивоварен (+ später магазинов)
const cityAgg = new Map<string, { breweries: number }>();
for (const b of breweries) if (b.city) cityAgg.set(b.city, { breweries: (cityAgg.get(b.city)?.breweries ?? 0) + 1 });

const state = {
  generatedAt: new Date().toISOString().slice(0, 10),
  breweries: brewState,
  shops: sellers,
  shopRegistry: shopState,
  cities: [...cityAgg.entries()].map(([city, v]) => ({ city, ...v })),
};
await Bun.write("data/pipeline/state.json", JSON.stringify(state, null, 2));
if (jsonOnly) { console.log("→ data/pipeline/state.json"); process.exit(0); }

// ---- машинный план для оркестратора (pipeline-run) ----
if (planOnly) {
  // приоритет: promote (дёшево, чистит канон) → ingest (добор сортов) → research (разблокировка)
  // → demand (магазины города) → refresh/rescan (поддержка свежести, task-24/25 — в хвост, после
  // первичной заливки). human-review/blocked — гейты, НЕ в план.
  const PRIORITY = ["promote-sorts", "ingest-sorts", "brewery-research", "demand", "refresh-tg", "refresh-untappd", "rescan-shop"];
  const HOW: Record<string, string> = {
    "promote-sorts": "скилл promote-sorts по каждой пивоварне (можно параллельно субагентами) → promote-sorts.ts",
    "ingest-sorts": "ingest по источнику: Untappd→`ingest-untappd.ts <slug...>` (URL берётся из breweries.links, MAP редактировать НЕ нужно); TG→fetch-channels+ingest-sorts",
    "brewery-research": "скилл brewery-research по каждой (параллельно субагентами) → links/ingest-hints",
    "demand": "скилл shop-discovery по городу пивоварни → реестр магазинов → скан",
    "refresh-tg": "инкремент TG: `fetch-channels.ts <slug...>` → экстракт → `ingest-sorts.ts` (только новое по newestId, дёшево)",
    "refresh-untappd": "новейшие сорта с Untappd: `UNTAPPD_NO_PAGINATE=1 ingest-untappd.ts <slug...>` (page-1, без полной пагинации)",
    "rescan-shop": "перескан магазина единым движком: `ingest-shop-platform.ts <id>` (история цен копится сама)",
  };
  const group: Record<string, string[]> = {};
  for (const b of brewState) {
    if (b.blocked || b.nextAction === "ok") continue;
    const key = b.nextAction.split(" (")[0]!;
    if (key === "human-review") continue; // гейт человека
    (group[key] ??= []).push(b.slug);
  }
  // магазины-перескан (task-25): отдельная группа, slugs = id магазина из реестра
  const dueShops = shopState.filter((s) => s.recurringDue).map((s) => s.id);
  if (dueShops.length) group["rescan-shop"] = dueShops;
  const plan = PRIORITY.filter((a) => group[a]?.length).map((action, i) => ({
    action, priority: i + 1, count: group[action]!.length, slugs: group[action]!, how: HOW[action],
  }));
  const gates = {
    humanReview: brewState.filter((b) => b.needsReview.length).map((b) => b.slug),
    blocked: brewState.filter((b) => b.blocked).map((b) => b.slug),
  };
  console.log(JSON.stringify({ generatedAt: state.generatedAt, plan, gates }, null, 2));
  process.exit(0);
}

// ---- дашборд ----
const byStage: Record<string, number> = {};
for (const b of brewState) byStage[b.stage] = (byStage[b.stage] ?? 0) + 1;
console.log("\n=== ПИВОВАРНИ по стадиям ===");
for (const s of ["discovered", "sourced", "ingested", "validated", "blocked"])
  if (byStage[s]) console.log(`  ${s.padEnd(12)} ${byStage[s]}`);
console.log(`  ИТОГО ${brewState.length} | сортов ${brewState.reduce((a, b) => a + b.sorts.total, 0)} (validated ${brewState.reduce((a, b) => a + b.sorts.validated, 0)} / auto ${brewState.reduce((a, b) => a + b.sorts.auto, 0)})`);

// провенанс сортов (task-21): покрытие офиц. каналом vs «только магазин» (рабочая очередь)
const totalSorts = brewState.reduce((a, b) => a + b.sorts.total, 0);
const verified = brewState.reduce((a, b) => a + b.provenance.official, 0);
const shopOnly = brewState.reduce((a, b) => a + b.provenance.shopOnly, 0);
const shopOnlyBrews = brewState.filter((b) => b.provenance.shopOnly > 0)
  .sort((a, b) => b.provenance.shopOnly - a.provenance.shopOnly);
const pct = (n: number) => totalSorts ? `${((n / totalSorts) * 100).toFixed(0)}%` : "—";

// многоканальный провенанс (task-26): сколько сортов подтверждено ≥2 НЕЗАВИСИМЫМИ офиц. каналами
// (cross-source канон). Виды каналов классифицируем тем же sourceChannelOfUrl, что и экспорт.
const chByBeer = new Map<string, Set<string>>();
for (const r of db.query("SELECT beer_id, source_url FROM beer_sources").all() as { beer_id: string; source_url: string }[]) {
  const ch = sourceChannelOfUrl(r.source_url);
  if (!ch) continue;
  (chByBeer.get(r.beer_id) ?? chByBeer.set(r.beer_id, new Set()).get(r.beer_id)!).add(ch);
}
const crossChannels = [...chByBeer.values()];
const cross2 = crossChannels.filter((s) => s.size >= 2).length;
const cross3 = crossChannels.filter((s) => s.size >= 3).length;

console.log("\n=== ПРОВЕНАНС СОРТОВ (task-21) ===");
console.log(`  подтверждён офиц. каналом пивоварни ${verified} (${pct(verified)})`);
console.log(`  из них cross-source (≥2 независимых канала, task-26) ${cross2}${cross3 ? ` · ≥3 канала ${cross3}` : ""}`);
console.log(`  только в продаже у магазина (не подтверждён) ${shopOnly} — рабочая очередь прохода по каналам`);
if (shopOnlyBrews.length)
  console.log(`  пивоварен с shop-only сортами: ${shopOnlyBrews.length}, топ: ${
    shopOnlyBrews.slice(0, 8).map((b) => `${b.slug} (${b.provenance.shopOnly})`).join(", ")}${shopOnlyBrews.length > 8 ? " …" : ""}`);

const queue = brewState.filter((b) => b.nextAction !== "ok" && !b.blocked);
console.log(`\n=== ОЧЕРЕДЬ ДЕЙСТВИЙ (${queue.length}) ===`);
const byAction: Record<string, string[]> = {};
for (const b of queue) { const key = b.nextAction.split(" (")[0]!; (byAction[key] ??= []).push(b.slug); }
for (const [act, slugs] of Object.entries(byAction).sort((a, b) => b[1].length - a[1].length))
  console.log(`  ${act} — ${slugs.length}: ${slugs.slice(0, 8).join(", ")}${slugs.length > 8 ? " …" : ""}`);

const review = brewState.filter((b) => b.needsReview.length);
if (review.length) console.log(`\n=== NEEDS-REVIEW (${review.length}) ===\n  ${review.map((b) => b.slug).join(", ")}`);

const partial = brewState.filter((b) => b.partial);
if (partial.length) {
  const gap = partial.reduce((s, b) => s + (b.untappdCoverage ? b.untappdCoverage.total - b.untappdCoverage.got : 0), 0);
  const top = [...partial]
    .sort((a, b) => (b.untappdCoverage?.total ?? 0) - (a.untappdCoverage?.total ?? 0))
    .map((b) => (b.untappdCoverage ? `${b.slug} (${b.untappdCoverage.got}/${b.untappdCoverage.total})` : b.slug))
    .join(", ");
  console.log(`\n=== PARTIAL — untappd добрано меньше тотала, нужна авторизованная пагинация (${partial.length}, недобор ~${gap}) ===\n  ${top}`);
}

console.log("\n=== МАГАЗИНЫ ===");
for (const s of sellers) console.log(`  ${s.seller.padEnd(20)} листингов ${s.listings} (связано ${s.linked}) | посл. скан ${s.lastSeen}`);
const dueShops = shopState.filter((s) => s.recurringDue);
if (dueShops.length)
  console.log(`\n=== ПЕРЕСКАН НУЖЕН (recurring, lastScan > ${FRESH.shopDays}д) — ${dueShops.length} ===\n  ${
    dueShops.map((s) => `${s.id} (${s.lastScan ? `${s.daysOld}д` : "ни разу"})`).join(", ")}`);
console.log(`\n=== ГОРОДА: ${cityAgg.size} (с пивоварнями) ===`);
db.close();
