// РАЗВЕДЗОНД (throwaway, не для коммита): оценить масштаб «парсинг RF-баров из Untappd-меню».
// Что считает: сколько венью с бизнес-меню vs только чек-ины, размер ассортимента (сумма по
// brewery_picker), match-rate пивоварен к каталогу, сколько НОВЫХ пивоварен всплывает, есть ли цены.
// Источник venue-списка: сиды (Google site-search) + BFS на 1 хоп по «Nearby Verified Venues»
// (их отдают только no-menu страницы). Только публичный SSR-HTML, без cookie/VPN.
//   bun run scripts/recon-untappd-venues.ts
import { Database } from "bun:sqlite";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const MAX_VENUES = 36;
const SEEDS: [string, string][] = [
  ["bratya-kraftcraft-brothers", "3943033"],     // МСК (известно: меню 244)
  ["pivoteka-465", "8040437"],                   // МСК
  ["pivoteka-465-kutuzovgrad", "10507825"],
  ["kraft-bar-barrelcraft", "10152944"],
  ["pivoteka-465-aeroport", "13365305"],
  ["kraft-i-hmel-1-frunzenskaya", "9760853"],
  ["taproom", "1952208"],                        // СПб
  ["kraft-bar-burgernaya", "11884344"],
  ["craft-beer-shop", "3856103"],
  ["kraft-set-razlivnogo-piva-3", "10958009"],
  ["eric-the-red-nn-erik-ryzhiy-nn", "6310279"], // НН (известно: меню нет)
  ["hophead-pivoteka", "12931254"],
  ["igra", "13870946"],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&#x?[0-9a-f]+;/gi, "").trim();

// Нормализация имени пивоварни для нечёткого матча (флор: fuzzy-промахи → недосчёт, реальный match ≥).
const STOP = /\b(brewery|brewing|brewworks|brew|beer|co|company|craft|пивоварня|пивоварни|пивокомпания|크래프트)\b/gi;
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(STOP, " ")
    .replace(/[^a-zа-я0-9]+/gi, "")
    .trim();
}
// у имён вида "Пивоварня Одна тонна / Odna Tonna Brewery" берём обе стороны
function variants(name: string): string[] {
  const parts = name.split("/").map((p) => norm(p)).filter((p) => p.length >= 3);
  return [...new Set(parts)];
}

// --- множество каталога: нормализованные имена + алиасы ---
const db = new Database("data/catalog.sqlite", { readonly: true });
const cat = new Set<string>();
let catNames = 0;
for (const row of db.query("SELECT name, aliases FROM breweries").all() as { name: string; aliases: string }[]) {
  catNames++;
  for (const v of variants(row.name)) cat.add(v);
  try {
    for (const a of JSON.parse(row.aliases || "[]") as string[]) for (const v of variants(a)) cat.add(v);
  } catch {}
}
console.log(`Каталог: ${catNames} пивоварен, ${cat.size} нормо-ключей (имена+алиасы).\n`);

type Venue = { slug: string; id: string };
async function fetchVenue(v: Venue): Promise<string | null> {
  try {
    const res = await fetch(`https://untappd.com/v/${v.slug}/${v.id}`, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function venueName(html: string): string {
  const m = html.match(/<title>([^<]+)<\/title>/);
  return m ? decode(m[1].replace(/ - Untappd.*$/, "").replace(/ - Drink Menu.*$/, "")) : "?";
}
function nearby(html: string, self: string): Venue[] {
  const out: Venue[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/\/v\/([a-z0-9-]+)\/(\d+)/g)) {
    if (m[2] === self || seen.has(m[2])) continue;
    seen.add(m[2]);
    out.push({ slug: m[1], id: m[2] });
  }
  return out;
}
// ростер пивоварен из <select id="brewery_picker">: option value="ID">Name (N)
function roster(html: string): { name: string; count: number }[] {
  const block = html.match(/<select id="brewery_picker"[^>]*>([\s\S]*?)<\/select>/);
  if (!block) return [];
  const out: { name: string; count: number }[] = [];
  for (const m of block[1].matchAll(/<option value="\d+"[^>]*>([\s\S]*?)\((\d+)\)\s*<\/option>/g)) {
    const name = decode(m[1]);
    if (name && name.toLowerCase() !== "all breweries") out.push({ name, count: Number(m[2]) });
  }
  return out;
}

// --- BFS ---
const queue: Venue[] = [...SEEDS.map(([slug, id]) => ({ slug, id }))];
const visited = new Set<string>();
type Row = { name: string; menu: boolean; beers: number; brews: number; matched: number; prices: number };
const rows: Row[] = [];
const newBreweries = new Map<string, number>(); // нормо-ключ → max count (как часто всплывает)

while (queue.length && visited.size < MAX_VENUES) {
  const v = queue.shift()!;
  if (visited.has(v.id)) continue;
  visited.add(v.id);
  const html = await fetchVenue(v);
  await sleep(500);
  if (!html) {
    rows.push({ name: `${v.slug} (fetch fail)`, menu: false, beers: 0, brews: 0, matched: 0, prices: 0 });
    continue;
  }
  const name = venueName(html);
  const rost = roster(html);
  const hasMenu = rost.length > 0 || html.includes('class="menu-item"');
  const prices = (html.match(/class="price"/g) || []).length;
  if (!hasMenu) {
    rows.push({ name, menu: false, beers: 0, brews: 0, matched: 0, prices: 0 });
    for (const n of nearby(html, v.id)) if (!visited.has(n.id) && visited.size + queue.length < MAX_VENUES + 12) queue.push(n);
    continue;
  }
  let matched = 0;
  let beers = 0;
  for (const b of rost) {
    beers += b.count;
    const vs = variants(b.name);
    const hit = vs.some((x) => cat.has(x));
    if (hit) matched++;
    else newBreweries.set(vs[0] || b.name, Math.max(newBreweries.get(vs[0] || b.name) || 0, b.count));
  }
  rows.push({ name, menu: true, beers, brews: rost.length, matched, prices });
  for (const n of nearby(html, v.id)) if (!visited.has(n.id) && visited.size + queue.length < MAX_VENUES + 12) queue.push(n);
}

// --- отчёт ---
const menued = rows.filter((r) => r.menu);
const totalBeers = menued.reduce((s, r) => s + r.beers, 0);
const totalBrews = menued.reduce((s, r) => s + r.brews, 0);
const totalMatched = menued.reduce((s, r) => s + r.matched, 0);
console.log("ВЕНЬЮ (имя | меню? | сортов | пивоварен | матч-каталог | price-тегов):");
for (const r of rows)
  console.log(
    `  ${r.menu ? "✓меню" : "·чек-ины"}  ${String(r.beers).padStart(4)}с ${String(r.brews).padStart(3)}пив ${String(r.matched).padStart(3)}✓  ${String(r.prices).padStart(3)}p  ${r.name}`,
  );
console.log(`\n── ИТОГ ─────────────────────────────`);
console.log(`Венью обойдено:        ${rows.length}`);
console.log(`  с бизнес-меню:       ${menued.length}  (${Math.round((menued.length / rows.length) * 100)}%)`);
console.log(`  только чек-ины:      ${rows.length - menued.length}`);
console.log(`Сортов в меню (Σ):     ${totalBeers}  (priced-рёбра, со срезом-датой)`);
console.log(`Пивоварен-вхождений:   ${totalBrews}`);
console.log(`  матч к каталогу:     ${totalBrews ? Math.round((totalMatched / totalBrews) * 100) : 0}%  (${totalMatched}/${totalBrews}, ФЛОР — fuzzy)`);
console.log(`Новых пивоварен (уник): ${newBreweries.size}  (нет в каталоге → brewery-research)`);
const topNew = [...newBreweries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log(`  топ-кандидаты:       ${topNew.map(([n, c]) => `${n}(${c})`).join(", ")}`);
