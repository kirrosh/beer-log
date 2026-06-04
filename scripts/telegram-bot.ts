// Тонкий Telegram-бот-лаунчер для мини-аппа «экран точки» (TASK-34 #2). Бот-UI с нуля НЕ строим:
// он только открывает мини-апп (тот же web-билд @beer-log/web) у полки. Функции минимальны:
//   /start    — приветствие + web_app-кнопка «Открыть у полки» (→ список точек)
//   /venues   — список точек inline-кнопками, каждая открывает мини-апп на конкретной точке
//   menu      — синяя кнопка-меню чата = быстрый запуск мини-аппа в один тап
//
// Long polling (getUpdates) — боту не нужен публичный URL. А вот мини-апп Telegram открывает
// ТОЛЬКО по HTTPS (требование платформы): URL витрины берём из WEBAPP_URL или автодетектим ngrok.
//
//   BOT_TOKEN=… [WEBAPP_URL=https://…] bun run scripts/telegram-bot.ts
//
// Без зависимостей: чистый fetch к Bot API. Токен — в .env (gitignored), в чат не вставляем.
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error("✗ BOT_TOKEN не задан. Положи в .env: BOT_TOKEN=<токен от @BotFather>");
  process.exit(1);
}
const TG = `https://api.telegram.org/bot${TOKEN}`;
// локальный API точек (для /venues) — тот же venue-server, что и витрина
const VENUE_API = process.env.VENUE_API ?? "http://localhost:5174";

type Json = Record<string, unknown>;
async function call<T = any>(method: string, body?: Json): Promise<T> {
  const res = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result as T;
}

/** Публичный HTTPS-URL витрины: из env или автодетект из локального ngrok (API :4040). */
async function resolveWebappUrl(): Promise<string | null> {
  const env = process.env.WEBAPP_URL?.replace(/\/+$/, "");
  if (env) return env;
  try {
    const r = await fetch("http://127.0.0.1:4040/api/tunnels");
    const d = (await r.json()) as { tunnels?: { public_url: string; proto: string }[] };
    const https = d.tunnels?.find((t) => t.public_url.startsWith("https://"));
    return https?.public_url.replace(/\/+$/, "") ?? null;
  } catch {
    return null;
  }
}

const WEBAPP = await resolveWebappUrl();
if (!WEBAPP) {
  console.error("✗ Не нашёл HTTPS-URL витрины. Подними ngrok (`ngrok http 3000`) или задай WEBAPP_URL в .env");
  process.exit(1);
}
const webAppUrl = (path: string) => `${WEBAPP}${path}`;

// ── обработчики ────────────────────────────────────────────────────────────────
const HELLO =
  "🍺 *Beer Log* — крафт-локатор у полки.\n\n" +
  "Открой точку и найди «ту самую» по названию с банки, посмотри что налито, " +
  "от любимых пивоварен и что ещё не пробовал.\n\n" +
  "Жми кнопку ниже или /venues — выбрать точку.";

async function onStart(chatId: number) {
  await call("sendMessage", {
    chat_id: chatId,
    text: HELLO,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[{ text: "🍺 Открыть у полки", web_app: { url: webAppUrl("/venues") } }]],
    },
  });
}

type VenueInfo = { id: string; name: string; city: string | null; type: string; poolSize: number };
async function onVenues(chatId: number) {
  let venues: VenueInfo[] = [];
  try {
    const r = await fetch(`${VENUE_API}/api/venues`);
    venues = ((await r.json()) as { venues: VenueInfo[] }).venues ?? [];
  } catch {
    await call("sendMessage", { chat_id: chatId, text: "⚠️ API точек недоступен — запусти `bun run venue:api`.", parse_mode: "Markdown" });
    return;
  }
  if (!venues.length) {
    await call("sendMessage", { chat_id: chatId, text: "Пока нет точек в базе." });
    return;
  }
  // одна web_app-кнопка на точку; режем до 30, чтобы не упереться в лимиты клавиатуры
  const rows = venues.slice(0, 30).map((v) => [
    { text: `${v.name}${v.city ? ` · ${v.city}` : ""} (${v.poolSize})`, web_app: { url: webAppUrl(`/venue/${v.id}`) } },
  ]);
  await call("sendMessage", {
    chat_id: chatId,
    text: `📍 Точки (${venues.length}). Тапни — откроется экран точки:`,
    reply_markup: { inline_keyboard: rows },
  });
}

async function handle(update: any) {
  const msg = update.message;
  if (!msg?.chat?.id) return;
  const chatId = msg.chat.id as number;
  const text: string = (msg.text ?? "").trim();
  const cmd = text.split(/[@\s]/)[0];

  if (cmd === "/start") return onStart(chatId);
  if (cmd === "/venues") return onVenues(chatId);
  if (cmd === "/help") {
    await call("sendMessage", { chat_id: chatId, text: "/start — открыть у полки\n/venues — выбрать точку" });
    return;
  }
  // любое иное сообщение — мягкая подсказка
  await call("sendMessage", {
    chat_id: chatId,
    text: "Жми /start или /venues, чтобы открыть точку.",
    reply_markup: { inline_keyboard: [[{ text: "🍺 Открыть у полки", web_app: { url: webAppUrl("/venues") } }]] },
  });
}

// ── запуск ──────────────────────────────────────────────────────────────────────
async function main() {
  await call("deleteWebhook", { drop_pending_updates: false }); // long polling несовместим с webhook
  const me = await call<{ username: string }>("getMe");
  await call("setMyCommands", {
    commands: [
      { command: "start", description: "Открыть у полки" },
      { command: "venues", description: "Выбрать точку" },
    ],
  });
  // синяя кнопка-меню чата = запуск мини-аппа в один тап
  await call("setChatMenuButton", {
    menu_button: { type: "web_app", text: "У полки", web_app: { url: webAppUrl("/venues") } },
  });

  console.log(`✓ @${me.username} запущен · мини-апп ${WEBAPP} · API точек ${VENUE_API}`);
  console.log("  long polling… (Ctrl+C для остановки)");

  let offset = 0;
  for (;;) {
    try {
      const updates = await call<any[]>("getUpdates", { offset, timeout: 30 });
      for (const u of updates) {
        offset = u.update_id + 1;
        handle(u).catch((e) => console.error("handle error:", e?.message ?? e));
      }
    } catch (e: any) {
      console.error("getUpdates error:", e?.message ?? e);
      await Bun.sleep(2000);
    }
  }
}

main().catch((e) => {
  console.error("✗ фатальная ошибка:", e?.message ?? e);
  process.exit(1);
});
