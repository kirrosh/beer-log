// Инкрементальный фетч офиц. TG-каналов пивоварен (task-13, проход «вглубь»/обновление).
// Читает data/ingest-hints.json → по каждому каналу берёт ТОЛЬКО посты новее newestId
// (листает t.me/s/<handle>?before=… пока не дойдёт до прошлого newestId). Пишет на диск
// сырьё для агентного извлечения + свежие метаданные канала.
//
//   bun run scripts/fetch-channels.ts            # инкрементально (только новые посты)
//   FULL=1 bun run scripts/fetch-channels.ts     # полный проход (2 страницы, игнор newestId)
//
// Выход: /tmp/bl-deep/ch-<slug>.json  (slug,name,handle,messages — только новые)
//        /tmp/bl-deep/channels.json   (метаданные: handle,channelUrl,pages,messagesSeen,newestId,oldestId,status)
// Дальше: спавнить агентов-экстракторов по каналам с messagesSeen>0 (см. data/ingest/RUNBOOK.md),
// сложить их JSON в data/ingest/sorts-<YYYY-MM-DD>/g*.json и прогнать scripts/ingest-sorts.ts.
import { parseChannelHtml } from "@beer-log/parsers";

const FULL = !!process.env.FULL;
const UA = { "User-Agent": "Mozilla/5.0 (compatible; beer-log/0.1)" };
const HINTS = "data/ingest-hints.json";
const MAX_PAGES = 8; // предохранитель от бесконечного листания

const hints = JSON.parse(await Bun.file(HINTS).text()).breweries as Record<
  string, {
    brewery: string; channel: string | null; channelUrl: string | null; newestId: number | null;
    sortsIngested?: number | null; status?: string; untappd?: unknown;
  }
>;

const idsOf = (html: string, h: string): number[] => {
  const re = new RegExp(`data-post="[^"/]*${h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(\\d+)"`, "gi");
  return [...html.matchAll(re)].map((m) => +m[1]!);
};
const fetchPage = async (h: string, before?: number) => {
  const url = `https://t.me/s/${h}${before ? `?before=${before}` : ""}`;
  const res = await fetch(url, { headers: UA });
  const html = await res.text();
  return { msgs: parseChannelHtml(html), ids: idsOf(html, h) };
};

await Bun.$`mkdir -p /tmp/bl-deep`.quiet();
const out: Record<string, unknown> = {};

for (const [slug, h] of Object.entries(hints)) {
  const handle = (h.channel ?? "").replace(/^@/, "");
  if (!handle) continue;
  // Канал с newestId, но БЕЗ единого извлечённого сорта (sortsIngested 0/нет) — никогда успешно
  // не обрабатывался: его ассортимент лежит в истории ЗА newestId, и инкремент его не увидит
  // никогда (застрял бы навсегда). Для таких — полный back-scan, игнорируя newestId. Но НЕ для
  // уже признанных мёртвыми (no-feed) или закрытых через другой источник (untappd) — их не дёргаем.
  const neverIngested = !h.sortsIngested && h.status !== "no-feed" && !h.untappd;
  const since = FULL || neverIngested ? null : h.newestId; // инкремент: посты с id > since
  try {
    const collected: string[] = [];
    const allIds: number[] = [];
    let pages = 0;
    let before: number | undefined;
    while (pages < (FULL ? 2 : MAX_PAGES)) {
      const { msgs, ids } = await fetchPage(handle, before);
      pages++;
      if (!msgs.length) break;
      // оставляем только новые (если инкремент); порядок на странице — старые→новые
      const fresh = since ? msgs.filter((_, i) => (ids[i] ?? 0) > since) : msgs;
      collected.unshift(...fresh); // более старые страницы идут впереди
      allIds.push(...ids);
      const minId = Math.min(...ids);
      if (since && minId <= since) break; // дошли до прошлого newestId — дальше всё видели
      if (!since && pages >= 2) break;    // полный режим: 2 страницы
      before = minId;
    }
    const status = allIds.length ? "ok" : "no-feed";
    out[slug] = {
      slug, name: h.brewery, handle: "@" + handle, channelUrl: "https://t.me/" + handle,
      messages: collected, messagesSeen: collected.length, pages,
      newestId: allIds.length ? Math.max(...allIds) : h.newestId,
      oldestId: allIds.length ? Math.min(...allIds) : null, status,
    };
    if (collected.length) await Bun.write(`/tmp/bl-deep/ch-${slug}.json`, JSON.stringify({ slug, name: h.brewery, handle: "@" + handle, messages: collected }, null, 1));
    console.log(`@${handle}: новых постов ${collected.length} | newestId ${out[slug] && (out[slug] as any).newestId} | ${status}`);
  } catch (e) {
    out[slug] = { slug, name: h.brewery, handle: "@" + handle, channelUrl: "https://t.me/" + handle, messages: [], messagesSeen: 0, status: "error", error: String(e) };
    console.log(`@${handle}: ERR ${e}`);
  }
}

await Bun.write("/tmp/bl-deep/channels.json", JSON.stringify(out, null, 1));
const withNew = Object.values(out).filter((c: any) => c.messagesSeen > 0).length;
console.log(`\nКаналов с новыми постами: ${withNew} из ${Object.keys(out).length}. Дальше — агентное извлечение по ним (см. data/ingest/RUNBOOK.md).`);
