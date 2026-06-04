// Мета покрытия каталога venue-меню Untappd (трек E). Отвечает на «сколько сортов/пивоварен
// каталога реально замечены в барах/боттлшопах, по городам, pour vs unit, сколько новых
// пивоварен вскрыто». Read-only по catalog.sqlite + data/venues/registry.json + discovery-файл.
//
//   bun run scripts/venue-coverage.ts
//   bun run scripts/venue-coverage.ts --json   # машиночитаемо (для витрины/меты)
import { Database } from "bun:sqlite";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const asJson = process.argv.includes("--json");
const db = new Database(DB_PATH, { readonly: true });

const SRC = "untappd-menu";

// ── venue-листинги ──────────────────────────────────────────────────────────────
type PL = { seller: string; beer_id: string | null; format: string | null; price: number | null; seen_at: string };
const pls = db.query(
  "SELECT seller, beer_id, format, price, seen_at FROM price_listings WHERE source_type = ?",
).all(SRC) as PL[];

const sellers = [...new Set(pls.map((p) => p.seller))];
const distinctBeers = new Set(pls.map((p) => p.beer_id).filter(Boolean) as string[]);
const matchedListings = pls.filter((p) => p.beer_id).length;

// distinct пивоварни, замеченные в венью (по сматченным сортам)
const brewIds = new Set<string>();
for (const id of distinctBeers) {
  const r = db.query("SELECT brewery_id b FROM beers WHERE id = ?").get(id) as { b: string | null } | null;
  if (r?.b) brewIds.add(r.b);
}

// формат-разбивка
const byFormat = new Map<string, number>();
for (const p of pls) byFormat.set(p.format ?? "null", (byFormat.get(p.format ?? "null") ?? 0) + 1);

// ── каталог-wide покрытие ─────────────────────────────────────────────────────
const totalBeers = (db.query("SELECT COUNT(*) c FROM beers").get() as { c: number }).c;
const totalBrews = (db.query("SELECT COUNT(*) c FROM breweries").get() as { c: number }).c;
// пивоварни с ≥1 venue-листингом среди ВСЕХ её сортов
const brewWithVenue = brewIds.size;

// ── per-venue ─────────────────────────────────────────────────────────────────
type VenueStat = { seller: string; listings: number; beers: number; matched: number; matchRate: number; seenAt: string; pour: number; unit: number };
const venueStats: VenueStat[] = sellers.map((s) => {
  const rows = pls.filter((p) => p.seller === s);
  const beers = new Set(rows.map((p) => p.beer_id).filter(Boolean)).size;
  const matched = rows.filter((p) => p.beer_id).length;
  const pour = rows.filter((p) => p.format === "draft").length;
  const unit = rows.filter((p) => p.format === "can" || p.format === "bottle").length;
  return {
    seller: s, listings: rows.length, beers, matched,
    matchRate: rows.length ? Math.round((matched / rows.length) * 100) : 0,
    seenAt: rows.map((p) => p.seen_at).sort().at(-1) ?? "",
    pour, unit,
  };
}).sort((a, b) => b.listings - a.listings);

// город венью из реестра
let registry: Record<string, { name: string; city: string | null; type: string }> = {};
try {
  const reg = await Bun.file("data/venues/registry.json").json() as { venues: { slug: string; name: string; city: string | null; type: string }[] };
  for (const v of reg.venues) registry[`untappd/${v.slug}`] = { name: v.name, city: v.city, type: v.type };
} catch {}
const byCity = new Map<string, number>();
for (const v of venueStats) {
  const city = registry[v.seller]?.city ?? "?";
  byCity.set(city, (byCity.get(city) ?? 0) + 1);
}

// ── новые пивоварни (discovery) ──────────────────────────────────────────────
let newBrew = { total: 0, cyrillic: 0, top: [] as { name: string; count: number }[] };
try {
  const d = await Bun.file("data/discovery/untappd-menu-new-breweries.json").json() as { breweries: { name: string; cyrillic: boolean; maxCount: number }[] };
  newBrew.total = d.breweries.length;
  newBrew.cyrillic = d.breweries.filter((b) => b.cyrillic).length;
  newBrew.top = d.breweries.slice(0, 8).map((b) => ({ name: b.name, count: b.maxCount }));
} catch {}

const report = {
  venues: sellers.length,
  listings: pls.length,
  matchedListings,
  distinctBeersCovered: distinctBeers.size,
  breweriesCovered: brewWithVenue,
  catalogBeerCoverage: +((distinctBeers.size / totalBeers) * 100).toFixed(1),
  catalogBreweryCoverage: +((brewWithVenue / totalBrews) * 100).toFixed(1),
  formats: Object.fromEntries(byFormat),
  byCity: Object.fromEntries(byCity),
  newBreweriesSurfaced: newBrew,
  venueStats,
};

if (asJson) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

console.log(`\n═══ ПОКРЫТИЕ КАТАЛОГА VENUE-МЕНЮ (Untappd, трек E) ═══\n`);
console.log(`Венью с меню залито:   ${report.venues}`);
console.log(`Листингов:             ${report.listings}  (сматчено к канону ${matchedListings}, ${Math.round(matchedListings / pls.length * 100)}%)`);
console.log(`Сортов покрыто:        ${report.distinctBeersCovered}  (${report.catalogBeerCoverage}% каталога из ${totalBeers})`);
console.log(`Пивоварен засветилось: ${report.breweriesCovered}  (${report.catalogBreweryCoverage}% каталога из ${totalBrews})`);
console.log(`Формат:                ${[...byFormat].map(([f, c]) => `${f} ${c}`).join(" · ")}`);
console.log(`По городам:            ${[...byCity].map(([c, n]) => `${c}: ${n}`).join(" · ")}`);
console.log(`Новых пивоварен (demand-driven discovery): ${newBrew.total}  (кириллица/RU≈${newBrew.cyrillic})`);
console.log(`  топ: ${newBrew.top.map((b) => `${b.name}(${b.count})`).join(", ")}`);
console.log(`\n── По венью (листинги | сорта | match% | pour/unit | срез) ──`);
for (const v of venueStats) {
  const meta = registry[v.seller];
  console.log(`  ${String(v.listings).padStart(4)}л ${String(v.beers).padStart(3)}с ${String(v.matchRate).padStart(3)}%  pour ${String(v.pour).padStart(3)}/unit ${String(v.unit).padStart(3)}  ${v.seenAt}  ${meta?.city ?? "?"} · ${meta?.name ?? v.seller}`);
}
console.log();
