// Снапшот каталога вне git: чистая атомарная копия catalog.sqlite через VACUUM INTO
// (рекомендуемый SQLite-способ бэкапа — безопасен при WAL, дефрагментирует, без sidecar'ов).
// Плюс integrity_check источника и ротация (хранит последние KEEP штук). Папка backups/ gitignored.
// git и так версионирует catalog.sqlite на каждом коммите — это защита от повреждения РАБОЧЕЙ
// копии между коммитами (как WAL-инцидент) и быстрый restore без git.
//
//   bun run scripts/backup-db.ts                 # снапшот в backups/
//   KEEP=30 bun run scripts/backup-db.ts         # хранить 30 последних
//   restore: cp backups/catalog-<ts>.sqlite data/catalog.sqlite  (БД не должна быть открыта)
import { Database } from "bun:sqlite";
import { readdirSync, mkdirSync, statSync, rmSync } from "node:fs";

const SRC = process.env.DB_PATH ?? "data/catalog.sqlite";
const DIR = "backups";
const KEEP = parseInt(process.env.KEEP ?? "15", 10);

mkdirSync(DIR, { recursive: true });
const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "").replace(/-/g, ""); // YYYYMMDDHHMMSS
const dest = `${DIR}/catalog-${ts}.sqlite`;

const db = new Database(SRC, { readwrite: true });
db.exec("PRAGMA busy_timeout = 15000;");
// 1) целостность источника — не бэкапим битое
const integ = (db.query("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check;
if (integ !== "ok") { console.error(`! integrity_check НЕ ok: ${integ} — бэкап прерван`); db.close(); process.exit(1); }
const srcStats = db.query("SELECT (SELECT COUNT(*) FROM breweries) b, (SELECT COUNT(*) FROM beers) be, (SELECT COUNT(*) FROM price_listings) pl").get() as any;
// 2) атомарная чистая копия
db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
db.close();

// 3) проверить копию открытием
const chk = new Database(dest, { readonly: true });
const cb = (chk.query("SELECT COUNT(*) c FROM beers").get() as { c: number }).c;
chk.close();
const sizeMb = (statSync(dest).size / 1048576).toFixed(1);
console.log(`✓ снапшот ${dest} (${sizeMb} MB) | пивоварен ${srcStats.b} / сортов ${srcStats.be} / листингов ${srcStats.pl} | проверка копии: ${cb} сортов`);

// 4) ротация: оставить последние KEEP
const snaps = readdirSync(DIR).filter((f) => /^catalog-\d{14}\.sqlite$/.test(f)).sort();
const drop = snaps.slice(0, Math.max(0, snaps.length - KEEP));
for (const f of drop) { rmSync(`${DIR}/${f}`); }
console.log(`снапшотов хранится: ${Math.min(snaps.length, KEEP)} (удалено старых: ${drop.length}, лимит KEEP=${KEEP})`);
