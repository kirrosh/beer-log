// Единый shop-ingest по платформе (task-23): один движок вместо bespoke-скрипта на магазин.
// Магазин описан КОНФИГОМ в data/pipeline/shops.json (поле `ingestConfig`), а не отдельным
// скриптом. Платформы: woocommerce / bitrix / custom-json / telegram (бары). Движок и чистые
// парсеры — scripts/lib/shop-ingest.ts + @beer-log/parsers (shops/platforms.ts).
//
//   DRY=1 bun run scripts/ingest-shop-platform.ts kraftbeer-beertrade        # сухой прогон
//   PAGES=2 DRY=1 bun run scripts/ingest-shop-platform.ts pivokom            # смоук (2 стр)
//   bun run scripts/ingest-shop-platform.ts storebeer                        # запись листингов
//   bun run scripts/ingest-shop-platform.ts --all                            # все scanned-магазины
import { openDb } from "@beer-log/store";
import { runShopIngest, type ShopIngestConfig } from "./lib/shop-ingest.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const SHOPS_PATH = "data/pipeline/shops.json";
const DRY = !!process.env.DRY;
const PAGES = process.env.PAGES ? parseInt(process.env.PAGES, 10) : undefined;
const today = new Date().toISOString().slice(0, 10);

type Shop = { id: string; name: string; ingestConfig?: ShopIngestConfig };
const registry = JSON.parse(await Bun.file(SHOPS_PATH).text()) as { shops: Shop[] };

const args = process.argv.slice(2);
const wantAll = args.includes("--all");
const ids = args.filter((a) => !a.startsWith("--"));

const targets = wantAll
  ? registry.shops.filter((s) => s.ingestConfig)
  : registry.shops.filter((s) => ids.includes(s.id));

if (targets.length === 0) {
  const known = registry.shops.filter((s) => s.ingestConfig).map((s) => s.id);
  console.error(`Не выбрано магазинов. Укажи id или --all.\nС конфигом ingestConfig: ${known.join(", ")}`);
  process.exit(1);
}

const db = openDb(DB_PATH);
for (const shop of targets) {
  if (!shop.ingestConfig) { console.log(`! ${shop.id}: нет ingestConfig — пропуск`); continue; }
  console.log(`\n=== ${shop.name} (${shop.id}) · платформа ${shop.ingestConfig.platform} ===`);
  const cfg: ShopIngestConfig = PAGES ? { ...shop.ingestConfig, maxPages: PAGES } : shop.ingestConfig;
  await runShopIngest(db, cfg, { dry: DRY, today });
}
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
