// Ингест сортов из агентного извлечения (data/ingest/sorts-<date>/g*.json) в каталог +
// генерация ingest-hints.json для инкрементальных проходов (task-13, «вглубь»).
//
// Хинты = по каждой пивоварне с офиц. каналом: как наполняли (канал, метод, дата,
// сколько постов/сортов, newest/oldest post id, статус). Следующий проход читает
// newestId и забирает только посты новее → инкрементальное обновление.
//
// Запуск: bun run scripts/ingest-sorts.ts [dir]   (dir по умолч. data/ingest/sorts-2026-05-29)
import { openDb, upsertBeer, stats } from "@beer-log/store";
import { categorizeStyle } from "@beer-log/catalog-core";

const DIR = process.argv[2] ?? "data/ingest/sorts-2026-05-29";
const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const CHANNELS = "/tmp/bl-deep/channels.json"; // метаданные сбора (опц., из этого прохода)
// дата прохода: из имени папки (sorts-YYYY-MM-DD) либо сегодня
const seenAt = DIR.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? new Date().toISOString().slice(0, 10);

type Sort = { name: string; styleRaw: string; category: string; abv?: number | null; ibu?: number | null; description?: string };

// слить все группы g*.json в один объект slug -> Sort[]
const bySlug: Record<string, Sort[]> = {};
for (let i = 1; i <= 12; i++) {
  const f = `${DIR}/g${i}.json`;
  if (!(await Bun.file(f).exists())) continue;
  const part: Record<string, Sort[]> = JSON.parse(await Bun.file(f).text());
  for (const [slug, sorts] of Object.entries(part)) bySlug[slug] = [...(bySlug[slug] ?? []), ...sorts];
}

// метаданные каналов этого прохода (если есть)
type Chan = { handle: string; channelUrl: string; pages: number; messagesSeen: number; newestId: number | null; oldestId: number | null; status: string };
let channels: Record<string, Chan> = {};
if (await Bun.file(CHANNELS).exists()) {
  const raw = JSON.parse(await Bun.file(CHANNELS).text());
  channels = Object.fromEntries(
    Object.entries(raw).map(([slug, c]: [string, any]) => [slug, {
      handle: c.handle, channelUrl: c.channelUrl, pages: c.pages, messagesSeen: c.messagesSeen,
      newestId: c.newestId, oldestId: c.oldestId, status: c.status,
    }]),
  );
}

const db = openDb(DB_PATH);
// прежние хинты — чтобы не затереть данные из других источников (напр. блок `untappd`,
// см. scripts/ingest-untappd.ts) при перегенерации TG-хинтов.
const prevHints: Record<string, any> = (await Bun.file("data/ingest-hints.json").exists())
  ? (JSON.parse(await Bun.file("data/ingest-hints.json").text()).breweries ?? {})
  : {};
const hints: Record<string, unknown> = {};
let total = 0;

// все пивоварни с каналом этого прохода + те, у кого извлекли сорта + ранее известные
// (чтобы не выкинуть из хинтов пивоварни из других источников, напр. untappd-only)
const slugs = new Set<string>([...Object.keys(prevHints), ...Object.keys(channels), ...Object.keys(bySlug)]);
for (const slug of slugs) {
  const row = db.query("SELECT id, name FROM breweries WHERE slug = ?").get(slug) as { id: string; name: string } | null;
  const sorts = bySlug[slug] ?? [];
  let ingested = 0;
  if (row) {
    const url = channels[slug]?.channelUrl ?? null;
    for (const s of sorts) {
      const st = categorizeStyle(s.styleRaw);
      const category = st.category !== "unknown" ? st.category : (s.category as typeof st.category);
      upsertBeer(db, {
        name: s.name, breweryId: row.id, breweryNameRaw: row.name,
        abv: s.abv ?? undefined, ibu: s.ibu ?? undefined, status: "validated",
        style: { slug: st.slug, name: s.styleRaw, category },
        source: url ? { url, excerpt: s.description, seenAt } : undefined,
      });
      ingested++;
    }
  }
  total += ingested;

  const c = channels[slug];
  const prev = prevHints[slug] ?? {};
  hints[slug] = {
    brewery: row?.name ?? slug,
    channel: c?.handle ?? prev.channel ?? null,
    channelUrl: c?.channelUrl ?? prev.channelUrl ?? null,
    method: "tg-web-preview (t.me/s) + agentic-extract",
    lastRun: seenAt,
    pages: c?.pages ?? null,
    messagesSeen: c?.messagesSeen ?? null,
    newestId: c?.newestId ?? prev.newestId ?? null,   // для инкрементального прохода: брать посты новее
    oldestId: c?.oldestId ?? null,   // докуда дочитали назад в этом проходе
    sortsIngested: ingested,
    status: c?.status ?? (row ? "ok" : "no-brewery"),
    // сохраняем блок другого источника (untappd) и его пояснение, если он был
    ...(prev.untappd ? { untappd: prev.untappd } : {}),
    note: prev.untappd
      ? prev.note
      : c?.status === "no-feed" ? "0 текст. сообщений через t.me/s — медиа-посты/иная разметка (дрейф); нужен caption/VK" : undefined,
  };
}

await Bun.write("data/ingest-hints.json", JSON.stringify({ generatedAt: seenAt, breweries: hints }, null, 2));

console.log("Сортов заингещено:", total, "| пивоварен в хинтах:", Object.keys(hints).length);
console.log("STATS:", JSON.stringify(stats(db)));
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
