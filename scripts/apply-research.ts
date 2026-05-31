// Обвязка breadth-конвейера: применяет результаты brewery-research, собранные субагентами в
// файлы data/.secrets/research/<slug>.json (главный контекст их не видит — субагент пишет файл,
// возвращает лишь "done"). Применяет ПОСЛЕДОВАТЕЛЬНО (sqlite single-writer): upsertBrewery с
// найденными links/городом (canonicalName — чистое имя из ресёрча затирает грязный сид-нейм),
// blocked → overrides.json. Печатает список slug'ов с верифицированным Untappd и пишет его в
// data/.secrets/research/_pull.txt — отсюда последовательный ingest-untappd.ts добирает сорта.
//
//   bun run scripts/apply-research.ts          # применить всё из research/
//   bun run scripts/apply-research.ts --keep    # не удалять *.json после применения
import { openDb, upsertBrewery } from "@beer-log/store";

const DIR = "data/.secrets/research";
const OVERRIDES = "data/pipeline/overrides.json";
const PULL_LIST = `${DIR}/_pull.txt`;
const keep = process.argv.includes("--keep");

type Research = {
  slug: string; name?: string; city?: string | null;
  untappdBeerListUrl?: string | null; tgHandle?: string | null;
  links?: { kind: string; url: string | null; verified?: boolean }[];
  blocked?: string | null;
};

const { readdirSync, readFileSync, rmSync } = await import("node:fs");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
if (files.length === 0) { console.log("нет research/*.json — нечего применять"); process.exit(0); }

const db = openDb(DB());
function DB() { return process.env.DB_PATH ?? "data/catalog.sqlite"; }
const overrides = JSON.parse(await Bun.file(OVERRIDES).text()) as { breweries: Record<string, any> };

const pullSlugs: string[] = [];
let applied = 0, blocked = 0;
for (const f of files) {
  let r: Research;
  try { r = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")); } catch { console.log(`! битый JSON: ${f}`); continue; }
  if (!r.slug) { console.log(`! нет slug: ${f}`); continue; }

  if (r.blocked) {
    overrides.breweries[r.slug] = { ...(overrides.breweries[r.slug] ?? {}), blocked: r.blocked, blockedAt: "2026-05-31" };
    blocked++;
    console.log(`  blocked ${r.slug}: ${r.blocked.slice(0, 70)}`);
    continue;
  }

  const links = (r.links ?? []).filter((l) => l && l.url).map((l) => ({ kind: l.kind, url: l.url! }));
  upsertBrewery(db, {
    name: r.name || r.slug,
    slug: r.slug,
    city: r.city ?? undefined,
    canonicalName: Boolean(r.name),
    links,
  });
  applied++;
  if (links.some((l) => l.kind === "untappd")) pullSlugs.push(r.slug);
}

db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
await Bun.write(OVERRIDES, JSON.stringify(overrides, null, 2));
await Bun.write(PULL_LIST, pullSlugs.join("\n"));

console.log(`\nприменено: ${applied} | blocked: ${blocked} | с Untappd (на pull): ${pullSlugs.length}`);
console.log(`pull-список → ${PULL_LIST}:\n  ${pullSlugs.join(" ") || "—"}`);
console.log(`\nдалее (последовательно, анти-бан):\n  bun run scripts/extract-untappd-cookie.ts && bun run scripts/ingest-untappd.ts $(cat ${PULL_LIST})`);
if (!keep) for (const f of files) rmSync(`${DIR}/${f}`);
