// Эфемерный контекст диалога бота (TASK-46): «последний сорт, который агент показал пользователю»,
// по chat_id. Нужен, потому что Telegram Bot API НЕ хранит историю, а память агента = контекст живой
// сессии: при компактизации/рестарте точный beerId теряется. Связка «фото банки → (через час)
// "о, зашло!"» опирается на этот файл, а не на то, что разговор уцелел в контексте.
//
//   setLastBeer("123", { beerId: "be_c0bfcf95", beer: "Jaws Атомная Прачечная", venue: "..." });
//   const ctx = getLastBeer("123");   // null, если пусто или протухло (TTL)
//
// НЕ источник правды (в отличие от tastings.json) — короткоживущее состояние, gitignored. Пишет его
// АГЕНТ только когда сорт ОДНОЗНАЧНО установлен (фото = конкретная банка, или уточнённый лукап) —
// не bot-lookup автоматически, чтобы не закрепить неверный вариант.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

export type ChatBeerContext = { beerId: string | null; beer: string; venue?: string; ts: number };
type Store = Record<string, ChatBeerContext>;

const FILE = (dir: string) => `${dir}/.bot-context.json`;
const TTL_MS = 12 * 60 * 60 * 1000; // 12ч: «попробовал» спустя полдня ещё привяжется, через сутки — нет

// Ключ записи. С вкладками (forum topics) один chat_id содержит несколько вкладок-репозиториев
// (TASK: tab-router) — разводим контекст по message_thread_id. Без thread (General/старые файлы)
// ключ = голый chatId → обратная совместимость с уже записанными контекстами.
const keyOf = (chatId: string, thread?: string) =>
  thread ? `${chatId}#${thread}` : chatId;

function load(dir: string): Store {
  const path = FILE(dir);
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, "utf8")) as Store; }
  catch { return {}; }
}

function save(dir: string, store: Store): void {
  // попутно вычищаем протухшие записи всех чатов
  const now = Date.now();
  for (const [k, v] of Object.entries(store)) {
    if (!v || now - v.ts > TTL_MS) delete store[k];
  }
  writeFileSync(FILE(dir), JSON.stringify(store, null, 2) + "\n");
}

/** Запомнить последний показанный сорт для чата (опц. вкладки/thread). */
export function setLastBeer(
  chatId: string,
  ctx: { beerId: string | null; beer: string; venue?: string },
  dir = "data/personal",
  thread?: string,
): void {
  const store = load(dir);
  store[keyOf(chatId, thread)] = { ...ctx, ts: Date.now() };
  save(dir, store);
}

/** Последний показанный сорт (null, если нет/протух). */
export function getLastBeer(
  chatId: string,
  dir = "data/personal",
  thread?: string,
): ChatBeerContext | null {
  const ctx = load(dir)[keyOf(chatId, thread)];
  if (!ctx) return null;
  if (Date.now() - ctx.ts > TTL_MS) return null;
  return ctx;
}

/** Забыть контекст чата/вкладки (напр. после записи дегустации или смены темы). */
export function clearChat(chatId: string, dir = "data/personal", thread?: string): void {
  const store = load(dir);
  const key = keyOf(chatId, thread);
  if (key in store) { delete store[key]; save(dir, store); }
}
