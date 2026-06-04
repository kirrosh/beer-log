// Каскад «найти ту самую» (TASK-30, B1 горячего пути M4). По НЕточному имени сорта (с банки/из
// головы) ищет в объединённом пуле точки (кран draft + холодильник can/bottle, всё под одним
// seller'ом venue). Лексический fuzzy, БЕЗ векторов и БЕЗ LLM — read мгновенно у полки.
//
//   const vs = buildVenueSearch(db, "beermug-nn/gagarina-118");
//   vs.search("Jaws Атомная");  // → { level:"fuzzy", candidates:[{beerName:"Атомная Прачечная"...}] }
//
// Каскад деградации «лучше грубо, чем никак» (поле level = уверенность):
//   exact     — нормализованное имя сорта совпало с позицией пула;
//   fuzzy     — edit-distance/триграммы поверх нормализации дали близкого кандидата в пуле;
//   brewery   — сорт не узнан, но пивоварня распознана → «вот что есть у этого бренда на точке»;
//   absent    — сорт найден в каталоге (FTS5), но НЕ в пуле → «есть в каталоге, нет на точке»;
//   none      — ничего.
//
// spellfix1 vs edit-distance: spellfix1 в bun:sqlite требует нативной сборки расширения (хрупкая
// зависимость, на машине нет). Пул точки — десятки строк, где in-memory Левенштейн из catalog-core
// быстрее round-trip в SQLite. Поэтому: FTS5 (встроен) держит каталог-wide индекс для деградации
// "absent"; edit-distance (nameSimilarity) закрывает опечатки в пуле. Это и есть AC#1 по духу
// — «встроенно, без отдельной БД».
import { normalizeName, nameSimilarity } from "@beer-log/catalog-core";
import { buildMatcher } from "./catalog-matcher.ts";
import type { Database } from "bun:sqlite";

export type ConfidenceLevel = "exact" | "fuzzy" | "brewery" | "absent" | "none";

export type Candidate = {
  beerId: string | null;
  beerName: string;       // имя сорта (без префикса пивоварни)
  breweryName: string | null;
  format: string;         // draft | can | bottle | …
  score: number;          // 0..1, сходство с запросом
};

export type SearchResult = {
  query: string;
  level: ConfidenceLevel;
  candidates: Candidate[]; // ранжированы по score убыв.
};

type PoolItem = {
  beerId: string | null;
  rawTitle: string;          // исходный заголовок листинга (с пивоварней)
  breweryId: string | null;
  breweryName: string | null;
  beerName: string;          // канон-имя сорта (или вычищенное из raw)
  beerNameNorm: string;      // normalizeName(beerName)
  rawNorm: string;           // normalizeName(rawTitle) — для совпадения «бренд+сорт»
  format: string;
};

const FUZZY_MIN = 0.6;       // порог отсечки для уровня fuzzy
const FUZZY_TOPK = 5;
const TOKEN_SIM = 0.72;      // порог «токен запроса ≈ токену заголовка» (терпит опечатку в 1-2 буквы)

// порядок форматов для дедупа пула: предпочитаем разлив, затем банку/бутылку
const FORMAT_RANK: Record<string, number> = { draft: 0, keg: 1, can: 2, bottle: 3 };

// FTS живёт в temp-схеме: индекс по 19868 сортам не должен раздувать версионируемый catalog.sqlite
// и шуметь в git на каждом ingest. Строится один раз на соединение, при первом обращении к "absent".
/** Каталог-wide FTS5 по сортам (name+aliases+пивоварня). Идемпотентно. Для деградации "absent". */
export function ensureCatalogFts(db: Database): void {
  db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS temp.beers_fts USING fts5(
    beer_id UNINDEXED, name, brewery, aliases, tokenize='unicode61 remove_diacritics 2'
  )`);
  const ftsCount = (db.query("SELECT COUNT(*) c FROM beers_fts").get() as { c: number }).c;
  const beerCount = (db.query("SELECT COUNT(*) c FROM beers").get() as { c: number }).c;
  if (ftsCount === beerCount) return; // уже наполнен под текущий каталог
  db.run("DELETE FROM beers_fts");
  const rows = db.query(`
    SELECT b.id AS id, b.name AS name, b.aliases AS aliases,
           COALESCE(br.name, b.brewery_name_raw, '') AS brewery
    FROM beers b LEFT JOIN breweries br ON br.id = b.brewery_id
  `).all() as { id: string; name: string; aliases: string; brewery: string }[];
  const ins = db.prepare("INSERT INTO beers_fts(beer_id, name, brewery, aliases) VALUES (?,?,?,?)");
  const tx = db.transaction((items: typeof rows) => {
    for (const r of items) ins.run(r.id, r.name, r.brewery, safeAliasText(r.aliases));
  });
  tx(rows);
}

/** Построить поисковик по пулу одной точки (seller). */
export function buildVenueSearch(db: Database, seller: string) {
  const matcher = buildMatcher(db);
  const pool = buildPool(db, seller);

  function search(query: string): SearchResult {
    const q = query.trim();
    if (!q) return { query, level: "none", candidates: [] };
    const qNorm = normalizeName(q);

    // L1 exact: нормализованное имя сорта ИЛИ «бренд+сорт» совпало с позицией пула
    const exact = pool.filter((p) => p.beerNameNorm === qNorm || p.rawNorm === qNorm);
    if (exact.length) return { query, level: "exact", candidates: rank(exact, q, 1) };

    // L2 fuzzy: edit-distance/нормализация поверх пула. Сравниваем и с именем сорта, и с «бренд+сорт»,
    // и с «хвостом» raw — чтобы «Jaws Атомная» поймало «Атомная Прачечная».
    const scored = pool
      .map((p) => ({ p, score: scoreItem(p, q, qNorm) }))
      .filter((x) => x.score >= FUZZY_MIN)
      .sort((a, b) => b.score - a.score)
      .slice(0, FUZZY_TOPK);
    if (scored.length) {
      return { query, level: "fuzzy", candidates: scored.map((x) => toCand(x.p, x.score)) };
    }

    // L3 brewery-only: пивоварня распознана матчером, сорт нет → что есть у бренда на точке
    const m = matcher.match(q);
    if (m.breweryId) {
      const brand = pool.filter((p) => p.breweryId === m.breweryId);
      if (brand.length) {
        return { query, level: "brewery", candidates: rank(brand, q, 0.5) };
      }
    }

    // L4 absent: сорт есть в каталоге (FTS5), но не в пуле точки — честная деградация
    const inCatalog = ftsLookup(db, q);
    if (inCatalog.length) {
      return {
        query, level: "absent",
        candidates: inCatalog.map((r) => ({
          beerId: r.beerId, beerName: r.name, breweryName: r.brewery || null,
          format: "—", score: 0,
        })),
      };
    }
    return { query, level: "none", candidates: [] };
  }

  return { search, poolSize: pool.length, seller };
}

// ── пул точки ────────────────────────────────────────────────────────────────
function buildPool(db: Database, seller: string): PoolItem[] {
  const matcher = buildMatcher(db);
  const rows = db.query(`
    SELECT pl.beer_id AS beerId, pl.beer_name_raw AS raw, pl.format AS format,
           b.name AS beerName, b.brewery_id AS brewBeerId,
           br.name AS brewName
    FROM price_listings pl
    LEFT JOIN beers b ON b.id = pl.beer_id
    LEFT JOIN breweries br ON br.id = b.brewery_id
    WHERE pl.seller = ?
  `).all(seller) as {
    beerId: string | null; raw: string; format: string;
    beerName: string | null; brewBeerId: string | null; brewName: string | null;
  }[];

  // дедуп по канон-сорту (или raw для нераспознанных), оставляя лучший формат
  const byKey = new Map<string, PoolItem>();
  for (const r of rows) {
    let beerName = r.beerName ?? "";
    let breweryId = r.brewBeerId ?? null;
    let breweryName = r.brewName ?? null;
    if (!r.beerId) {
      // нераспознанный листинг: вытащить пивоварню из raw и срезать её из имени сорта
      const m = matcher.match(r.raw);
      breweryId = m.breweryId ?? null;
      breweryName = m.breweryName ?? null;
      beerName = m.beerName ?? stripBrewery(r.raw, breweryName);
    }
    const item: PoolItem = {
      beerId: r.beerId, rawTitle: r.raw, breweryId, breweryName,
      beerName, beerNameNorm: normalizeName(beerName), rawNorm: normalizeName(r.raw),
      format: r.format || "unknown",
    };
    const key = r.beerId ?? `raw:${item.rawNorm}`;
    const prev = byKey.get(key);
    if (!prev || formatRank(item.format) < formatRank(prev.format)) byKey.set(key, item);
  }
  return [...byKey.values()];
}

// ── скоринг ──────────────────────────────────────────────────────────────────
// Сходство запроса с позицией пула. Ключевой инвариант уровня fuzzy: совпасть должен хотя бы один
// токен ИМЕНИ СОРТА — иначе это чисто брендовый запрос («Глетчер»), его разбирает каскад brewery,
// а не выдаёт ложным «нашли сорт». Токены бренда лишь не штрафуют долю (q «Jaws Атомная»).
function scoreItem(p: PoolItem, q: string, qNorm: string): number {
  // частичный матч по ИМЕНИ СОРТА (не по raw — там бренд): подстрока ≥3 симв. → сильный сигнал
  let best = nameSimilarity(q, p.beerName);
  if (qNorm.length >= 3 && p.beerNameNorm.includes(qNorm)) best = Math.max(best, 0.85);
  best = Math.max(best, tokenOverlap(p, q));
  return best;
}

// доля токенов запроса, нашедших близкий (sim≥TOKEN_SIM) токен в имени сорта/бренде; 0..0.95.
// Возвращает 0, если ни один токен сорта не совпал — тогда это не fuzzy, а бренд-запрос.
function tokenOverlap(p: PoolItem, q: string): number {
  const qt = tokens(q);
  if (!qt.length) return 0;
  const sortT = tokens(p.beerName);
  const brandT = tokens(p.breweryName ?? "");
  let sortHit = 0, anyHit = 0;
  for (const a of qt) {
    const inSort = sortT.some((b) => nameSimilarity(a, b) >= TOKEN_SIM);
    if (inSort) sortHit++;
    if (inSort || brandT.some((b) => nameSimilarity(a, b) >= TOKEN_SIM)) anyHit++;
  }
  if (sortHit === 0) return 0; // только бренд → пусть решает каскад brewery
  return (anyHit / qt.length) * 0.95;
}

function tokens(s: string): string[] {
  return s.split(/[^\p{L}\p{N}]+/u).map((t) => normalizeName(t)).filter((t) => t.length >= 2);
}

// ── FTS5 каталог-wide ─────────────────────────────────────────────────────────
function ftsLookup(db: Database, q: string): { beerId: string; name: string; brewery: string }[] {
  ensureCatalogFts(db);
  const m = ftsMatch(q);
  if (!m) return [];
  try {
    return db.query(`
      SELECT beer_id AS beerId, name, brewery FROM beers_fts
      WHERE beers_fts MATCH ? ORDER BY rank LIMIT 5
    `).all(m) as { beerId: string; name: string; brewery: string }[];
  } catch {
    return [];
  }
}

// запрос → FTS5 MATCH: токены ≥2 симв. как префиксы, OR-объединение
function ftsMatch(q: string): string | null {
  const ts = q.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2);
  if (!ts.length) return null;
  return ts.map((t) => `"${t.replace(/"/g, "")}"*`).join(" OR ");
}

// ── утилиты ───────────────────────────────────────────────────────────────────
function rank(items: PoolItem[], q: string, base: number): Candidate[] {
  return items
    .map((p) => toCand(p, Math.max(base, nameSimilarity(q, p.beerName))))
    .sort((a, b) => b.score - a.score);
}
function toCand(p: PoolItem, score: number): Candidate {
  return {
    beerId: p.beerId, beerName: p.beerName || p.rawTitle,
    breweryName: p.breweryName, format: p.format, score: Math.round(score * 100) / 100,
  };
}
function formatRank(f: string): number {
  return FORMAT_RANK[f] ?? 9;
}
function stripBrewery(raw: string, brewery: string | null): string {
  if (!brewery) return raw;
  const i = raw.toLowerCase().indexOf(brewery.toLowerCase());
  return i === 0 ? raw.slice(brewery.length).trim() : raw;
}
function safeAliasText(s: string): string {
  try {
    const a = JSON.parse(s || "[]");
    return Array.isArray(a) ? a.join(" ") : "";
  } catch {
    return "";
  }
}
