#!/usr/bin/env bun
// Отправка сообщения с КНОПКАМИ через Bot API (sendMessage + reply_markup). Только через beerlog
// (allowlist). Снимает потолок UX бота: выбор кандидата/точки и ссылки на карту кнопками, а не «напиши номер».
//
// Совместимость с channel-плагином: форк tg-tabs реле́ит в сессию агента не-perm callback_query
// (meta.callback_data, см. relayCallback) и message.location (meta.lat/lng, см. message:location).
// Поэтому поддержаны ЧЕТЫРЕ типа кнопок:
//   • location-button  — reply-keyboard с request_location: нажатие шлёт боту геопозицию → форк кладёт
//     lat/lng в meta, агент зовёт `nearby --lat --lng` (гео-радиус «куда пойти рядом», TASK-42).
//   • callback-buttons — InlineKeyboardMarkup с callback_data: нажатие НЕ пишет текст в чат, агент
//     получает <channel> с meta.callback_data=<токен> и сопоставляет с черновиком в bot-context
//     (подтверждение ✅/✏️/❌ без замусоривания чата). callback_data ≤64 байт — только короткий токен.
//   • reply-buttons    — ReplyKeyboardMarkup: нажатие шлёт ТЕКСТ кнопки боту обычным сообщением →
//     агент получит его как <channel> текст и перевызовет нужный скрипт (выбор сорта/точки/да-нет).
//   • url-buttons      — InlineKeyboardMarkup с url: открывает ссылку (карта/сорт), агенту ничего не нужно.
//
//   bun run scripts/beerlog.ts buttons --chat 123456789 --thread 504107 \
//     --text "Холодильник верно?" --callback-buttons '[{"text":"✅ Верно","data":"shelf:ok"},{"text":"✏️ Поправить","data":"shelf:edit"},{"text":"❌ Нет","data":"shelf:no"}]'
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
const callbackButtonsRaw = flag("callback-buttons");
const locationButton = flag("location-button"); // текст кнопки «поделиться геопозицией» (request_location)
if (!chat || !text || (!replyButtonsRaw && !urlButtonsRaw && !callbackButtonsRaw && !locationButton)) {
  console.error('usage: beerlog buttons --chat <id> --text <text> (--callback-buttons \'[{"text","data"}]\' | --reply-buttons \'["A","B"]\' | --url-buttons \'[{"text","url"}]\' | --location-button "📍 текст") [--thread <id>] [--reply-to <id>]');
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
if (locationButton) {
  // reply-keyboard с request_location: нажатие шлёт боту message.location → форк реле́ит lat/lng
  // в meta (см. message:location в server.ts), агент зовёт `nearby --lat --lng` для радиуса.
  reply_markup = {
    keyboard: [[{ text: locationButton, request_location: true }]],
    one_time_keyboard: true, resize_keyboard: true, selective: true,
  };
} else if (callbackButtonsRaw) {
  // inline callback-кнопки: [{text,data}] → [[{text,callback_data}]]. callback_data ≤64 байт;
  // нажатие реле́ится агенту через форк (meta.callback_data), текст в чат не пишется.
  const r = rows<{ text: string; data: string }>(callbackButtonsRaw, "callback-buttons");
  for (const b of r.flat()) {
    if (!b || typeof b.text !== "string" || typeof b.data !== "string") {
      console.error('tg-buttons: callback-buttons: каждый элемент = {"text":"…","data":"…"}'); process.exit(1);
    }
    if (Buffer.byteLength(b.data, "utf8") > 64) {
      console.error(`tg-buttons: callback-buttons: data "${b.data}" > 64 байт (лимит Telegram)`); process.exit(1);
    }
  }
  reply_markup = { inline_keyboard: r.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) };
} else if (urlButtonsRaw) {
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
