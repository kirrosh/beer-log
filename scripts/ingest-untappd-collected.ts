// Ингест сортов Untappd, СОБРАННЫХ В БРАУЗЕРЕ (task-16).
//
// Зачем отдельный путь: с 2026 Untappd закрыл пагинацию /beer за логином, а сессионная cookie —
// httpOnly (недоступна из JS/скрипта). Поэтому полную выгрузку >25 сортов делаем в залогиненном
// Chrome (агент Claude-in-Chrome гоняет more_beer, cookie не покидает браузер), сохраняем сорта в
// data/.secrets/untappd-collected.json и ингестим этим скриптом. Для headless-прогона (cron) есть
// второй путь: положить Cookie-заголовок в data/.secrets/untappd-cookie.txt — тогда работает
// untappdWebParser.parse(url,{paginate:true}) напрямую (scripts/ingest-untappd.ts).
//
//   bun run scripts/ingest-untappd-collected.ts            # ингест всех собранных пивоварен
//   bun run scripts/ingest-untappd-collected.ts jaws-brewery zavod   # только указанные slug
//
// Формат JSON: { "<slug>": { total, got, beers: [{ n:name, s:styleRaw, a:abv, i:ibu }] } }
import { openDb, upsertBeer, stats } from "@beer-log/store";
import { categorizeStyle } from "@beer-log/catalog-core";
import { classifyUntappdBeerListUrl } from "@beer-log/parsers";

const HINTS = "data/ingest-hints.json";
const COLLECTED = "data/.secrets/untappd-collected.json";
const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const today = new Date().toISOString().slice(0, 10);

type Collected = Record<string, { total: number | null; got: number; beers: { n: string; s: string; a: number | null; i: number | null }[] }>;
const collected = JSON.parse(await Bun.file(COLLECTED).text()) as Collected;
const hintsFile = JSON.parse(await Bun.file(HINTS).text()) as {
  generatedAt: string;
  breweries: Record<string, Record<string, unknown>>;
};

const db = openDb(DB_PATH);

// URL списка сортов на Untappd для slug: из breweries.links (kind:untappd) → иначе из hints.untappd.url.
function sourceUrl(slug: string): string | null {
  const row = db.query("SELECT links FROM breweries WHERE slug = ?").get(slug) as { links: string } | null;
  const raw = row && (JSON.parse(row.links || "[]") as { kind: string; url?: string }[]).find((l) => l.kind === "untappd" && l.url)?.url;
  if (raw) {
    const c = classifyUntappdBeerListUrl(raw);
    if (c.ok) return c.url;
  }
  const hintUrl = (hintsFile.breweries[slug]?.untappd as { url?: string } | undefined)?.url;
  return hintUrl ?? null;
}

const args = process.argv.slice(2);
const slugs = args.length ? args : Object.keys(collected);

let grandTotal = 0;
for (const slug of slugs) {
  const entry = collected[slug];
  if (!entry) {
    console.log(`! ${slug}: нет в ${COLLECTED} — пропуск`);
    continue;
  }
  const row = db.query("SELECT id, name FROM breweries WHERE slug = ?").get(slug) as { id: string; name: string } | null;
  if (!row) {
    console.log(`! ${slug}: нет такой пивоварни в каталоге — пропуск`);
    continue;
  }
  const url = sourceUrl(slug);
  if (!url) {
    console.log(`! ${slug}: не резолвится untappd-URL (ни links, ни hints) — пропуск`);
    continue;
  }

  let ingested = 0;
  for (const b of entry.beers) {
    if (!b.n) continue;
    const st = categorizeStyle(b.s);
    upsertBeer(db, {
      name: b.n,
      breweryId: row.id,
      breweryNameRaw: row.name,
      abv: b.a ?? undefined,
      ibu: b.i ?? undefined,
      status: "validated",
      style: { slug: st.slug, name: b.s, category: st.category },
      source: { url, excerpt: undefined, seenAt: today },
    });
    ingested++;
  }
  grandTotal += ingested;

  // Пагинация в браузере доходит до total; недобор в 1–3 сорта — это блоки без стиля/имени,
  // которые парсер пропускает (повторная пагинация их не вернёт). Флагаем PARTIAL только при
  // значимом недоборе (>3), иначе считаем покрытие полным.
  const total = entry.total ?? null;
  const partial = total != null && total - ingested > 3;
  const status = partial ? "ok-untappd-partial" : "ok-untappd";
  console.log(`@untappd ${slug}: сортов ${ingested}${total != null ? `/${total}` : ""}${partial ? " (частично)" : ""} | ${url}`);

  // аддитивно: дописать блок untappd, не затирая TG-поля
  const prev = hintsFile.breweries[slug] ?? { brewery: row.name };
  hintsFile.breweries[slug] = {
    ...prev,
    untappd: { url, sortsIngested: ingested, sortsTotal: total, lastRun: today, status, via: "browser-collect" },
    note: "сорта бэкфилнуты с Untappd (авторизованная пагинация, browser-collect — см. поле untappd)",
  };
}

await Bun.write(HINTS, JSON.stringify(hintsFile, null, 2));
console.log("\nИтого с Untappd (collected) заингещено:", grandTotal, "| STATS:", JSON.stringify(stats(db)));
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
