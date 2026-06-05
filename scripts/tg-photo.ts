#!/usr/bin/env bun
// Отправка фото с подписью ОДНИМ медиа-сообщением (sendPhoto + caption), а не
// текст+картинка по отдельности. Для бота: обложка сорта + краткий ответ вместе.
// Вызов только через beerlog (allowlist).
//
//   bun run scripts/beerlog.ts photo --chat 123456789 --thread 504107 \
//     --image "https://…/cover.jpg" --caption "Да, есть! 🔥 …" [--reply-to <id>]
//
// --image: URL (скачаем сами и зальём multipart — надёжнее, чем отдавать URL Телеграму)
//          или локальный путь. BOT_TOKEN берём из .env репо.
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

const chat = flag("chat");
const image = flag("image");
const caption = flag("caption");
const thread = flag("thread");
const replyTo = flag("reply-to");
if (!chat || !image) {
  console.error('usage: beerlog photo --chat <id> --image <url|path> [--caption <text>] [--thread <id>] [--reply-to <id>]');
  process.exit(1);
}

// BOT_TOKEN из .env репо.
const envPath = resolve(import.meta.dir, "..", ".env");
const tokenMatch = existsSync(envPath) ? readFileSync(envPath, "utf8").match(/^BOT_TOKEN=(.*)$/m) : null;
const TOKEN = tokenMatch?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!TOKEN) {
  console.error("tg-photo: BOT_TOKEN не найден в .env");
  process.exit(1);
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Получаем байты картинки (скачиваем сами → не зависим от Telegram-фетча / хотлинк-защит).
let bytes: Uint8Array;
let filename = "cover.jpg";
try {
  if (/^https?:\/\//.test(image)) {
    const r = await fetch(image, { headers: { "User-Agent": UA, Referer: "https://yandex.ru/" } });
    if (!r.ok) throw new Error(`загрузка картинки: HTTP ${r.status}`);
    const ct = r.headers.get("content-type") ?? "";
    if (!/image\//.test(ct)) throw new Error(`не картинка (content-type: ${ct || "?"})`);
    bytes = new Uint8Array(await r.arrayBuffer());
    const ext = ct.split("/")[1]?.split(";")[0]?.replace(/[^a-z0-9]/gi, "") || "jpg";
    filename = `cover.${ext === "jpeg" ? "jpg" : ext}`;
  } else {
    const p = resolve(image);
    if (!existsSync(p) || !statSync(p).isFile()) throw new Error(`файл не найден: ${p}`);
    bytes = new Uint8Array(readFileSync(p));
    filename = p.split("/").pop() || filename;
  }
} catch (e) {
  console.error("tg-photo:", e instanceof Error ? e.message : String(e));
  process.exit(1);
}

// Telegram: caption ≤ 1024 символов.
const cap = caption && caption.length > 1024 ? caption.slice(0, 1021) + "…" : caption;

const fd = new FormData();
fd.append("chat_id", chat);
if (thread) fd.append("message_thread_id", thread);
if (cap) fd.append("caption", cap);
if (replyTo) fd.append("reply_parameters", JSON.stringify({ message_id: Number(replyTo) }));
fd.append("photo", new Blob([bytes]), filename);

const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, { method: "POST", body: fd });
const data = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
if (!data.ok) {
  console.error("tg-photo: sendPhoto failed —", data.description ?? res.status);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, message_id: data.result?.message_id }));
