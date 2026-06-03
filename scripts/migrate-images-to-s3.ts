// Миграция уже рехостнутых локально картинок (task-15) в S3 (Yandex Object Storage).
// Берёт записи с локальным image_url ("/img/…"), заливает файл из packages/web/static в бакет,
// проставляет в БД публичный URL. Идемпотентно: записи с уже-абсолютным URL пропускает.
// Требует настроенного data/.secrets/s3.json (иначе putImage пишет локально — миграция бессмысленна).
//
//   bun run scripts/migrate-images-to-s3.ts --dry      # показать, что мигрирует, без записи
//   bun run scripts/migrate-images-to-s3.ts            # залить в S3 + обновить БД
//   bun run scripts/migrate-images-to-s3.ts --prune    # после успешной заливки удалить локальные файлы
import { Database } from "bun:sqlite";
import { migrate, setBreweryImage, setBeerImage } from "@beer-log/store";
import { isS3Configured, putImage } from "./lib/images-store.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const STATIC_DIR = "packages/web/static";
const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const PRUNE = argv.includes("--prune");

const ctOf = (path: string): string =>
  ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" } as Record<string, string>)[
    path.split(".").pop()?.toLowerCase() ?? ""
  ] ?? "application/octet-stream";

if (!DRY && !(await isS3Configured())) {
  console.error("✗ data/.secrets/s3.json не настроен — миграция в S3 невозможна. См. scripts/lib/images-store.ts.");
  process.exit(1);
}

const db = new Database(DB_PATH);
migrate(db);

type Row = { id: string; image_url: string };
const brews = db.query("SELECT id, image_url FROM breweries WHERE image_url LIKE '/img/%'").all() as Row[];
const beers = db.query("SELECT id, image_url FROM beers WHERE image_url LIKE '/img/%'").all() as Row[];
console.log(`к миграции: пивоварен ${brews.length}, сортов ${beers.length}${DRY ? " · DRY" : ""}\n`);

let ok = 0, miss = 0, pruned = 0;
async function migrateRow(localPath: string, set: (url: string) => void): Promise<void> {
  const key = localPath.replace(/^\/+/, ""); // "/img/…" → "img/…"
  const file = Bun.file(`${STATIC_DIR}/${key}`);
  if (!(await file.exists())) { miss++; console.log(`  ✗ нет файла: ${localPath}`); return; }
  if (DRY) { ok++; return; }
  const url = await putImage(key, await file.arrayBuffer(), ctOf(key));
  set(url);
  ok++;
  if (PRUNE) { await file.delete().catch(() => {}); pruned++; }
}

for (const r of brews) await migrateRow(r.image_url, (url) => setBreweryImage(db, r.id, url));
for (const r of beers) await migrateRow(r.image_url, (url) => setBeerImage(db, r.id, url));

db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
db.close();
console.log(`\nготово: залито ${ok}, файлов не найдено ${miss}${PRUNE ? `, удалено локальных ${pruned}` : ""}${DRY ? " (dry)" : ""}`);
if (!DRY) console.log("→ перегенерируй снапшот: bun run scripts/export-catalog.ts");
