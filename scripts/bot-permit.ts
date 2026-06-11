#!/usr/bin/env bun
// PreToolUse(Bash) хук сессии-бота. Читает hook-JSON со stdin.
// Если команда — известная операция бота → авто-allow (без пермишен-промпта).
// Иначе печатает ПУСТО → обычный permission-флоу (промпт/деней как всегда).
//
// Грузится ТОЛЬКО через bot.sh --settings (scripts/bot-settings.json), поэтому
// dev-сессии в этом же репо хук НЕ получают и авто-разрешений не имеют.
//
// Принцип безопасности: вайтлист по ЦЕЛОЙ команде. Разрешаем необязательный
// префикс `cd <путь> && `, дальше — РОВНО один разрешённый `bun …`-вызов, и
// в его аргументах НЕТ шелл-операторов/подстановок (`; & | ` $() <>`). Любой
// хвост (`… ; rm -rf`) → не матчится → падает в обычный промпт (fail-safe).

const REGISTRY = "/Users/kirrotech/.claude/tg-tabs/registry.ts";

// Скрипты бота, которые можно гонять без подтверждения (чтение + курируемые записи).
const SCRIPTS = [
  "beerlog",         // единый CLI бота (проксирует в скрипты ниже) — основной вход
  "bot-lookup",      // чтение каталога (быстрый лукап)
  "catalog-q",       // readonly SQL по каталогу (замена `bun -e`)
  "search-venue",    // поиск «та самая» на точке (чтение)
  "venue-personal",  // личные срезы точки (чтение)
  "bot-profile",     // профиль вкуса из tastings (чтение)
  "bot-recommend",   // топ-5 под меня на точке (чтение)
  "bot-canon",       // канон: маст-трай на точке / паспорт прогресса (чтение)
  "bot-nearby",      // куда пойти: точки города + карта (чтение)
  "tg-buttons",      // сообщение с кнопками (reply-выбор / url-ссылка)
  "record-tasting",  // запись дегустации в data/personal (намеренная запись бота)
  "bot-context",     // контекст диалога (запись служебного json)
  "ingest-shelf",    // запись наличия точки из фото-борда (намеренная запись бота)
].join("|");

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Необязательный префикс `cd <путь> && ` ( "..." | '...' | escaped\ spaces ).
const CD = String.raw`(?:cd\s+(?:"[^"]*"|'[^']*'|(?:\\.|[^\s])+)\s*&&\s*)?`;
// Безопасные аргументы: что угодно, КРОМЕ шелл-операторов/подстановок/редиректов.
// Скобки `()` РАЗРЕШЕНЫ (бывают в названиях, напр. «(Атомная Прачечная)») — командную
// подстановку `$(…)` и так режет исключение `$` и бэктика, без них `()` безвредны.
const ARGS = String.raw`(?:\s[^;&|<>` + "`" + String.raw`$]*)?`;

const ALLOW = [
  new RegExp(`^${CD}bun run scripts/(?:${SCRIPTS})\\.ts${ARGS}$`),
  new RegExp(`^${CD}bun ${esc(REGISTRY)} (?:resolve|list)${ARGS}$`),
];

let raw = "";
for await (const c of Bun.stdin.stream()) raw += Buffer.from(c).toString();

let cmd = "";
try {
  cmd = String(JSON.parse(raw)?.tool_input?.command ?? "").trim();
} catch {
  /* кривой stdin → молчим, обычный флоу */
}

if (cmd && ALLOW.some((re) => re.test(cmd))) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: "bot script allowlist (scripts/bot-permit.ts)",
      },
    }),
  );
}
// нет совпадения → ничего не печатаем, exit 0 → обычный permission-флоу
