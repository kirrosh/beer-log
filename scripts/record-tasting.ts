/**
 * record-tasting.ts — детерминированный писатель дегустаций для бота (beer-concierge, TASK-46, D1).
 *
 * Разделение труда: NL-понимание делает АГЕНТ (извлекает {сорт, venue, verdict, format, descriptors,
 * price} из фразы «выпил X на Гагарина, fire, смолисто»), а этот скрипт отвечает за ДЕТЕРМИНИЗМ —
 * резолв beerId (через bot-lookup, матчер не дублируем), резолв точки (venue-registry) и атомарную
 * идемпотентную дозапись в data/personal/tastings.json (appendTasting). Не пишем при неоднозначном
 * сорте: возвращаем кандидатов, чтобы агент уточнил одной репликой.
 *
 * Вызов (агент предпочитает --json):
 *   bun run scripts/record-tasting.ts --json '{"beer":"Jaws Атомная Прачечная","verdict":"fire","venue":"Гагарина","format":"draft","descriptors":["смола"],"pricePaid":410}'
 * Либо флагами:
 *   bun run scripts/record-tasting.ts --beer "Jaws Атомная" --verdict огонь --venue Гагарина --format draft --desc "смола,цитрус"
 *
 * Выход: компактный JSON со статусом — recorded | ambiguous | error (+ что распозналось/нет).
 */
import { Database } from "bun:sqlite";
import { nameSimilarity, normalizeName } from "@beer-log/catalog-core";
import { resolveVenue } from "./lib/venue-registry.ts";
import { appendTasting, type Tasting, type Verdict } from "./lib/venue-personal.ts";
import { getLastBeer } from "./lib/bot-context.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";

// ── вход: --json перекрывает флаги ───────────────────────────────────────────────
type Input = {
  beer?: string; beerId?: string | null; verdict?: string; favorite?: boolean;
  wouldRepeat?: boolean; note?: string; descriptors?: string[] | string; venue?: string;
  format?: string; pricePaid?: number; tastedAt?: string; media?: string[]; chat?: string; thread?: string;
};

function parseArgs(argv: string[]): Input {
  const jsonAt = argv.indexOf("--json");
  if (jsonAt >= 0 && argv[jsonAt + 1]) {
    try { return JSON.parse(argv[jsonAt + 1]!) as Input; }
    catch (e) { fail(`--json не распарсился: ${(e as Error).message}`); }
  }
  const out: Input = {};
  const get = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  out.beer = get("--beer");
  out.beerId = get("--beer-id") ?? undefined;
  out.verdict = get("--verdict");
  out.venue = get("--venue");
  out.format = get("--format");
  out.note = get("--note");
  const desc = get("--desc"); if (desc) out.descriptors = desc;
  const price = get("--price"); if (price) out.pricePaid = Number(price);
  out.tastedAt = get("--date");
  out.chat = get("--chat");
  out.thread = get("--thread");
  if (argv.includes("--favorite")) out.favorite = true;
  if (argv.includes("--would-repeat")) out.wouldRepeat = true;
  if (argv.includes("--no-repeat")) out.wouldRepeat = false;
  return out;
}

// ── нормализация полей ────────────────────────────────────────────────────────────
// Маппинг вердикта (страховка — агент обычно уже шлёт fire/good/pass, но принимаем синонимы/эмодзи).
const VERDICT_MAP: Record<string, Verdict> = {
  fire: "fire", "🔥": "fire", огонь: "fire", топ: "fire", кайф: "fire", бомба: "fire", супер: "fire",
  good: "good", "👍": "good", норм: "good", ок: "good", пойдёт: "good", пойдет: "good", неплохо: "good",
  pass: "pass", "👎": "pass", мимо: "pass", "не зашло": "pass", слабо: "pass", фу: "pass",
};
function normVerdict(v?: string): Verdict | undefined {
  if (!v) return undefined;
  const k = v.trim().toLowerCase();
  return VERDICT_MAP[k] ?? (["fire", "good", "pass"].includes(k) ? (k as Verdict) : undefined);
}
function normDescriptors(d?: string[] | string): string[] | undefined {
  if (!d) return undefined;
  const arr = Array.isArray(d) ? d : d.split(",");
  const out = [...new Set(arr.map((s) => s.trim().toLowerCase()).filter(Boolean))];
  return out.length ? out : undefined;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── резолв сорта через bot-lookup (матчер не дублируем) ────────────────────────────
type LookupOut = {
  level: "exact" | "brewery" | "none";
  brewery: { name: string } | null;
  canonical: { id: string; name: string } | null;
  lineup: { id: string; name: string }[];
};
// двуязычная схожесть: канон бывает «Nuclear Laundry (Атомная Прачечная)», запрос — на одном языке.
function simTo(q: string, name: string): number {
  const paren = name.match(/\(([^)]+)\)/)?.[1];
  return Math.max(nameSimilarity(q, name), paren ? nameSimilarity(q, paren) : 0);
}
function lookupBeer(beer: string): LookupOut | null {
  const r = Bun.spawnSync(["bun", "run", "scripts/bot-lookup.ts", beer], {
    env: { ...process.env, DB_PATH },
  });
  if (!r.success) return null;
  try { return JSON.parse(r.stdout.toString().trim()) as LookupOut; }
  catch { return null; }
}

type BeerResolution = {
  level: "matched" | "absent";
  beerId: string | null;
  beerName: string | null;
  candidates: { id: string; name: string }[];
};

// beer-часть = запрос минус слова пивоварни («Rewort Золотой час» → «Золотой час»). Нужна, чтобы
// сравнивать сорт с сортом, а не разбавлять схожесть префиксом пивоварни.
function beerPartOf(query: string, breweryName?: string): string {
  const brew = new Set((breweryName ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const part = query.split(/[^\p{L}\p{N}]+/u).filter(Boolean).filter((w) => !brew.has(w.toLowerCase()));
  return part.length ? part.join(" ") : query;
}
// «Точная база»: нормализованное имя сорта (или его скобочная часть, т.к. канон двуязычен) ==
// нормализованной beer-части. Каталог двуязычен: «Nuclear Laundry (Атомная Прачечная)».
function isBaseMatch(name: string, normBeerPart: string): boolean {
  if (!normBeerPart) return false;
  const paren = name.match(/\(([^)]+)\)/)?.[1];
  return normalizeName(name) === normBeerPart || (!!paren && normalizeName(paren) === normBeerPart);
}

// Авто-приём ТОЛЬКО когда ровно ОДИН сорт точно совпал по базе имени. Каталог полон вариантов с общей
// базой (Атомная Прачечная ×5, Milk of Amnesia безалк./IPA) — там edit-distance систематически берёт
// не тот edition (memory catalog-matcher-edition-variant-falsematch). 0 или ≥2 базовых матча → отдаём
// агенту карточками с обложками → перевызов с --beer-id. Тихо угадать = испортить сигнал #43.
function resolveBeer(beer: string): BeerResolution {
  const lk = lookupBeer(beer);
  if (!lk || lk.level === "none" || !lk.canonical) {
    return { level: "absent", beerId: null, beerName: null, candidates: [] };
  }
  const part = beerPartOf(beer, lk.brewery?.name);
  const npb = normalizeName(part);
  const line = lk.lineup.length ? lk.lineup : [lk.canonical];
  const base = line.filter((b) => isBaseMatch(b.name, npb));
  if (base.length === 1) {
    return { level: "matched", beerId: base[0]!.id, beerName: base[0]!.name, candidates: [] };
  }
  // ноль/несколько точных баз — не угадываем; ранжируем по схожести beer-части для порядка карточек
  const ranked = line
    .map((b) => ({ ...b, _s: simTo(part, b.name) }))
    .sort((a, b) => b._s - a._s)
    .map(({ _s, ...b }) => b);
  return { level: "absent", beerId: null, beerName: null, candidates: ranked.slice(0, 5) };
}

// ── main ──────────────────────────────────────────────────────────────────────────
function fail(message: string): never {
  console.log(JSON.stringify({ status: "error", message }));
  process.exit(1);
}

const input = parseArgs(process.argv.slice(2));

// Дегустация без названия («о, зашло!») — подтянуть последний показанный сорт из контекста чата.
// Это страховка от потери beerId при компактизации/рестарте; источник пишет агент (bot-context set).
let fromContext = false;
if (!input.beer && !input.beerId && input.chat) {
  const ctx = getLastBeer(input.chat, undefined, input.thread);
  if (ctx) {
    input.beerId = ctx.beerId ?? undefined;
    input.beer = ctx.beer || input.beer;
    if (!input.venue && ctx.venue) input.venue = ctx.venue;
    fromContext = true;
  }
}
if (!input.beer && !input.beerId) {
  fail(input.chat
    ? "нет сорта: не назван и в контексте чата пусто/протухло — попроси юзера назвать"
    : "нужно указать сорт (--beer / json.beer / --beer-id) или --chat для контекста");
}

const db = new Database(DB_PATH, { readonly: true });

// 1. сорт
let beerRes: BeerResolution;
if (input.beerId) {
  // агент явно подтвердил канон — доверяем, имя берём из БД для читаемости
  const row = db.query("SELECT name FROM beers WHERE id = ?").get(input.beerId) as { name: string } | null;
  beerRes = { level: "matched", beerId: input.beerId, beerName: row?.name ?? null, candidates: [] };
} else {
  beerRes = resolveBeer(input.beer!);
}

// неоднозначно → НЕ пишем молча, отдаём кандидатов на уточнение
if (beerRes.candidates.length) {
  console.log(JSON.stringify({
    status: "ambiguous",
    field: "beer",
    message: `Сорт «${input.beer}» неоднозначен — уточни какой и перевызови с --beer-id`,
    candidates: beerRes.candidates,
  }));
  db.close();
  process.exit(0);
}

// 2. точка (необязательна — не блокирует запись)
let venueRes: ReturnType<typeof resolveVenue> | null = null;
if (input.venue) venueRes = resolveVenue(db, input.venue);
const venueSeller = venueRes?.resolved?.seller;

// 3. собрать и записать
const display = (input.beer && input.beer.trim()) || beerRes.beerName || "";
if (!beerRes.beerId && !display) fail("не удалось определить имя сорта");

const tasting: Tasting = {
  beerId: beerRes.beerId,
  beer: display,
  verdict: normVerdict(input.verdict),
  favorite: input.favorite,
  wouldRepeat: input.wouldRepeat,
  note: input.note,
  descriptors: normDescriptors(input.descriptors),
  venue: venueSeller,
  format: input.format,
  pricePaid: input.pricePaid,
  tastedAt: input.tastedAt || today(),
};

const res = appendTasting(tasting);
db.close();

console.log(JSON.stringify({
  status: "recorded",
  action: res.action,                 // appended | merged
  fromContext,                        // сорт взят из памяти чата (агент может это отметить)
  record: res.record,
  beer: { level: beerRes.level, beerId: beerRes.beerId, canon: beerRes.beerName },
  venue: input.venue ? {
    input: input.venue,
    resolved: venueSeller ?? null,
    name: venueRes?.resolved?.name ?? null,
    candidates: venueSeller ? undefined : venueRes?.candidates.map((c) => ({ seller: c.seller, name: c.name, score: Number(c.score.toFixed(2)) })),
  } : null,
  total: res.total,
}));
