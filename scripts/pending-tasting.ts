#!/usr/bin/env bun
// pending-tasting.ts — петля обратной связи (TASK-55): очередь «беру/пробую X» → бот сам
// спрашивает вердикт на следующий день. Очередь живёт в data/personal/.pending-tastings.json
// (lib/pending-tastings.ts), вопрос уходит напрямую через Bot API (sendMessage + callback-кнопки
// 🔥/👍/👎/«не пробовал» — реле callback_query в форке tg-tabs уже есть, см. tg-buttons.ts).
//
//   beerlog pending add --json '{"beer":"Jaws Атомная Прачечная","beerId":"be_…","venue":"hophead","chat":"283…","thread":"504…"}'
//   beerlog pending list
//   beerlog pending ask [--dry-run]     # созревшие → вопрос в TG-топик; триггер = cron раз в день
//   beerlog pending close --id pt_xxxxxxxx
//
// Перед отправкой ask ставит bot-context setLastBeer(chat, thread): голый ответ текстом («🔥»,
// «зашло») привяжется к сорту через существующий fromContext-путь record-tasting. Нажатие кнопки
// приходит агенту как meta.callback_data="fb:<id>:<verdict>" — флоу в SKILL beer-concierge, интент #5.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  addPending, listPendings, ripePendings, markAsked, closePending, archiveStale,
  type PendingTasting,
} from "./lib/pending-tastings.ts";
import { setLastBeer } from "./lib/bot-context.ts";

const argv = process.argv.slice(2);
const cmd = argv[0];

function flag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : undefined;
}
function out(o: unknown): never {
  console.log(JSON.stringify(o));
  process.exit(0);
}
function fail(message: string): never {
  console.log(JSON.stringify({ status: "error", message }));
  process.exit(1);
}

// ── отправка вопроса (Bot API, как tg-buttons.ts) ─────────────────────────────────
function botToken(): string {
  const envPath = resolve(import.meta.dir, "..", ".env");
  const m = existsSync(envPath) ? readFileSync(envPath, "utf8").match(/^BOT_TOKEN=(.*)$/m) : null;
  const token = m?.[1]?.trim().replace(/^["']|["']$/g, "");
  if (!token) fail("BOT_TOKEN не найден в .env");
  return token;
}

function questionText(p: PendingTasting, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(p.createdAt).getTime()) / 86_400_000);
  const when = days <= 1 ? "Вчера" : days === 2 ? "Позавчера" : `${p.createdAt.slice(0, 10)}`;
  const at = p.venue ? ` в ${p.venue}` : "";
  return `${when} ты брал ${p.beer}${at} — как оно?`;
}

async function sendQuestion(token: string, p: PendingTasting, now: Date): Promise<number | null> {
  const body: Record<string, unknown> = {
    chat_id: p.chat,
    text: questionText(p, now),
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🔥 Огонь", callback_data: `fb:${p.id}:fire` },
          { text: "👍 Норм", callback_data: `fb:${p.id}:good` },
          { text: "👎 Мимо", callback_data: `fb:${p.id}:pass` },
        ],
        [{ text: "Не пробовал", callback_data: `fb:${p.id}:skip` }],
      ],
    },
  };
  if (p.thread) body.message_thread_id = Number(p.thread);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
  if (!data.ok) {
    console.error(`pending ask: sendMessage failed для ${p.id} — ${data.description ?? res.status}`);
    return null;
  }
  return data.result?.message_id ?? null;
}

// ── команды ───────────────────────────────────────────────────────────────────────
switch (cmd) {
  case "add": {
    const raw = flag("json");
    if (!raw) fail('usage: beerlog pending add --json \'{"beer":"…","chat":"…"[,"beerId","venue","thread"]}\'');
    let input: { beer?: string; beerId?: string | null; venue?: string; chat?: string; thread?: string };
    try { input = JSON.parse(raw); } catch (e) { fail(`--json не распарсился: ${(e as Error).message}`); }
    if (!input.beer || !input.chat) fail("нужны минимум beer и chat (куда потом задавать вопрос)");
    const { record, action } = addPending({
      beerId: input.beerId ?? null, beer: input.beer, venue: input.venue,
      chat: String(input.chat), thread: input.thread ? String(input.thread) : undefined,
    });
    out({ status: "ok", action, record });
  }

  case "list": {
    const all = listPendings();
    const ripe = ripePendings().map((p) => p.id);
    out({ status: "ok", total: all.length, ripe, pendings: all });
  }

  case "ask": {
    const dry = argv.includes("--dry-run");
    const now = new Date();
    const archived = dry ? 0 : archiveStale(undefined, now);
    const ripe = ripePendings(undefined, now);
    if (dry) {
      out({ status: "ok", dryRun: true, wouldAsk: ripe.map((p) => ({ id: p.id, question: questionText(p, now), chat: p.chat, thread: p.thread })) });
    }
    if (!ripe.length) out({ status: "ok", asked: 0, archived });
    const token = botToken();
    const asked: { id: string; message_id: number }[] = [];
    for (const p of ripe) {
      const mid = await sendQuestion(token, p, now);
      if (mid === null) continue; // не пометили asked — переспросим следующим прогоном
      // голый текстовый ответ («🔥», «зашло») привяжется через fromContext в record-tasting
      setLastBeer(p.chat, { beerId: p.beerId, beer: p.beer, venue: p.venue }, undefined, p.thread);
      markAsked(p.id, undefined, now);
      asked.push({ id: p.id, message_id: mid });
    }
    out({ status: "ok", asked: asked.length, messages: asked, archived });
  }

  case "close": {
    const id = flag("id") ?? argv[1];
    if (!id || id.startsWith("--")) fail("usage: beerlog pending close --id <pt_xxxxxxxx>");
    const record = closePending(id);
    if (!record) fail(`pending ${id} не найден`);
    out({ status: "ok", record });
  }

  default:
    fail("usage: beerlog pending <add|list|ask|close> — петля «как тебе вчерашнее?» (TASK-55)");
}
