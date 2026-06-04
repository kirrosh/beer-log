// Ингест Untappd-for-Business venue-меню в граф доступности (TASK-40, трек E). Завершает цепочку
// E2 (парсер) → E3 (матч+скоуп) → E4 (листинги). Тянет ВСЕ секции меню точки, матчит позиции к
// канону (точный ключ — untappd brewery-id из links, fuzzy-фолбэк по имени), классифицирует скоуп
// (пиво vs сидр/мид/импорт), пишет PriceListing с провенансом source_type=untappd-menu и observed_at
// = таймстемп среза меню. Pour (кран, format=draft) держится ОТДЕЛЬНО от unit (бутылка/банка).
//
// Бонусы наполнения каталога:
//   • обложки (task-15): для сматченных сортов без картинки рехостит .beer-label в S3 → setBeerImage;
//   • бэкфилл untappd-id пивоварни в breweries.links (точный ключ матча копится для будущих прогонов);
//   • unmatched пивоварни (скоуп=пиво) → data/discovery/untappd-menu-new-breweries.json (→ brewery-research).
//
//   DRY=1 bun run scripts/ingest-untappd-menu.ts bratya-kraftcraft-brothers/3943033
//   bun run scripts/ingest-untappd-menu.ts bratya-kraftcraft-brothers/3943033 --seller untappd/bratya-kraft
//   bun run scripts/ingest-untappd-menu.ts <slug>/<venueId> --no-images   # без рехостинга обложек
import { openDb, recordListing, setBeerImage, stats } from "@beer-log/store";
import { fetchVenueMenus, type VenueMenuItem } from "@beer-log/parsers";
import { categorizeStyle } from "@beer-log/catalog-core";
import { buildMatcher } from "./lib/catalog-matcher.ts";
import { tier, type SourceType } from "./lib/provenance.ts";
import { isS3Configured, putImage } from "./lib/images-store.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const DRY = !!process.env.DRY;
const argv = process.argv.slice(2);
const target = argv.find((a) => !a.startsWith("--"));
const sellerArg = argName(argv, "--seller");
const doImages = !argv.includes("--no-images");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const SOURCE_TYPE: SourceType = "untappd-menu";
// расширение по content-type обложки (labels.untappd.com без расширения в URL). Объявлено ДО цикла,
// который зовёт rehostLabel — иначе const в TDZ → ReferenceError молча глотается catch'ем.
const extByCt: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

if (!target || !/^[a-z0-9-]+\/\d+$/.test(target)) {
  console.error("Укажи венью: bun run scripts/ingest-untappd-menu.ts <slug>/<venueId> [--seller <key>] [--no-images]");
  process.exit(1);
}
const [slug, venueId] = target.split("/");
const seller = sellerArg ?? `untappd/${slug}`;

const db = openDb(DB_PATH);
const matcher = buildMatcher(db, { createAuto: !DRY });

// карта untappd brewery-id → наша пивоварня (точный ключ матча E3), из breweries.links (/w/<slug>/<id>)
type BrewRow = { id: string; name: string; slug: string; links: string };
const brewById = new Map<string, BrewRow>();
const ourByUntappdId = new Map<string, BrewRow>();
for (const r of db.query("SELECT id, name, slug, links FROM breweries").all() as BrewRow[]) {
  brewById.set(r.id, r);
  for (const m of (r.links || "").matchAll(/\/w\/[a-z0-9-]+\/(\d+)/gi)) ourByUntappdId.set(m[1], r);
}

console.log(`=== Untappd-меню ${slug}/${venueId} → seller=${seller} · DRY=${DRY} ===`);
const s3 = doImages && (await isS3Configured());
console.log(`матчер: ${matcher.breweryCount} пивоварен / ${matcher.aliasCount} алиасов · untappd-id ключей: ${ourByUntappdId.size}`);
console.log(`обложки (task-15): ${doImages ? (s3 ? "рехост в S3" : "S3 не настроен → локально") : "выкл"}\n`);

const res = await fetchVenueMenus(slug, venueId);
if (!res) { console.error("! не удалось загрузить венью (HTTP)"); db.close(); process.exit(1); }
if (!res.hasMenu) {
  console.error(`! у венью «${res.meta.name}» нет бизнес-меню (только чек-ины) — нечего ингестить`);
  db.close(); process.exit(2);
}

const observedAtIso = res.updatedAt ?? new Date().toISOString();
const observedDate = observedAtIso.slice(0, 10); // YYYY-MM-DD для seen_at/tier
const ft = tier({ sourceType: SOURCE_TYPE, observedAt: observedDate });
console.log(`венью: ${res.meta.name} [${res.meta.type}] ${res.meta.city ?? ""}`);
console.log(`меню-секций: ${res.menus.length} (${res.menus.map((m) => m.name).join(" · ")})`);
console.log(`позиций: ${res.items.length} · ростер пивоварен: ${res.roster.length}`);
console.log(`срез меню: ${observedAtIso} → tier=${ft.level} (${ft.score}) «${ft.label}»\n`);

// ── проход по позициям ──────────────────────────────────────────────────────────
type Stat = { listings: number; matchedBeer: number; exactBrew: number; fuzzyBrew: number; autoBeer: number;
  unmatched: number; nonBeer: number; imgSet: number };
const st: Stat = { listings: 0, matchedBeer: 0, exactBrew: 0, fuzzyBrew: 0, autoBeer: 0, unmatched: 0, nonBeer: 0, imgSet: 0 };
const newBreweries = new Map<string, { name: string; untappdId: number | null; slug: string | null; count: number; cyrillic: boolean; sample: string[] }>();
const linkBackfill = new Map<string, string>(); // ourBreweryId → untappd /w/ url (бэкфилл)
const imgDone = new Set<string>();              // beerId, которым уже поставили картинку в этом прогоне
const sampleMatched: string[] = [], sampleUnmatched: string[] = [];

for (const it of res.items) {
  const scope = scopeOf(it); // "beer" | "non-beer"
  // матч пивоварни: точный по untappd-id → fuzzy по имени
  let ourBrew: BrewRow | null = it.breweryId != null ? (ourByUntappdId.get(String(it.breweryId)) ?? null) : null;
  let beerMatch: ReturnType<typeof matcher.match> | null = null;
  let exact = false;
  if (ourBrew) {
    exact = true;
    beerMatch = matcher.matchInBrewery(ourBrew.id, it.name);
    // бэкфилл untappd-id в links, если его там ещё нет
    if (it.brewerySlug && it.breweryId != null && !(/\/w\//.test(ourBrew.links || ""))) {
      linkBackfill.set(ourBrew.id, `https://untappd.com/w/${it.brewerySlug}/${it.breweryId}`);
    }
  } else {
    const m = matcher.match(`${it.breweryName ?? ""} ${it.name}`.trim());
    if (m.breweryId) { beerMatch = m; ourBrew = brewById.get(m.breweryId) ?? null;
      // фуззи нашёл пивоварню — тоже бэкфиллим её untappd-id (копим точный ключ)
      if (ourBrew && it.brewerySlug && it.breweryId != null && !(/\/w\//.test(ourBrew.links || "")) && !linkBackfill.has(ourBrew.id))
        linkBackfill.set(ourBrew.id, `https://untappd.com/w/${it.brewerySlug}/${it.breweryId}`);
    }
  }

  const beerId = beerMatch?.beerId ?? null;
  const breweryId = beerMatch?.breweryId ?? null;
  const title = [it.breweryName, it.name].filter(Boolean).join(" ").replace(/\s+/g, " ");

  // учёт
  if (scope === "non-beer") st.nonBeer++;
  if (breweryId) { exact ? st.exactBrew++ : st.fuzzyBrew++; }
  if (beerId) { st.matchedBeer++; if (beerMatch?.createdAuto) st.autoBeer++;
    if (sampleMatched.length < 20) sampleMatched.push(`${exact ? "🎯" : "≈"}${beerMatch?.createdAuto ? "+" : "="} ${title.slice(0, 50)} → ${beerMatch?.beerName}`);
  } else if (!breweryId && scope === "beer") {
    st.unmatched++;
    // unmatched пивоварня (скоуп пиво) → кандидат discovery
    const key = String(it.breweryId ?? it.breweryName ?? title).toLowerCase();
    const cyr = /[а-яё]/i.test(it.breweryName ?? "");
    const e = newBreweries.get(key) ?? { name: it.breweryName ?? "?", untappdId: it.breweryId, slug: it.brewerySlug, count: 0, cyrillic: cyr, sample: [] };
    e.count++; if (e.sample.length < 3) e.sample.push(it.name);
    newBreweries.set(key, e);
    if (sampleUnmatched.length < 20) sampleUnmatched.push(`  ${title.slice(0, 56)} [${it.styleRaw}]`);
  }

  // обложка (task-15): сматченному сорту без картинки — рехост .beer-label
  if (!DRY && doImages && beerId && it.imageUrl && !imgDone.has(beerId)) {
    imgDone.add(beerId);
    const hasImg = (db.query("SELECT image_url FROM beers WHERE id = ?").get(beerId) as { image_url: string | null } | null)?.image_url;
    if (!hasImg) {
      await new Promise((r) => setTimeout(r, 150 + Math.floor(Math.random() * 250))); // вежл. пауза к CDN
      const url = await rehostLabel(it.imageUrl, ourBrew?.slug ?? "brew", beerMatch?.beerSlug ?? it.beerSlug);
      if (url) { setBeerImage(db, beerId, url); st.imgSet++; }
    }
  }

  // листинги: по одной строке на каждый размер/цену (объём идёт с ценой; pour и unit раздельно)
  if (!DRY) {
    const prices = it.prices.length ? it.prices : [{ sizeRaw: "", volumeMl: null, format: "unknown" as const, price: null, currency: "RUB" }];
    for (const p of prices) {
      recordListing(db, {
        id: `utm-${venueId}-${it.menuId}-${it.bid}-${p.volumeMl ?? "x"}-${observedDate}`,
        beerId, beerSlug: beerMatch?.beerSlug ?? slugifyLite(title),
        beerNameRaw: title, price: p.price ?? undefined, currency: p.price != null ? p.currency : undefined,
        volumeMl: p.volumeMl ?? undefined, format: p.format,
        seller, sourceUrl: it.url, seenAt: observedDate, sourceType: SOURCE_TYPE,
      });
      st.listings++;
    }
  }
}

// бэкфилл untappd-id пивоварен в links
let backfilled = 0;
if (!DRY) {
  for (const [bid, wurl] of linkBackfill) {
    const row = brewById.get(bid)!;
    let links: any[] = []; try { links = JSON.parse(row.links || "[]"); } catch {}
    if (links.some((l) => typeof l?.url === "string" && /\/w\//.test(l.url))) continue;
    links.push({ kind: "website", url: wurl, seenAt: observedDate });
    db.query("UPDATE breweries SET links = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(links), new Date().toISOString(), bid);
    backfilled++;
  }
}

// ── отчёт ─────────────────────────────────────────────────────────────────────
console.log(`\n— примеры матчей (🎯 точный untappd-id / ≈ fuzzy · = линк / + auto):`);
sampleMatched.forEach((s) => console.log(s));
if (sampleUnmatched.length) { console.log(`\n— НЕ сматчено (скоуп=пиво · → discovery):`); sampleUnmatched.forEach((s) => console.log(s)); }

const total = res.items.length;
console.log(`\n── ИТОГ ────────────────────────────────`);
console.log(`позиций ${total} | сорт сматчен ${st.matchedBeer} (auto ${st.autoBeer}) | пивоварня: точно ${st.exactBrew} / fuzzy ${st.fuzzyBrew} | не узнано ${st.unmatched} | вне канона (сидр/мид) ${st.nonBeer}`);
console.log(`match-rate пивоварни (честный): ${total ? (((st.exactBrew + st.fuzzyBrew) / total) * 100).toFixed(1) : 0}%  ·  сорта: ${total ? ((st.matchedBeer / total) * 100).toFixed(1) : 0}%`);
console.log(`обложки рехостнуто: ${st.imgSet} · untappd-id пивоварен бэкфилл: ${backfilled}`);

// discovery-предложения: unmatched пивоварни (скоуп пиво) → файл для brewery-research
const NEW_FILE = "data/discovery/untappd-menu-new-breweries.json";
if (!DRY && newBreweries.size) {
  const existing = await readJson(NEW_FILE);
  const byKey = new Map<string, any>((existing.breweries ?? []).map((b: any) => [String(b.untappdId ?? b.name).toLowerCase(), b]));
  for (const [, e] of newBreweries) {
    const k = String(e.untappdId ?? e.name).toLowerCase();
    const prev = byKey.get(k);
    byKey.set(k, {
      name: e.name, untappdId: e.untappdId, untappdSlug: e.slug, cyrillic: e.cyrillic,
      seenAt: observedDate, venues: [...new Set([...(prev?.venues ?? []), seller])],
      maxCount: Math.max(prev?.maxCount ?? 0, e.count), sampleBeers: [...new Set([...(prev?.sampleBeers ?? []), ...e.sample])].slice(0, 6),
    });
  }
  const cyrCount = [...byKey.values()].filter((b) => b.cyrillic).length;
  await Bun.write(NEW_FILE, JSON.stringify({ updatedAt: observedDate, note: "unmatched пивоварни из Untappd-меню (трек E) → кандидаты brewery-research. cyrillic=likely RU-крафт.", breweries: [...byKey.values()].sort((a, b) => b.maxCount - a.maxCount) }, null, 2));
  console.log(`\ndiscovery: ${newBreweries.size} новых пивоварен в этом венью → ${NEW_FILE} (всего ${byKey.size}, из них кириллица/RU≈${cyrCount})`);
}

if (!DRY) {
  console.log(`\nзаписано листингов: ${st.listings} (seller=${seller}, source_type=${SOURCE_TYPE})`);
  console.log("STATS:", JSON.stringify(stats(db)));
}
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();

// ── утилиты ─────────────────────────────────────────────────────────────────────
function scopeOf(it: VenueMenuItem): "beer" | "non-beer" {
  return categorizeStyle(it.styleRaw).category === "non-beer" ? "non-beer" : "beer";
}
function argName(a: string[], flag: string): string | undefined {
  const i = a.indexOf(flag);
  return i >= 0 && a[i + 1] && !a[i + 1].startsWith("--") ? a[i + 1] : undefined;
}
function slugifyLite(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}
async function readJson(path: string): Promise<any> {
  try { return await Bun.file(path).json(); } catch { return {}; }
}
async function rehostLabel(srcUrl: string, brewerySlug: string, beerSlug: string): Promise<string | null> {
  try {
    const r = await fetch(srcUrl, { headers: { "User-Agent": UA, Referer: "https://untappd.com/" } });
    if (!r.ok) return null;
    const ct = (r.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    const ext = extByCt[ct] ?? "jpg";
    const buf = await r.arrayBuffer();
    if (buf.byteLength < 512) return null; // плейсхолдер/битый
    return await putImage(`img/beer/${brewerySlug}__${beerSlug}.${ext}`, buf, ct);
  } catch { return null; }
}
