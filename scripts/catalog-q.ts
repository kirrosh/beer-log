#!/usr/bin/env bun
// Readonly-раннер каталога для бота. Замена ad-hoc `bun -e "import {Database}…"`,
// чтобы поверхность Bash была перечислимой (его авто-разрешает bot-permit.ts).
//
//   bun run scripts/catalog-q.ts "select id,name,style_name,abv from beers limit 5"
//
// Открывает data/catalog.sqlite В РЕЖИМЕ ТОЛЬКО ЧТЕНИЯ → записи невозможны.
// Печатает результат как JSON. Никаких PRAGMA/ATTACH не надо — см. схему в beer-concierge.
import { Database } from "bun:sqlite";
import { resolve } from "node:path";

const sql = process.argv.slice(2).join(" ").trim();
if (!sql) {
  console.error('usage: bun run scripts/catalog-q.ts "<SELECT …>"');
  process.exit(1);
}
// Только чтение: режем многооператорность и очевидные мутации.
if (/;/.test(sql.replace(/;\s*$/, ""))) {
  console.error("catalog-q: один SELECT за раз (точка с запятой внутри запрещена)");
  process.exit(1);
}
if (/\b(insert|update|delete|drop|alter|create|attach|replace|vacuum)\b/i.test(sql)) {
  console.error("catalog-q: только чтение (SELECT). Мутации — через ингест-скрипты.");
  process.exit(1);
}

const db = new Database(resolve(import.meta.dir, "..", "data", "catalog.sqlite"), { readonly: true });
try {
  console.log(JSON.stringify(db.query(sql).all()));
} catch (e) {
  console.error("catalog-q error:", e instanceof Error ? e.message : String(e));
  process.exit(1);
} finally {
  db.close();
}
