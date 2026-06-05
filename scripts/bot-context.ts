/**
 * bot-context.ts — CLI к контексту диалога бота (TASK-46). Агент фиксирует «последний показанный
 * сорт» по chat_id, чтобы дегустация без названия («о, зашло!») привязалась к нему даже после
 * компактизации/рестарта сессии. См. scripts/lib/bot-context.ts.
 *
 *   bun run scripts/bot-context.ts set --chat 123 --beer-id be_c0bfcf95 --beer "Jaws Атомная" [--venue beermug-nn/gagarina-118]
 *   bun run scripts/bot-context.ts get --chat 123      # → JSON контекста или {"empty":true}
 *   bun run scripts/bot-context.ts clear --chat 123
 */
import { setLastBeer, getLastBeer, clearChat } from "./lib/bot-context.ts";

const argv = process.argv.slice(2);
const cmd = argv[0];
const get = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const chat = get("--chat");
const thread = get("--thread"); // вкладка (forum topic) — разводит контекст по репозиторию

function fail(msg: string): never {
  console.log(JSON.stringify({ ok: false, error: msg }));
  process.exit(1);
}

if (!chat) fail("нужен --chat <id>");

switch (cmd) {
  case "set": {
    const beerId = get("--beer-id") ?? null;
    const beer = get("--beer");
    if (!beer && !beerId) fail("set требует --beer и/или --beer-id");
    setLastBeer(chat!, { beerId, beer: beer ?? "", venue: get("--venue") }, undefined, thread);
    console.log(JSON.stringify({ ok: true, set: getLastBeer(chat!, undefined, thread) }));
    break;
  }
  case "get": {
    const ctx = getLastBeer(chat!, undefined, thread);
    console.log(JSON.stringify(ctx ?? { empty: true }));
    break;
  }
  case "clear": {
    clearChat(chat!, undefined, thread);
    console.log(JSON.stringify({ ok: true }));
    break;
  }
  default:
    fail(`неизвестная команда «${cmd}»; ожидаю set|get|clear`);
}
