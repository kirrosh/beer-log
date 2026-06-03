// Наполнение офиц. изображениями (task-15): рехостинг логотипов пивоварен и этикеток сортов.
// Источник — Untappd. Переиспользует боевой парсер `untappdWebParser` (классификация URL +
// пагинация more_beer за логин-гейтом по cookie, task-16): он отдаёт ВСЕ сорта пивоварни
// (не только первые ~25) с URL этикеток + логотип пивоварни из шапки. Мы их скачиваем к себе в
// packages/web/static/img/..., в БД image_url = локальный путь. Без хотлинка чужого CDN.
//
// Решение рехостить (а не ссылки): см. память images-rehost-decision / task-15 notes.
// Пагинация требует cookie сессии Untappd (UNTAPPD_COOKIE или data/.secrets/untappd-cookie.txt);
// без неё доберём только ~25 этикеток/пивоварню (парсер сам предупредит недобором).
//
// Запуск:
//   bun run scripts/enrich-images.ts                 # топ-5 пивоварен по охвату (reach)
//   bun run scripts/enrich-images.ts --top 10
//   bun run scripts/enrich-images.ts --slugs a,b,c   # конкретные пивоварни по slug
//   bun run scripts/enrich-images.ts --force         # перезалить даже если image_url уже есть
//   bun run scripts/enrich-images.ts --no-paginate   # только первая страница (~25), без cookie
//   bun run scripts/enrich-images.ts --dry           # только показать, что нашлось, без записи
import { Database } from "bun:sqlite";
import { migrate, setBreweryImage, setBeerImage } from "@beer-log/store";
import { nameSimilarity } from "@beer-log/catalog-core";
import { untappdWebParser } from "@beer-log/parsers";
import { isS3Configured, putImage } from "./lib/images-store.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const SIM_THRESHOLD = 0.85; // порог матча имени сорта (как в isSameBeer)
const DELAY_MS = 1500; // пауза между пивоварнями (внутри страниц джиттерит сам парсер)

// ── аргументы ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("--") ? argv[i + 1]! : null;
};
const has = (name: string): boolean => argv.includes(`--${name}`);
const TOP = Number(flag("top") ?? "5");
const SLUGS = flag("slugs")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;
const FORCE = has("force");
const DRY = has("dry");
const PAGINATE = !has("no-paginate");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const extOf = (url: string): string => (url.match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i)?.[1] ?? "jpg").toLowerCase();

function pickUntappd(linksJson: string): string | null {
  try {
    const links = JSON.parse(linksJson || "[]") as { kind: string; url?: string }[];
    return links.find((l) => l.kind === "untappd" && l.url)?.url ?? null;
  } catch {
    return null;
  }
}

/** Скачать картинку с Untappd и залить в хранилище (S3/локально). Возвращает image_url или null. */
async function rehost(srcUrl: string, key: string): Promise<string | null> {
  try {
    const r = await fetch(srcUrl, { headers: { "User-Agent": UA, Referer: "https://untappd.com/" } });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/")) return null;
    const buf = await r.arrayBuffer();
    if (buf.byteLength < 500) return null; // отсев плейсхолдеров/битых
    return await putImage(key, buf, ct);
  } catch {
    return null;
  }
}

// ── выбор пивоварен ───────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
migrate(db); // гарантируем колонки image_url на старой БД

type BrewRow = { id: string; slug: string; name: string; links: string; image_url: string | null };
let targets: BrewRow[];
if (SLUGS) {
  targets = SLUGS.map((s) =>
    db.query("SELECT id, slug, name, links, image_url FROM breweries WHERE slug = ?").get(s) as BrewRow | null,
  ).filter((b): b is BrewRow => !!b);
} else {
  // топ по охвату: число различных продавцов среди сортов пивоварни (= ширина дистрибуции)
  const ranked = db.query(`
    SELECT b.id, b.slug, b.name, b.links, b.image_url,
           COUNT(DISTINCT pl.seller) AS reach, COUNT(pl.id) AS listings
    FROM breweries b
    JOIN beers be ON be.brewery_id = b.id
    JOIN price_listings pl ON pl.beer_id = be.id AND pl.seller IS NOT NULL
    GROUP BY b.id
    ORDER BY reach DESC, listings DESC, b.name
  `).all() as BrewRow[];
  targets = ranked.filter((b) => pickUntappd(b.links) && (FORCE || !b.image_url)).slice(0, TOP);
}

if (PAGINATE) {
  const hasCookie = Boolean(
    process.env.UNTAPPD_COOKIE?.trim() || (await Bun.file("data/.secrets/untappd-cookie.txt").exists().catch(() => false)),
  );
  if (!hasCookie)
    console.log("! Пагинация включена, но cookie Untappd не найдена — доберётся только ~25 этикеток/пивоварню.\n");
}
const store = (await isS3Configured()) ? "S3 (Yandex)" : "локально (static/img, нет data/.secrets/s3.json)";
console.log(`хранилище: ${store}`);
console.log(`цель: ${targets.length} пивоварен${SLUGS ? "" : ` (топ-${TOP} по охвату)`}${PAGINATE ? " · пагинация" : ""}${DRY ? " · DRY" : ""}\n`);

let brewSet = 0, beerSet = 0;
for (const [i, b] of targets.entries()) {
  const src = pickUntappd(b.links);
  if (!src) { console.log(`— ${b.name}: нет Untappd-ссылки, пропуск`); continue; }
  if (i > 0) await sleep(DELAY_MS);

  let logo: string | null = null;
  let scraped: { name: string; imageUrl: string }[] = [];
  try {
    const r = await untappdWebParser.parse(src, { paginate: PAGINATE });
    logo = r.imageUrl ?? null;
    scraped = r.beers
      .filter((x): x is { name: string; imageUrl: string } => !!x.name && !!x.imageUrl)
      .map((x) => ({ name: x.name!, imageUrl: x.imageUrl! }));
  } catch (e) {
    console.log(`— ${b.name}: парсер отказал (${String(e).slice(0, 120)})`); continue;
  }
  console.log(`• ${b.name} → логотип:${logo ? "✓" : "—"} этикеток получено:${scraped.length}`);

  // логотип пивоварни
  if (logo && (FORCE || !b.image_url)) {
    const key = `img/brewery/${b.slug}.${extOf(logo)}`;
    if (DRY) { console.log(`    [dry] logo → ${key}`); brewSet++; }
    else {
      const url = await rehost(logo, key);
      if (url) { setBreweryImage(db, b.id, url); brewSet++; console.log(`    logo → ${url}`); }
      else console.log(`    logo: не залился`);
    }
  }

  // этикетки сортов — матч по имени к нашим сортам этой пивоварни
  const ourBeers = db.query("SELECT id, name, slug, image_url FROM beers WHERE brewery_id = ?")
    .all(b.id) as { id: string; name: string; slug: string; image_url: string | null }[];
  for (const beer of ourBeers) {
    if (beer.image_url && !FORCE) continue;
    let best: { name: string; imageUrl: string } | null = null, bestSim = 0;
    for (const s of scraped) {
      const sim = nameSimilarity(beer.name, s.name);
      if (sim > bestSim) { bestSim = sim; best = s; }
    }
    if (!best || bestSim < SIM_THRESHOLD) continue;
    const key = `img/beer/${b.slug}__${beer.slug}.${extOf(best.imageUrl)}`;
    if (DRY) { console.log(`    [dry] «${beer.name}» ≈ «${best.name}» (${bestSim.toFixed(2)}) → ${key}`); beerSet++; }
    else {
      const url = await rehost(best.imageUrl, key);
      if (url) {
        setBeerImage(db, beer.id, url); beerSet++;
        console.log(`    «${beer.name}» ≈ «${best.name}» (${bestSim.toFixed(2)}) → ${url}`);
      }
    }
  }
}

console.log(`\nготово: логотипов ${brewSet}, этикеток ${beerSet}${DRY ? " (dry, без записи)" : ""}`);
db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
db.close();
