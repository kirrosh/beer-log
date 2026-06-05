#!/usr/bin/env bun
// Поиск картинок в Яндексе для бота. Возвращает JSON-кандидатов (URL в порядке
// релевантности Яндекса) — бот сам выбирает самую правильную и шлёт через `beerlog photo`.
// Вызов только через beerlog (allowlist), не сырым curl.
//
//   bun run scripts/beerlog.ts img "Jaws Brewery Атомная Прачечная пиво банка"
//
// Скрапит страницу выдачи (img_url= в результатах). Без ключа/куки. Если Яндекс
// отдал капчу/пусто → candidates:[] (бот ответит без картинки).

const query = process.argv.slice(2).join(" ").trim();
if (!query) {
  console.error('usage: bun run scripts/beerlog.ts img "<запрос>"');
  process.exit(1);
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const url = `https://yandex.ru/images/search?text=${encodeURIComponent(query)}`;

let html = "";
try {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ru,en;q=0.9" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  html = await res.text();
} catch (e) {
  console.log(JSON.stringify({ query, candidates: [], error: e instanceof Error ? e.message : String(e) }));
  process.exit(0);
}

// Признак анти-бота: страница без результатов, но со «SmartCaptcha».
const blocked = /SmartCaptcha|showcaptcha|checkcaptcha/i.test(html) && !/img_url=/.test(html);

const seen = new Set<string>();
const candidates: string[] = [];
for (const m of html.matchAll(/img_url=([^"&]+)/g)) {
  let u = decodeURIComponent(m[1]).replace(/&amp;/g, "&");
  if (!/^https?:\/\//.test(u) || seen.has(u)) continue;
  seen.add(u);
  candidates.push(u);
  if (candidates.length >= 15) break;
}

console.log(
  JSON.stringify({
    query,
    candidates,
    ...(blocked ? { error: "captcha" } : {}),
  }),
);
