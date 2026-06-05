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

/** Запомнить последний показанный сорт для чата. */
export function setLastBeer(
  chatId: string,
  ctx: { beerId: string | null; beer: string; venue?: string },
  dir = "data/personal",
): void {
  const store = load(dir);
  store[chatId] = { ...ctx, ts: Date.now() };
  save(dir, store);
}

/** Последний показанный сорт (null, если нет/протух). */
export function getLastBeer(chatId: string, dir = "data/personal"): ChatBeerContext | null {
  const ctx = load(dir)[chatId];
  if (!ctx) return null;
  if (Date.now() - ctx.ts > TTL_MS) return null;
  return ctx;
}

/** Забыть контекст чата (напр. после записи дегустации или смены темы). */
export function clearChat(chatId: string, dir = "data/personal"): void {
  const store = load(dir);
  if (chatId in store) { delete store[chatId]; save(dir, store); }
}
