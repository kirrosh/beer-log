// Pending-дегустации (TASK-55): «беру/пробую X» сегодня → бот сам спросит вердикт завтра.
// Память бота = живая сессия (Telegram MCP историю не хранит), поэтому очередь вопросов живёт
// в файле, а не в голове агента — переживает компактизацию/рестарт/дни без сообщений.
//
//   addPending({ beerId, beer: "Jaws Атомная Прачечная", venue: "hophead", chat: "283…", thread: "504…" });
//   ripePendings();          // что созрело спросить (создано вчера и раньше, сегодня ещё не спрашивали)
//   markAsked(id);           // вопрос отправлен — не переспрашивать до завтра
//   closePending(id);        // ответ записан (или явный отказ) — больше не достаём
//   archiveStale();          // молча архивирует протухшие (>7 дней без ответа)
//
// НЕ источник правды (им остаётся tastings.json) — рабочая очередь, gitignored, как .bot-context.json.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

export type PendingStatus = "pending" | "asked" | "closed" | "stale";
export type PendingTasting = {
  id: string;
  beerId: string | null;
  beer: string;
  venue?: string;
  chat: string;            // куда задавать вопрос (chat_id, опц. вкладка-thread)
  thread?: string;
  createdAt: string;       // ISO datetime фиксации «беру»
  askedAt?: string;        // ISO datetime последнего заданного вопроса
  status: PendingStatus;
};

const FILE = (dir: string) => `${dir}/.pending-tastings.json`;
const STALE_AFTER_DAYS = 7;    // >7 дней без ответа → молча в архив (AC #4)
const KEEP_CLOSED_DAYS = 30;   // закрытые/протухшие чистим из файла спустя месяц

const DEFAULT_DIR = "data/personal";

const dayOf = (iso: string) => iso.slice(0, 10);
const daysBetween = (fromIso: string, now: Date) =>
  Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
    new Date(dayOf(fromIso) + "T00:00:00Z").getTime()) / 86_400_000);

function load(dir: string): PendingTasting[] {
  const path = FILE(dir);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as PendingTasting[]) : [];
  } catch { return []; }
}

function save(dir: string, items: PendingTasting[], now: Date): void {
  // попутно чистим давно закрытое/архивное, чтобы файл не рос бесконечно
  const kept = items.filter((p) =>
    (p.status !== "closed" && p.status !== "stale") || daysBetween(p.createdAt, now) <= KEEP_CLOSED_DAYS);
  writeFileSync(FILE(dir), JSON.stringify(kept, null, 2) + "\n");
}

const newId = () => "pt_" + crypto.randomUUID().replaceAll("-", "").slice(0, 8);

/** Зафиксировать «беру/пробую» (AC #1). Открытый дубль (тот же сорт в том же чате/вкладке) не плодим. */
export function addPending(
  p: { beerId?: string | null; beer: string; venue?: string; chat: string; thread?: string },
  dir = DEFAULT_DIR,
  now = new Date(),
): { record: PendingTasting; action: "added" | "exists" } {
  const items = load(dir);
  const norm = (s: string) => s.trim().toLowerCase();
  const dup = items.find((x) =>
    (x.status === "pending" || x.status === "asked") &&
    x.chat === p.chat && (x.thread ?? "") === (p.thread ?? "") &&
    ((p.beerId && x.beerId === p.beerId) || norm(x.beer) === norm(p.beer)));
  if (dup) return { record: dup, action: "exists" };
  const record: PendingTasting = {
    id: newId(),
    beerId: p.beerId ?? null,
    beer: p.beer.trim(),
    venue: p.venue,
    chat: p.chat,
    thread: p.thread,
    createdAt: now.toISOString(),
    status: "pending",
  };
  items.push(record);
  save(dir, items, now);
  return { record, action: "added" };
}

/** Все записи (для list/отладки). */
export function listPendings(dir = DEFAULT_DIR): PendingTasting[] {
  return load(dir);
}

/** Созревшие спросить (AC #2): создано вчера и раньше, открыто, сегодня ещё не спрашивали. */
export function ripePendings(dir = DEFAULT_DIR, now = new Date()): PendingTasting[] {
  return load(dir).filter((p) =>
    (p.status === "pending" || p.status === "asked") &&
    daysBetween(p.createdAt, now) >= 1 &&
    daysBetween(p.createdAt, now) <= STALE_AFTER_DAYS &&
    (!p.askedAt || daysBetween(p.askedAt, now) >= 1));
}

/** Пометить «вопрос отправлен» — до завтра не переспрашиваем. */
export function markAsked(id: string, dir = DEFAULT_DIR, now = new Date()): boolean {
  const items = load(dir);
  const p = items.find((x) => x.id === id);
  if (!p) return false;
  p.askedAt = now.toISOString();
  p.status = "asked";
  save(dir, items, now);
  return true;
}

/** Закрыть после записи дегустации или явного отказа (AC #4) — больше не достаётся. */
export function closePending(id: string, dir = DEFAULT_DIR, now = new Date()): PendingTasting | null {
  const items = load(dir);
  const p = items.find((x) => x.id === id);
  if (!p) return null;
  p.status = "closed";
  save(dir, items, now);
  return p;
}

/** Молча архивировать протухшие (>7 дней без ответа, AC #4). Возвращает сколько ушло в архив. */
export function archiveStale(dir = DEFAULT_DIR, now = new Date()): number {
  const items = load(dir);
  let n = 0;
  for (const p of items) {
    if ((p.status === "pending" || p.status === "asked") && daysBetween(p.createdAt, now) > STALE_AFTER_DAYS) {
      p.status = "stale";
      n++;
    }
  }
  if (n) save(dir, items, now);
  return n;
}
