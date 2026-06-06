#!/usr/bin/env bun
// Отправка сообщения с КНОПКАМИ через Bot API (sendMessage + reply_markup). Только через beerlog
// (allowlist). Снимает потолок UX бота: выбор кандидата/точки и ссылки на карту кнопками, а не «напиши номер».
//
// ВАЖНО про совместимость с channel-плагином: callback от inline-кнопок (callback_data) приходит
// как callback_query — форк-плагин его НЕ передаёт агенту (как и геолокацию). Поэтому поддержаны
// ТОЛЬКО два типа кнопок, которые реально доходят/работают:
//   • reply-buttons — ReplyKeyboardMarkup: нажатие шлёт ТЕКСТ кнопки боту обычным сообщением →
//     агент получит его как <channel> текст и перевызовет нужный скрипт (выбор сорта/точки/да-нет).
//   • url-buttons   — InlineKeyboardMarkup с url: открывает ссылку (карта/сорт), агенту ничего не нужно.
// callback_data НЕ поддержан намеренно (бесполезен без callback-handler в плагине).
//
//   bun run scripts/beerlog.ts buttons --chat 123456789 --thread 504107 \
//     --text "Какую из них?" --reply-buttons '["Атомная Прачечная NEIPA","Атомная Прачечная Lager"]'
//   bun run scripts/beerlog.ts buttons --chat <id> --text "Hophead" --url-buttons '[{"text":"🗺 Карта","url":"https://…"}]'
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

const chat = flag("chat");
const thread = flag("thread");
const text = flag("text");
const replyTo = flag("reply-to");
const replyButtonsRaw = flag("reply-buttons");
const urlButtonsRaw = flag("url-buttons");
if (!chat || !text || (!replyButtonsRaw && !urlButtonsRaw)) {
  console.error('usage: beerlog buttons --chat <id> --text <text> (--reply-buttons \'["A","B"]\' | --url-buttons \'[{"text","url"}]\') [--thread <id>] [--reply-to <id>]');
  process.exit(1);
}

const envPath = resolve(import.meta.dir, "..", ".env");
const tokenMatch = existsSync(envPath) ? readFileSync(envPath, "utf8").match(/^BOT_TOKEN=(.*)$/m) : null;
const TOKEN = tokenMatch?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!TOKEN) { console.error("tg-buttons: BOT_TOKEN не найден в .env"); process.exit(1); }

// разложить плоский массив строк по одной кнопке в ряд; принять и готовые ряды [["A","B"],["C"]].
function rows<T>(raw: string, label: string): T[][] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { console.error(`tg-buttons: ${label}: невалидный JSON`); process.exit(1); }
  if (!Array.isArray(parsed) || !parsed.length) { console.error(`tg-buttons: ${label}: ожидается непустой массив`); process.exit(1); }
  return (parsed as unknown[]).map((el) => (Array.isArray(el) ? el : [el])) as T[][];
}

let reply_markup: Record<string, unknown>;
if (urlButtonsRaw) {
  // inline url-кнопки: [{text,url}] → [[{text,url}]]
  const r = rows<{ text: string; url: string }>(urlButtonsRaw, "url-buttons");
  reply_markup = { inline_keyboard: r.map((row) => row.map((b) => ({ text: b.text, url: b.url }))) };
} else {
  // reply-keyboard: строки → кнопки, нажатие возвращает текст. one_time + resize + selective.
  const r = rows<string>(replyButtonsRaw!, "reply-buttons");
  reply_markup = {
    keyboard: r.map((row) => row.map((b) => ({ text: String(b) }))),
    one_time_keyboard: true, resize_keyboard: true, selective: true,
  };
}

const body: Record<string, unknown> = { chat_id: chat, text, reply_markup };
if (thread) body.message_thread_id = Number(thread);
if (replyTo) body.reply_parameters = { message_id: Number(replyTo) };

const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const data = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
if (!data.ok) { console.error("tg-buttons: sendMessage failed —", data.description ?? res.status); process.exit(1); }
console.log(JSON.stringify({ ok: true, message_id: data.result?.message_id }));
