// Liveness-проба источников пивоварен (task-24 #1): дёшево проверяет, живы ли ссылки в
// breweries.links (telegram/untappd/website/vk) — HTTP-статус, редирект, пустой каталог.
// Пишет отчёт в ingest-hints[slug].liveness; если ВСЕ ingestable-источники (telegram/untappd)
// протухли → pipeline-status сам ставит пивоварню в очередь brewery-research (ветка deadIngestable).
// НЕ агент: чистый HTTP + grep. Запускается периодически (pipeline-run/вручную), не на каждый виток.
//
//   bun run scripts/check-liveness.ts                 # активные пивоварни (есть сорта, не blocked)
//   bun run scripts/check-liveness.ts salden-s konix-brewery   # только указанные
//   LIVENESS_ALL=1 bun run scripts/check-liveness.ts  # включая blocked (диагностика)
import { Database } from "bun:sqlite";
import { classifyUntappdBeerListUrl } from "@beer-log/parsers";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const HINTS = "data/ingest-hints.json";
const today = new Date().toISOString().slice(0, 10);
const UA = { "User-Agent": "Mozilla/5.0 (compatible; beer-log-liveness/0.1)" };
const CONCURRENCY = 6;

const db = new Database(DB_PATH, { readonly: true });
type Row = { slug: string; name: string; links: string; total: number };
const rows = db.query(
  `SELECT b.slug, b.name, b.links,
     (SELECT COUNT(*) FROM beers be WHERE be.brewery_id = b.id) total
   FROM breweries b ORDER BY b.name`,
).all() as Row[];
db.close();

const hintsFile = JSON.parse(await Bun.file(HINTS).text()) as {
  generatedAt?: string; breweries: Record<string, any>;
};
const overrides = (await Bun.file("data/pipeline/overrides.json").exists())
  ? JSON.parse(await Bun.file("data/pipeline/overrides.json").text())
  : { breweries: {} };

const args = process.argv.slice(2);
const all = !!process.env.LIVENESS_ALL;
let targets = rows;
if (args.length) targets = rows.filter((r) => args.includes(r.slug));
else if (!all) targets = rows.filter((r) => r.total > 0 && !overrides.breweries?.[r.slug]?.blocked);

// статусы: ok | redirect | dead | empty | private | unparseable
async function probe(kind: string, url: string): Promise<string> {
  try {
    if (kind === "untappd") {
      if (!classifyUntappdBeerListUrl(url).ok) return "unparseable";
      // ссылка может храниться как .../Handle или уже .../Handle/beer — нормализуем к одному /beer
      const beerUrl = url.replace(/\/beer\/?$/, "").replace(/\/+$/, "") + "/beer";
      const res = await fetch(beerUrl, { headers: UA, redirect: "manual" });
      if (res.status === 404) return "dead";
      if (res.status >= 300 && res.status < 400) return "redirect";
      if (!res.ok) return "dead";
      const html = await res.text();
      // пустой каталог (кейс victory-art-brew, task-16): «0 Beers» в шапке без карточек
      if (/\b0\s+Beers?\b/i.test(html) && !/beer-item/.test(html)) return "empty";
      return "ok";
    }
    if (kind === "telegram") {
      if (/\/(\+|joinchat)/.test(url)) return "private";
      const handle = url.match(/t\.me\/(?:s\/)?@?([\w\d_]+)/)?.[1];
      if (!handle) return "private";
      const res = await fetch(`https://t.me/s/${handle}`, { headers: UA });
      if (!res.ok) return "dead";
      const html = await res.text();
      return /tgme_widget_message/.test(html) ? "ok" : "empty"; // empty = веб-превью закрыто
    }
    // website / vk — общий HTTP (информационно: они не ingestable, на маршрутизацию не влияют)
    const res = await fetch(url, { headers: UA, redirect: "manual" });
    if (res.status === 404 || res.status >= 500) return "dead";
    if (res.status >= 300 && res.status < 400) return "redirect";
    return "ok";
  } catch {
    return "dead";
  }
}

async function checkBrewery(r: Row): Promise<{ slug: string; sources: Record<string, string>; flag: boolean }> {
  const links = JSON.parse(r.links || "[]") as { kind: string; url?: string }[];
  const sources: Record<string, string> = {};
  for (const l of links) {
    if (!l.url || !["telegram", "untappd", "website", "vk"].includes(l.kind)) continue;
    sources[l.kind] = await probe(l.kind, l.url);
  }
  // ingestable протух, если ВСЕ из {telegram,untappd} непригодны (dead/empty/private/unparseable)
  const ingestable = ["telegram", "untappd"].filter((k) => k in sources);
  const unusable = (s?: string) => !!s && ["dead", "empty", "private", "unparseable"].includes(s);
  const flag = ingestable.length > 0 && ingestable.every((k) => unusable(sources[k]));
  return { slug: r.slug, sources, flag };
}

// батчами по CONCURRENCY (вежливо к источникам)
const results: { slug: string; sources: Record<string, string>; flag: boolean }[] = [];
for (let i = 0; i < targets.length; i += CONCURRENCY) {
  const batch = targets.slice(i, i + CONCURRENCY);
  results.push(...(await Promise.all(batch.map(checkBrewery))));
}

let flagged = 0;
for (const res of results) {
  hintsFile.breweries[res.slug] ??= {};
  hintsFile.breweries[res.slug].liveness = { checkedAt: today, sources: res.sources };
  if (res.flag) {
    flagged++;
    console.log(`! ${res.slug}: все ingestable-источники протухли — ${
      Object.entries(res.sources).map(([k, v]) => `${k}=${v}`).join(", ")} → brewery-research`);
  }
}
await Bun.write(HINTS, JSON.stringify(hintsFile, null, 2));

const tally: Record<string, number> = {};
for (const res of results) for (const v of Object.values(res.sources)) tally[v] = (tally[v] ?? 0) + 1;
console.log(`\nПроверено пивоварен: ${results.length} | источников по статусам: ${JSON.stringify(tally)}`);
console.log(`Протухших (все ingestable мертвы → очередь brewery-research): ${flagged}`);
