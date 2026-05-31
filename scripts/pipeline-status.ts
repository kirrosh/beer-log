// Трекер конвейера (control plane): ВЫВОДИТ состояние каждой пивоварни/магазина/города
// из catalog.sqlite + ingest-hints + breweries.links, накладывает ручные overrides.json
// (валидация/блокеры/приоритет) и печатает дашборд-чеклист + очередь «следующих действий».
// Источник правды по данным — БД; этот скрипт ничего не меняет в каталоге (read-only).
//
//   bun run scripts/pipeline-status.ts            # дашборд + queue
//   bun run scripts/pipeline-status.ts --json     # только записать data/pipeline/state.json
import { Database } from "bun:sqlite";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const db = new Database(DB_PATH, { readonly: true });
const jsonOnly = process.argv.includes("--json");
const planOnly = process.argv.includes("--plan");

const hints = (await Bun.file("data/ingest-hints.json").exists())
  ? (JSON.parse(await Bun.file("data/ingest-hints.json").text()).breweries ?? {}) : {};
const overrides = (await Bun.file("data/pipeline/overrides.json").exists())
  ? JSON.parse(await Bun.file("data/pipeline/overrides.json").text()) : { breweries: {}, shops: {}, cities: {} };

type B = { id: string; name: string; slug: string; city: string | null; links: string; aliases: string };
const breweries = db.query("SELECT id, name, slug, city, links, aliases FROM breweries ORDER BY name").all() as B[];

// СТАДИИ пивоварни: discovered → sourced → ingested → validated → demand_linked
const SOURCE_KINDS = ["telegram", "vk", "website", "untappd"];
const brewState = breweries.map((b) => {
  const links = JSON.parse(b.links || "[]") as { kind: string }[];
  const h = (hints as Record<string, any>)[b.slug] ?? {};
  const ov = overrides.breweries?.[b.slug] ?? {};
  const sources = new Set<string>(links.map((l) => l.kind).filter((k) => SOURCE_KINDS.includes(k)));
  if (h.channel) sources.add("telegram");
  if (h.untappd) sources.add("untappd");
  const counts = db.query(
    "SELECT COUNT(*) total, SUM(status='validated') val, SUM(status='auto') auto FROM beers WHERE brewery_id = ?",
  ).get(b.id) as { total: number; val: number; auto: number };
  const dem = db.query(
    "SELECT COUNT(*) listings FROM price_listings pl JOIN beers be ON be.id = pl.beer_id WHERE be.brewery_id = ?",
  ).get(b.id) as { listings: number };
  const total = counts.total ?? 0, val = counts.val ?? 0, auto = counts.auto ?? 0;

  const stage =
    ov.blocked ? "blocked"
    : val > 0 && auto === 0 ? "validated"
    : total > 0 && auto > 0 ? "ingested"
    : total > 0 ? "ingested"
    : sources.size > 0 ? "sourced"
    : "discovered";

  // следующее действие (что делать дальше по этой пивоварне)
  let nextAction = "ok";
  if (ov.blocked) nextAction = `blocked: ${ov.blocked}`;
  else if (sources.size === 0) nextAction = "brewery-research (нет источников)";
  else if (total === 0) nextAction = `ingest-sorts (источники: ${[...sources].join(",")})`;
  else if (auto > 0 && auto <= (ov.needsReview?.length ?? 0)) nextAction = `human-review (${auto} спорных)`;
  else if (auto > 0) nextAction = `promote-sorts (${auto} auto)`;
  else if (dem.listings === 0) nextAction = "demand: нет листингов (магазин города)";

  return {
    slug: b.slug, name: b.name, city: b.city, stage,
    sources: [...sources], sorts: { total, validated: val, auto }, demandListings: dem.listings,
    needsReview: ov.needsReview ?? [], blocked: ov.blocked ?? null, priority: ov.priority ?? null, nextAction,
  };
});

// магазины: из продавцов в листингах (+overrides). Стадии: discovered→scanned→recurring
const sellers = db.query(
  "SELECT seller, COUNT(*) listings, COUNT(DISTINCT beer_id) linked, MAX(seen_at) lastSeen FROM price_listings WHERE seller IS NOT NULL GROUP BY seller",
).all() as { seller: string; listings: number; linked: number; lastSeen: string }[];

// города: из городов пивоварен (+ später магазинов)
const cityAgg = new Map<string, { breweries: number }>();
for (const b of breweries) if (b.city) cityAgg.set(b.city, { breweries: (cityAgg.get(b.city)?.breweries ?? 0) + 1 });

const state = {
  generatedAt: new Date().toISOString().slice(0, 10),
  breweries: brewState,
  shops: sellers,
  cities: [...cityAgg.entries()].map(([city, v]) => ({ city, ...v })),
};
await Bun.write("data/pipeline/state.json", JSON.stringify(state, null, 2));
if (jsonOnly) { console.log("→ data/pipeline/state.json"); process.exit(0); }

// ---- машинный план для оркестратора (pipeline-run) ----
if (planOnly) {
  // приоритет: promote (дёшево, чистит канон) → ingest (добор сортов) → research (разблокировка)
  // → demand (магазины города). human-review/blocked — гейты, НЕ в план.
  const PRIORITY = ["promote-sorts", "ingest-sorts", "brewery-research", "demand"];
  const HOW: Record<string, string> = {
    "promote-sorts": "скилл promote-sorts по каждой пивоварне (можно параллельно субагентами) → promote-sorts.ts",
    "ingest-sorts": "ingest по источнику: Untappd→MAP в ingest-untappd.ts; TG→fetch-channels+ingest-sorts",
    "brewery-research": "скилл brewery-research по каждой (параллельно субагентами) → links/ingest-hints",
    "demand": "скилл shop-discovery по городу пивоварни → реестр магазинов → скан",
  };
  const group: Record<string, string[]> = {};
  for (const b of brewState) {
    if (b.blocked || b.nextAction === "ok") continue;
    const key = b.nextAction.split(" (")[0]!;
    if (key === "human-review") continue; // гейт человека
    (group[key] ??= []).push(b.slug);
  }
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

const queue = brewState.filter((b) => b.nextAction !== "ok" && !b.blocked);
console.log(`\n=== ОЧЕРЕДЬ ДЕЙСТВИЙ (${queue.length}) ===`);
const byAction: Record<string, string[]> = {};
for (const b of queue) { const key = b.nextAction.split(" (")[0]!; (byAction[key] ??= []).push(b.slug); }
for (const [act, slugs] of Object.entries(byAction).sort((a, b) => b[1].length - a[1].length))
  console.log(`  ${act} — ${slugs.length}: ${slugs.slice(0, 8).join(", ")}${slugs.length > 8 ? " …" : ""}`);

const review = brewState.filter((b) => b.needsReview.length);
if (review.length) console.log(`\n=== NEEDS-REVIEW (${review.length}) ===\n  ${review.map((b) => b.slug).join(", ")}`);

console.log("\n=== МАГАЗИНЫ ===");
for (const s of sellers) console.log(`  ${s.seller.padEnd(20)} листингов ${s.listings} (связано ${s.linked}) | посл. скан ${s.lastSeen}`);
console.log(`\n=== ГОРОДА: ${cityAgg.size} (с пивоварнями) ===`);
db.close();
