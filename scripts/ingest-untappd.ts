// Ингест сортов с Untappd для пивоварен, у которых офиц. TG-канал не читается (дрейф-каналы
// с закрытым веб-превью t.me/s) или TG нет вовсе (task-13). Untappd отдаёт структурированный
// список сортов пивоварни (имя, стиль, ABV, IBU, описание) на публичной странице /beer —
// в отличие от закрытых TG-превью, его можно парсить без агента.
//
//   bun run scripts/ingest-untappd.ts            # ингест всех пивоварен из MAP
//   bun run scripts/ingest-untappd.ts jaws-brewery hophead-brewery   # только указанные slug
//
// Апсертит сорта в каталог (source = URL карточки Untappd, status validated) и аддитивно
// дописывает блок `untappd` в data/ingest-hints.json для затронутых пивоварен — не трогая
// TG-метаданные (channel/newestId/…), чтобы TG- и Untappd-источники сосуществовали.
import { openDb, upsertBeer, stats } from "@beer-log/store";
import { untappdWebParser } from "@beer-log/parsers";

const HINTS = "data/ingest-hints.json";
const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const PAGE_CAP = 25; // Untappd отдаёт ~25 сортов на первой странице (дальше — AJAX-догрузка)
const today = new Date().toISOString().slice(0, 10);

// slug пивоварни (как в каталоге) → URL списка сортов на Untappd.
// Стартовый набор — три дрейф-канала (task-13); расширять сюда же для пивоварен без TG.
const MAP: Record<string, string> = {
  "jaws-brewery": "https://untappd.com/JawsBrew/beer",
  "hophead-brewery": "https://untappd.com/Hophead_Brewery/beer",
  "petzold": "https://untappd.com/w/petzold-brewpub/159028/beer",
  // task: ingest-sorts batch 1 (pipeline-run sweep 2026-05-31)
  "brew-barrel": "https://untappd.com/Brew_Barrel/beer",
  "brew-by-crew": "https://untappd.com/BrewByCrew/beer",
  "brew-garage-78": "https://untappd.com/BrewGarage78/beer",
  "brewmen": "https://untappd.com/BrewmenBrewery/beer",
  "burning-brewery": "https://untappd.com/BurningBrewery/beer",
  "credo-brewery": "https://untappd.com/CredoBrewery/beer",
  "craft-band": "https://untappd.com/Craftband/beer",
};

const db = openDb(DB_PATH);

// Резолвит untappd-URL для slug: сперва ручной MAP (легаси/seed), иначе — ссылка kind:"untappd"
// из breweries.links в БД. Так оркестратору НЕ нужно редактировать MAP на каждый батч —
// достаточно передать slug'и, у которых brewery-research уже записал untappd-линк (см. SKILL.md).
function urlFromLinks(slug: string): string | null {
  const row = db.query("SELECT links FROM breweries WHERE slug = ?").get(slug) as { links: string } | null;
  if (!row) return null;
  const links = JSON.parse(row.links || "[]") as { kind: string; url?: string }[];
  return links.find((l) => l.kind === "untappd" && l.url)?.url ?? null;
}

// Цели: с аргументами — каждый запрошенный slug (MAP → иначе БД-линк); без аргументов — весь MAP.
const args = process.argv.slice(2);
let targets: [string, string][];
if (args.length === 0) {
  targets = Object.entries(MAP);
} else {
  targets = [];
  for (const slug of args) {
    const url = MAP[slug] ?? urlFromLinks(slug);
    if (!url) {
      console.log(`! ${slug}: нет untappd-источника (ни в MAP, ни в breweries.links) — пропуск`);
      continue;
    }
    targets.push([slug, url]);
  }
}
const hintsFile = JSON.parse(await Bun.file(HINTS).text()) as {
  generatedAt: string;
  breweries: Record<string, Record<string, unknown>>;
};

let grandTotal = 0;
for (const [slug, url] of targets) {
  const row = db.query("SELECT id, name FROM breweries WHERE slug = ?").get(slug) as { id: string; name: string } | null;
  if (!row) {
    console.log(`! ${slug}: нет такой пивоварни в каталоге — пропуск`);
    continue;
  }
  let ingested = 0;
  let status = "ok-untappd";
  try {
    const r = await untappdWebParser.parse(url);
    for (const b of r.beers) {
      if (!b.name) continue;
      upsertBeer(db, {
        name: b.name,
        breweryId: row.id,
        breweryNameRaw: row.name,
        abv: b.abv ?? undefined,
        ibu: b.ibu ?? undefined,
        status: "validated",
        style: b.style,
        source: { url: r.source.url, excerpt: undefined, seenAt: today },
      });
      ingested++;
    }
    const capped = ingested >= PAGE_CAP;
    console.log(`@untappd ${slug}: сортов ${ingested}${capped ? " (упёрлось в страницу — возможно есть ещё, нужна AJAX-догрузка)" : ""} | ${url}`);
    if (capped) status = "ok-untappd-capped";
  } catch (e) {
    status = "untappd-error";
    console.log(`@untappd ${slug}: ОШИБКА ${e}`);
  }
  grandTotal += ingested;

  // аддитивно: дописать блок untappd, не затирая TG-поля
  const prev = hintsFile.breweries[slug] ?? { brewery: row.name };
  hintsFile.breweries[slug] = {
    ...prev,
    untappd: { url, sortsIngested: ingested, lastRun: today, status },
    // ободряющую заметку ставим только при реальном добре — иначе (0 сортов/ошибка) она вводит в заблуждение
    ...(ingested > 0
      ? { note: "офиц. TG-превью закрыто/нет — сорта бэкфилнуты с Untappd (см. поле untappd)" }
      : {}),
  };
}

await Bun.write(HINTS, JSON.stringify(hintsFile, null, 2));
console.log("\nИтого с Untappd заингещено:", grandTotal, "| STATS:", JSON.stringify(stats(db)));
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
