// DEPRECATED (task-23): заменён единым движком `scripts/ingest-shop-platform.ts vashchehov-nn`
// (конфиг в shops.json.ingestConfig, платформа telegram). Оставлен до полного регресса, затем удалить.
// Ингест demand-сигнала с разливного бара «Ваш Чехов» (Нижний Новгород) — НЕ из веб-каталога
// (его нет), а из публичного Telegram-канала t.me/s/chekhov_nn. Бар постит тап-листы вида:
//   📍РОДИОНОВА
//   Big Village Morning Ritual
//   Brewmen Tomato Soul
//   …
// (по сорту в строке, секции по точкам сети). Это «что сейчас на кранах» = ассортимент/спрос.
// Цены в постах нет → format=draft, price=null. Матчер сам делит строку на пивоварню+сорт.
// PoC паттерна «бар → TG-тап-лист»: тем же приёмом покрываются другие разливные бары.
//
//   DRY=1 bun run scripts/ingest-vashchehov.ts     # сухой прогон: match-rate + примеры
//   bun run scripts/ingest-vashchehov.ts           # запись листингов
import { openDb, recordListing, stats } from "@beer-log/store";
import { parseChannelHtml } from "@beer-log/parsers";
import { slugify } from "@beer-log/catalog-core";
import { buildMatcher } from "./lib/catalog-matcher.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const DRY = !!process.env.DRY;
const HANDLE = "chekhov_nn";
const SELLER = "t.me/chekhov_nn";          // разливной бар «Ваш Чехов» (НН), сеть = один продавец
const SRC_URL = "https://t.me/chekhov_nn";
const UA = { "User-Agent": "Mozilla/5.0 (compatible; beer-log/0.1)" };
const today = new Date().toISOString().slice(0, 10);

const dec = (s: string) =>
  s.replace(/&laquo;|&raquo;|&quot;|&#8220;|&#8221;/g, '"').replace(/&#8211;|&#8212;/g, "-")
   .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;|&#x27;/g, "'")
   .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();

// строка похожа на позицию пива (а не на промо-фразу/заголовок секции):
// без эмодзи и предложенческой пунктуации, 1–8 слов. Для отсева import-строк,
// что матчер не узнал (Hofbrau и т.п.), но это всё же пиво — оставляем; промо — нет.
function looksLikeBeerLine(s: string): boolean {
  if (!s) return false;
  if (/\p{Extended_Pictographic}/u.test(s)) return false; // эмодзи → промо/заголовок
  if (/[.!?:]/.test(s)) return false;                     // предложение, не название
  const words = s.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 8;
}

// Достаёт строки-позиции из тап-листа: всё после первой 📍, кроме строк-локаций (📍…) и пустых.
function tapLines(post: string): string[] {
  const lines = post.split(/\r?\n/).map((l) => dec(l));
  const firstPin = lines.findIndex((l) => l.includes("📍"));
  if (firstPin < 0) return [];
  return lines.slice(firstPin + 1).filter((l) => l && !l.includes("📍"));
}

const res = await fetch(`https://t.me/s/${HANDLE}`, { headers: UA });
if (!res.ok) { console.error(`HTTP ${res.status} для t.me/s/${HANDLE}`); process.exit(1); }
const messages = parseChannelHtml(await res.text());
const tapPosts = messages.filter((t) => t.includes("📍"));
console.log(`постов на странице: ${messages.length} | тап-листов (с 📍): ${tapPosts.length}`);

const db = openDb(DB_PATH);
const matcher = buildMatcher(db, { createAuto: !DRY });
console.log(`матчер: ${matcher.breweryCount} пивоварен / ${matcher.aliasCount} алиасов | DRY=${DRY}`);

let total = 0, matchedBeer = 0, autoCreated = 0, brewOnly = 0, unmatched = 0, listings = 0;
const sampleMatched: string[] = [], sampleUnmatched: string[] = [];
const seen = new Set<string>(); // дедуп по строке (один сорт повторяется по точкам сети)

for (const post of tapPosts) {
  for (const line of tapLines(post)) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    const mm = matcher.match(line);
    // записываем, если узнали пивоварню ИЛИ строка похожа на пиво (import вне канона)
    if (!mm.breweryId && !looksLikeBeerLine(line)) continue;
    seen.add(key);
    total++;
    if (mm.beerId) {
      matchedBeer++;
      if (mm.createdAuto) autoCreated++;
      if (sampleMatched.length < 25) sampleMatched.push(`${mm.createdAuto ? "+" : "="} [${mm.breweryName}] ${line.slice(0, 46)} → ${mm.beerName}`);
    } else if (mm.breweryId) { brewOnly++; }
    else { unmatched++; if (sampleUnmatched.length < 25) sampleUnmatched.push(`  ${line.slice(0, 60)}`); }
    if (!DRY) {
      recordListing(db, {
        id: `vc-${slugify(line)}-${today}`, beerId: mm.beerId, beerSlug: mm.beerSlug,
        beerNameRaw: line, format: "draft", seller: SELLER, sourceUrl: SRC_URL, seenAt: today,
      });
      listings++;
    }
  }
}

console.log(`\nпозиций ${total} | сорт сматчен ${matchedBeer} (auto ${autoCreated}) | только пивоварня ${brewOnly} | не узнано ${unmatched}`);
console.log(`match-rate сорта: ${total ? ((matchedBeer / total) * 100).toFixed(1) : 0}%`);
console.log(`\n— примеры матчей:`); sampleMatched.forEach((s) => console.log(s));
console.log(`\n— НЕ узнано (импорт/вне канона):`); sampleUnmatched.forEach((s) => console.log(s));
if (!DRY) { console.log(`\nзаписано листингов: ${listings}`); console.log("STATS:", JSON.stringify(stats(db))); }
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
