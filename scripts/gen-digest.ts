// Сборка мета-дайджеста каталога (task-11, пункт «контент из вики / LLM-wiki»).
// Разделение труда: этот скрипт ДЕТЕРМИНИРОВАН — он считает ФАКТЫ из снапшота (никаких
// галлюцинаций цифр) и собирает итоговый digest.json. ПРОЗУ поверх фактов пишет агент
// Claude Code через скилл `meta-digest` и кладёт в data/digest-prose.md (никаких API-вызовов
// из скрипта). Источник прозы по приоритету:
//   1) data/digest-prose.md — проза от агента (коммитится; воспроизводимая сборка);
//   2) иначе                 — детерминированный шаблон из фактов (дайджест есть всегда).
// Витрина читает packages/web/src/lib/data/digest.json (страница /meta). Статика сохраняется.
// Запуск:
//   bun run scripts/gen-digest.ts            — собрать digest.json (prose-file | template)
//   bun run scripts/gen-digest.ts --facts    — напечатать факты (JSON) в stdout, ничего не писать
//                                              (скилл meta-digest берёт их, чтобы написать прозу)
import { readFileSync, existsSync } from "node:fs";

const SNAPSHOT = "packages/web/src/lib/data/catalog.json";
const PROSE_FILE = "data/digest-prose.md";
const OUT = "packages/web/src/lib/data/digest.json";
const FACTS_ONLY = process.argv.includes("--facts");

// Русские подписи категорий стилей (зеркало packages/web/src/lib/styles.ts — скрипт не
// тянет Svelte-модули, поэтому держим маленькую копию здесь).
const CAT_LABEL: Record<string, string> = {
  ipa: "IPA", "pale-ale": "Пэйл-эль", lager: "Лагер", "stout-porter": "Стаут / Портер",
  "sour-wild": "Сауэр / Дикие", wheat: "Пшеничное", belgian: "Бельгийское",
  specialty: "Спешелти", "non-beer": "Не пиво", unknown: "Прочее",
};
const catLabel = (c: string) => CAT_LABEL[c] ?? c;

type Place = { seller: string; kind: string; listedBeers?: number };
type BreweryDemand = { reach: number; listings: number; listedBeers: number; places: Place[] } | null;
type BeerDemand = { reach: number; listings: number; discounted: boolean; minPrice: number | null } | null;
interface Brewery { slug: string; name: string; city: string | null; beerCount: number; demand: BreweryDemand }
interface Beer {
  slug: string; name: string; breweryName: string | null; brewerySlug: string | null;
  style: { category: string } | null; demand: BeerDemand; channels: string[];
}
interface Snapshot {
  generatedAt: string;
  counts: Record<string, number>;
  breweries: Brewery[];
  beers: Beer[];
}

const snap = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Snapshot;

// ── ФАКТЫ (детерминированно из снапшота) ────────────────────────────────────
const styleDist = (() => {
  const m = new Map<string, number>();
  for (const b of snap.beers) m.set(b.style?.category ?? "unknown", (m.get(b.style?.category ?? "unknown") ?? 0) + 1);
  const total = snap.beers.length || 1;
  return [...m.entries()]
    .map(([category, count]) => ({ category, label: catLabel(category), count, pct: Math.round((count / total) * 1000) / 10 }))
    .sort((a, b) => b.count - a.count);
})();

const topCities = (() => {
  const m = new Map<string, number>();
  for (const b of snap.breweries) if (b.city) m.set(b.city, (m.get(b.city) ?? 0) + 1);
  return [...m.entries()].map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count).slice(0, 8);
})();

const topBreweries = snap.breweries
  .filter((b) => b.demand)
  .sort((a, b) => (b.demand!.reach - a.demand!.reach) || (b.demand!.listedBeers - a.demand!.listedBeers))
  .slice(0, 8)
  .map((b) => ({ name: b.name, city: b.city, reach: b.demand!.reach, listedBeers: b.demand!.listedBeers }));

const topBeers = snap.beers
  .filter((b) => b.demand && b.brewerySlug)
  .sort((a, b) => (b.demand!.reach - a.demand!.reach) || (b.demand!.listings - a.demand!.listings))
  .slice(0, 8)
  .map((b) => ({ name: b.name, brewery: b.breweryName, reach: b.demand!.reach, minPrice: b.demand!.minPrice }));

const dealsCount = snap.beers.filter((b) => b.demand?.discounted).length;
const verified = snap.beers.filter((b) => b.channels.length).length;
const shopOnly = snap.beers.filter((b) => b.demand && !b.channels.length).length;

const facts = {
  counts: {
    breweries: snap.breweries.length,
    beers: snap.beers.length,
    cities: new Set(snap.breweries.map((b) => b.city).filter(Boolean)).size,
    beersWithDemand: snap.beers.filter((b) => b.demand).length,
    verified,
    shopOnly,
    deals: dealsCount,
  },
  styleDist,
  topCities,
  topBreweries,
  topBeers,
};

// Режим --facts: отдать факты скиллу meta-digest (он напишет прозу) и выйти, не трогая digest.json.
if (FACTS_ONLY) {
  console.log(JSON.stringify(facts, null, 2));
  process.exit(0);
}

// ── ПРОЗА ───────────────────────────────────────────────────────────────────
const plur = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};

/** Детерминированный fallback — связный текст строго из фактов, без модели. */
function templateProse(): string {
  const c = facts.counts;
  const top3 = styleDist.slice(0, 3).map((s) => `${s.label} (${s.pct}%)`).join(", ");
  const cityLead = topCities.slice(0, 3).map((x) => `${x.city} (${x.count})`).join(", ");
  const brewLead = topBreweries.slice(0, 3).map((b) => `${b.name} — ${b.reach} ${plur(b.reach, "магазин", "магазина", "магазинов")}`).join("; ");
  const verifiedPct = c.beers ? Math.round((c.verified / c.beers) * 100) : 0;
  return [
    `## Срез каталога`,
    `В базе **${c.breweries} ${plur(c.breweries, "пивоварня", "пивоварни", "пивоварен")}** и **${c.beers} ${plur(c.beers, "сорт", "сорта", "сортов")}** из **${c.cities} ${plur(c.cities, "города", "городов", "городов")}**. Палитра стилей смещена к ${top3}.`,
    ``,
    `## География`,
    `Больше всего пивоварен в каталоге дают ${cityLead}. Всего охвачено ${c.cities} ${plur(c.cities, "город", "города", "городов")}.`,
    ``,
    `## Дистрибуция`,
    `Рыночный сигнал — в скольких магазинах встречается марка. По охвату лидируют ${brewLead}. Сейчас **${c.beersWithDemand}** ${plur(c.beersWithDemand, "сорт найден", "сорта найдены", "сортов найдено")} в продаже, из них **${c.deals}** со скидкой.`,
    ``,
    `## Провенанс`,
    `**${verifiedPct}%** сортов (${c.verified}) подтверждены официальным каналом пивоварни; ещё ${c.shopOnly} встречаются только у продавцов — это рабочая очередь на сверку с пивоварней.`,
  ].join("\n");
}

// Прозу пишет агент Claude Code (скилл meta-digest) в data/digest-prose.md. Если файла нет —
// fallback на детерминированный шаблон, чтобы дайджест существовал даже до прохода агента.
let prose: string;
let mode: "prose-file" | "template";
if (existsSync(PROSE_FILE)) {
  prose = readFileSync(PROSE_FILE, "utf8").trim();
  mode = "prose-file";
} else {
  prose = templateProse();
  mode = "template";
}

const digest = { generatedAt: snap.generatedAt, mode, facts, prose };
await Bun.write(OUT, JSON.stringify(digest, null, 2));
console.log(`digest → ${OUT}  (mode=${mode}, ${prose.length} симв.)`);
console.log(`facts: breweries=${facts.counts.breweries} beers=${facts.counts.beers} cities=${facts.counts.cities} deals=${facts.counts.deals}`);
