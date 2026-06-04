// Дискавери RF-венью с Untappd-бизнес-меню (TASK-37, трек E, E1). Строит/обновляет реестр точек
// для регулярного парса меню (E2/E4). Аналог shop-discovery, но через Untappd-venue.
//
// Метод: сиды (известные венью по городам, ниже SEEDS — расширяемо) + BFS на nearby. Ключевой
// факт зонда: «Nearby Verified Venues» отдают ТОЛЬКО no-menu страницы (venue с меню — листья графа),
// поэтому граф расширяется через no-menu венью, а меню-венью добираются из сидов. Детект меню —
// menu-selector / brewery_picker / menu-item на базовой странице (probeOnly, без обхода всех секций).
// Классификация bar/shop — из <h2> типа («Beer Bar, Beer Store»).
//
//   bun run scripts/discover-untappd-venues.ts                 # BFS от сидов, лимит по умолчанию
//   bun run scripts/discover-untappd-venues.ts --max 60        # шире обход
//   bun run scripts/discover-untappd-venues.ts --seeds <file>  # доп. сиды (массив "slug/id" в JSON)
//   DRY=1 bun run scripts/discover-untappd-venues.ts           # не писать реестр
import { fetchVenueMenus } from "@beer-log/parsers";

const DRY = !!process.env.DRY;
const argv = process.argv.slice(2);
const MAX = Number(arg(argv, "--max") ?? 40);
const seedsFile = arg(argv, "--seeds");
const REGISTRY = "data/venues/registry.json";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function arg(a: string[], flag: string): string | undefined {
  const i = a.indexOf(flag);
  return i >= 0 && a[i + 1] && !a[i + 1].startsWith("--") ? a[i + 1] : undefined;
}

// сиды по городам (Москва/СПб/НН + известные из разведзонда). Расширяется через --seeds и BFS.
const SEEDS: [string, string][] = [
  ["bratya-kraftcraft-brothers", "3943033"],     // МСК
  ["pivoteka-465", "8040437"],                   // МСК
  ["kraft-bar-barrelcraft", "10152944"],         // МСК
  ["kraft-i-hmel-1-frunzenskaya", "9760853"],    // МСК
  ["taproom", "1952208"],                        // СПб
  ["craft-beer-shop", "3856103"],                // СПб
  ["kraft-set-razlivnogo-piva-3", "10958009"],   // СПб
  ["hophead-pivoteka", "12931254"],              // НН
  ["igra", "13870946"],                          // НН
  ["eric-the-red-nn-erik-ryzhiy-nn", "6310279"], // НН (без бизнес-меню — но в реестр как Tier-B)
];

type Venue = { slug: string; id: string };
type RegistryEntry = {
  venueId: string; slug: string; name: string; city: string | null;
  type: "bar" | "shop" | "bar-shop" | "unknown"; verified: boolean;
  hasMenu: boolean; menuOffering: string[]; rosterSize: number; beersTotal: number;
  checkedAt: string; discoveredVia: "seed" | "nearby";
};

// загрузка существующего реестра (merge, не перезатираем)
const existing: Record<string, RegistryEntry> = {};
try {
  const raw = await Bun.file(REGISTRY).json() as { venues?: RegistryEntry[] };
  for (const v of raw.venues ?? []) existing[v.venueId] = v;
} catch {}

const queue: { v: Venue; via: "seed" | "nearby" }[] = [];
if (seedsFile) {
  try {
    const arr = await Bun.file(seedsFile).json() as string[];
    for (const s of arr) { const [slug, id] = s.split("/"); if (slug && id) queue.push({ v: { slug, id }, via: "seed" }); }
  } catch { console.error(`! не прочитал сиды из ${seedsFile}`); }
}
for (const [slug, id] of SEEDS) queue.push({ v: { slug, id }, via: "seed" });

const visited = new Set<string>();
const found: RegistryEntry[] = [];
const today = new Date().toISOString().slice(0, 10);

console.log(`=== Дискавери Untappd-венью · сидов ${queue.length} · лимит ${MAX} · DRY=${DRY} ===\n`);

while (queue.length && visited.size < MAX) {
  const { v, via } = queue.shift()!;
  if (visited.has(v.id)) continue;
  visited.add(v.id);

  const res = await fetchVenueMenus(v.slug, v.id, { probeOnly: true });
  await sleep(500);
  if (!res) { console.log(`  ✗ ${v.slug}/${v.id} (fetch fail)`); continue; }

  const beersTotal = res.roster.reduce((s, r) => s + r.count, 0);
  const entry: RegistryEntry = {
    venueId: v.id, slug: v.slug, name: res.meta.name, city: res.meta.city,
    type: res.meta.type, verified: res.meta.verified,
    hasMenu: res.hasMenu, menuOffering: res.menus.map((m) => m.name),
    rosterSize: res.roster.length, beersTotal,
    checkedAt: today, discoveredVia: existing[v.id]?.discoveredVia ?? via,
  };
  found.push(entry);
  console.log(`  ${res.hasMenu ? "✓меню" : "·чек-ины"} [${res.meta.type}] ${String(beersTotal).padStart(4)}с ${String(res.roster.length).padStart(3)}пив  ${res.meta.name}${res.menus.length ? `  {${res.menus.length} меню}` : ""}`);

  // BFS: nearby отдают ТОЛЬКО no-menu венью → расширяем граф только через них
  if (!res.hasMenu) {
    for (const n of res.nearby) {
      if (!visited.has(n.venueId) && visited.size + queue.length < MAX + 16) queue.push({ v: { slug: n.slug, id: n.venueId }, via: "nearby" });
    }
  }
}

// merge в реестр
for (const e of found) existing[e.venueId] = e;
const all = Object.values(existing).sort((a, b) => Number(b.hasMenu) - Number(a.hasMenu) || b.beersTotal - a.beersTotal);

const withMenu = found.filter((e) => e.hasMenu);
console.log(`\n── ИТОГ обхода ──────────────────────────`);
console.log(`венью проверено:     ${found.length}`);
console.log(`  с бизнес-меню:     ${withMenu.length}  (${found.length ? Math.round((withMenu.length / found.length) * 100) : 0}%)`);
console.log(`  только чек-ины:    ${found.length - withMenu.length}`);
console.log(`Σ сортов в ростерах: ${withMenu.reduce((s, e) => s + e.beersTotal, 0)}`);
console.log(`реестр (всего):      ${all.length} венью, из них с меню ${all.filter((e) => e.hasMenu).length}`);

if (!DRY) {
  await Bun.write(REGISTRY, JSON.stringify({
    updatedAt: today,
    note: "Реестр RF-венью с Untappd-бизнес-меню (трек E, TASK-37). hasMenu=есть бизнес-меню (Tier-A источник холодильника/крана). Ингест меню: scripts/ingest-untappd-menu.ts <slug>/<venueId>.",
    counts: { total: all.length, withMenu: all.filter((e) => e.hasMenu).length },
    venues: all,
  }, null, 2));
  console.log(`\nреестр записан → ${REGISTRY}`);
}
