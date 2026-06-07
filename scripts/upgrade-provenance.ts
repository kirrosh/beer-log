#!/usr/bin/env bun
// Поднять провенанс уже записанных листингов точки (ai-vision → self) после ЛИЧНОГО подтверждения.
// Сценарий TASK-44 #6: фото-борд распознали в ai-vision (0.6, medium). Позже Кирилл подтверждает —
// «да, был там, всё верно» / ✅ на конкретный сорт — поднимаем до self (0.9, high) и сбрасываем
// счётчик свежести (seen_at = сегодня): это уже не AI-гипотеза с фото, а наблюдение на месте.
//
// Контракт-агностик: распознавание/запись не трогаем — это отдельный, отложенный шаг переоценки
// source_type существующего листинга. Монотонность гарантирует provenance.canUpgrade (только усиление).
//
//   DRY=1 bun run scripts/upgrade-provenance.ts --seller beermug-nn/gagarina-118
//   bun run scripts/beerlog.ts provenance --seller beermug-nn/gagarina-118 --to self
//   bun run scripts/beerlog.ts provenance --id shelf-gagarina-118-jaws-konflikt-2026-06-05
import { Database } from "bun:sqlite";
import { openDb, upgradeProvenance } from "@beer-log/store";
import { canUpgrade, UPGRADE_TO_SELF_FROM, type SourceType } from "./lib/provenance.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const DRY = !!process.env.DRY;
const today = new Date().toISOString().slice(0, 10);

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

const id = flag("id");
const seller = flag("seller");
const beerId = flag("beer-id");
const to = (flag("to") ?? "self") as SourceType;
const seenAt = has("keep-date") ? undefined : (flag("seen-at") ?? today);
const fromArg = flag("from");

if (!id && !seller) {
  console.error("usage: beerlog provenance (--seller <venue> | --id <listingId>) [--beer-id <id>] [--to self] [--from ai-vision,web-photo] [--seen-at <date> | --keep-date]");
  process.exit(1);
}

// какие source_type разрешено поднять до `to` — дефолт или явный --from, затем фильтр монотонности.
const fromRaw = (fromArg ? fromArg.split(",").map((s) => s.trim()).filter(Boolean) : UPGRADE_TO_SELF_FROM) as SourceType[];
const from = fromRaw.filter((f) => canUpgrade(f, to));
const skipped = fromRaw.filter((f) => !canUpgrade(f, to));
if (skipped.length) console.warn(`! пропущены (не усиление до ${to}): ${skipped.join(", ")}`);
if (!from.length) { console.error(`! нечего поднимать: ни один из [${fromRaw.join(", ")}] не слабее ${to}`); process.exit(1); }

// DRY → readonly (как ingest-shelf): не мутируем journal/WAL для холостого прогона.
const db = (DRY ? new Database(DB_PATH, { readonly: true }) : openDb(DB_PATH)) as ReturnType<typeof openDb>;

console.log(`=== Апгрейд провенанса → ${to} · ${id ? `id ${id}` : `seller ${seller}`}${beerId ? ` · beer ${beerId}` : ""} · DRY=${DRY} ===`);
console.log(`из: ${from.join(", ")}${seenAt ? ` · seen_at→${seenAt}` : " · дату сохраняем"}`);

if (DRY) {
  // предпросмотр: что бы затронули, не записывая
  const where = ["COALESCE(source_type,'shop-web') IN (" + from.map(() => "?").join(",") + ")"];
  const args: (string | null)[] = [...from];
  if (id) { where.unshift("id = ?"); args.unshift(id); }
  if (seller) { where.unshift("seller = ?"); args.unshift(seller); }
  if (beerId) { where.push("beer_id = ?"); args.push(beerId); }
  const rows = db.query(`SELECT id, beer_name_raw, source_type, seen_at FROM price_listings WHERE ${where.join(" AND ")}`).all(...args) as { id: string; beer_name_raw: string; source_type: string | null; seen_at: string }[];
  console.log(`\nзатронуло бы: ${rows.length}`);
  rows.slice(0, 30).forEach((r) => console.log(`  ${r.source_type ?? "shop-web"} → ${to} | ${r.beer_name_raw.slice(0, 50)} (${r.seen_at})`));
  db.close();
  process.exit(0);
}

const res = upgradeProvenance(db, { to, seenAt, id, seller, beerId, from });
console.log(`\nподнято листингов: ${res.updated}`);
res.ids.slice(0, 30).forEach((x) => console.log(`  ${x}`));
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
console.log(JSON.stringify({ ok: true, updated: res.updated, to }));
