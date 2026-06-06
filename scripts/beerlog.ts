#!/usr/bin/env bun
// beerlog — единый CLI операций бота Beer Log. Один вход = перечислимая поверхность
// (его авто-разрешает scripts/bot-permit.ts), плюс `help` для самого бота, чтобы он
// не импровизировал сырым Bash. Подкоманды просто проксируют argv в нужный скрипт —
// внутренний spawn НЕ виден permission-системе (гейтится только внешний `beerlog`).
//
//   bun run scripts/beerlog.ts help
//   bun run scripts/beerlog.ts lookup "Атомная Прачечная"
//   bun run scripts/beerlog.ts query "select name,abv from beers limit 3"
import { resolve } from "node:path";

const HERE = import.meta.dir;
const REGISTRY = "/Users/kirrotech/.claude/tg-tabs/registry.ts";
const S = (f: string) => ["run", resolve(HERE, f)]; // `bun run scripts/<f>`

type Cmd = { desc: string; usage: string; argv: string[] };
const COMMANDS: Record<string, Cmd> = {
  lookup: {
    desc: "Быстрый лукап сорта/пивоварни → JSON (стиль/ABV/линейка/где найти/твой вердикт)",
    usage: 'beerlog lookup "<название>"',
    argv: S("bot-lookup.ts"),
  },
  query: {
    desc: "Readonly SQL по каталогу (только SELECT, мутации режутся)",
    usage: 'beerlog query "<SELECT …>"',
    argv: S("catalog-q.ts"),
  },
  tasting: {
    desc: "Записать дегустацию в data/personal (идемпотентно)",
    usage: `beerlog tasting --json '{"beer":"…","verdict":"fire|good|pass"}'`,
    argv: S("record-tasting.ts"),
  },
  me: {
    desc: "Профиль вкуса из tastings (стили/дескрипторы/огоньки/траты, разрез по точке)",
    usage: "beerlog me [--venue <seller|подстрока>] [--style <category>]",
    argv: S("bot-profile.ts"),
  },
  profile: {
    desc: "Алиас me — профиль вкуса из tastings",
    usage: "beerlog profile [--venue <seller>]",
    argv: S("bot-profile.ts"),
  },
  recommend: {
    desc: "Топ-5 под меня на точке: профиль × пул → repeat/new с объяснением (TASK-43)",
    usage: "beerlog recommend --seller <seller> [--limit 5]",
    argv: S("bot-recommend.ts"),
  },
  top5: {
    desc: "Алиас recommend — топ-5 под меня на точке",
    usage: "beerlog top5 --seller <seller>",
    argv: S("bot-recommend.ts"),
  },
  nearby: {
    desc: "Куда пойти: крафт-точки города с маркерами и ссылкой на карту (TASK-42)",
    usage: "beerlog nearby [--city <город>] [--lat <ш> --lng <д>] [--limit 10]",
    argv: S("bot-nearby.ts"),
  },
  context: {
    desc: "Контекст диалога вкладки (set/get/clear) — что показывали последним",
    usage: "beerlog context set --chat <id> --beer-id <id> [--thread <id>]",
    argv: S("bot-context.ts"),
  },
  shelf: {
    desc: "Записать наличие точки из распознанного фото-борда (source ai-vision)",
    usage: "beerlog shelf …",
    argv: S("ingest-shelf.ts"),
  },
  venue: {
    desc: "Поиск «та самая» на точке (каскад exact→fuzzy→brewery→absent)",
    usage: "beerlog venue …",
    argv: S("search-venue.ts"),
  },
  img: {
    desc: "Найти картинку в Яндексе → JSON-кандидаты (ФОЛБЭК, когда нашей обложки нет)",
    usage: 'beerlog img "<пивоварня сорт банка>"',
    argv: S("yandex-img.ts"),
  },
  photo: {
    desc: "Отправить фото с подписью ОДНИМ медиа-сообщением (обложка + ответ вместе)",
    usage: "beerlog photo --chat <id> --image <url|path> --caption <text> [--thread <id>]",
    argv: S("tg-photo.ts"),
  },
  buttons: {
    desc: "Сообщение с кнопками: reply-buttons (выбор→текст боту) | url-buttons (ссылка/карта)",
    usage: `beerlog buttons --chat <id> --text <t> --reply-buttons '["A","B"]' [--thread <id>]`,
    argv: S("tg-buttons.ts"),
  },
  tab: {
    desc: "Реестр вкладок: какая вкладка у thread (resolve) / список (list)",
    usage: "beerlog tab resolve --thread <id>",
    argv: [REGISTRY], // `bun <registry.ts>`
  },
};

function help(): void {
  const lines = ["beerlog — CLI операций бота Beer Log", "", "Команды:"];
  const w = Math.max(...Object.keys(COMMANDS).map((k) => k.length), 4);
  for (const [name, c] of Object.entries(COMMANDS)) {
    lines.push(`  ${name.padEnd(w)}  ${c.desc}`);
    lines.push(`  ${" ".repeat(w)}  ↳ ${c.usage}`);
  }
  lines.push(`  ${"help".padEnd(w)}  Показать это сообщение`);
  console.log(lines.join("\n"));
}

const [cmd, ...args] = process.argv.slice(2);

if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
  help();
  process.exit(0);
}

const c = COMMANDS[cmd];
if (!c) {
  console.error(`beerlog: неизвестная команда "${cmd}". Запусти: bun run scripts/beerlog.ts help`);
  process.exit(2);
}

const proc = Bun.spawnSync(["bun", ...c.argv, ...args], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});
process.exit(proc.exitCode ?? 0);
