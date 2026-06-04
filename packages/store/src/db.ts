import { Database } from "bun:sqlite";

export type DB = Database;

/** Открыть БД (по умолчанию in-memory) и применить миграции. */
export function openDb(path = ":memory:"): DB {
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL;");
  migrate(db);
  return db;
}

export function migrate(db: DB): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS breweries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  city TEXT,
  country TEXT DEFAULT 'RU',
  segment TEXT DEFAULT 'unknown',
  aliases TEXT DEFAULT '[]',
  -- офиц. ссылки пивоварни (SourceRef[] в JSON): сайт, Telegram, VK, Untappd
  links TEXT DEFAULT '[]',
  -- офиц. логотип: локальный путь рехостнутого файла (task-15), напр. /img/brewery/<slug>.jpg
  image_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS beers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  brewery_id TEXT,
  brewery_name_raw TEXT,
  style_slug TEXT,
  style_name TEXT,
  style_category TEXT,
  abv REAL,
  ibu REAL,
  status TEXT NOT NULL DEFAULT 'auto',
  aliases TEXT DEFAULT '[]',
  -- офиц. этикетка/банка: локальный путь рехостнутого файла (task-15)
  image_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS beers_slug_brewery
  ON beers(slug, COALESCE(brewery_id, ''));

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  handle TEXT,
  url TEXT,
  title TEXT,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS beer_sources (
  beer_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  excerpt TEXT,
  seen_at TEXT NOT NULL,
  PRIMARY KEY (beer_id, source_url)
);

CREATE TABLE IF NOT EXISTS price_listings (
  id TEXT PRIMARY KEY,
  beer_id TEXT,
  beer_name_raw TEXT NOT NULL,
  price INTEGER,
  currency TEXT DEFAULT 'RUB',
  volume_ml INTEGER,
  format TEXT,
  seller TEXT,
  source_url TEXT,
  seen_at TEXT NOT NULL,
  discounted INTEGER DEFAULT 0,
  prev_price INTEGER,
  -- провенанс наблюдения: self | web-photo | owner | user | shop-web (null = унаследованный веб-каталог).
  -- Определяет уровень достоверности факта о наличии; seen_at = дата НАБЛЮДЕНИЯ (для веб-фото — дата поста).
  source_type TEXT
);

-- история цен по позиции (для детекта скидок и аналитики спроса)
CREATE TABLE IF NOT EXISTS price_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_key TEXT NOT NULL,
  price INTEGER NOT NULL,
  currency TEXT DEFAULT 'RUB',
  seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS snap_key ON price_snapshots(item_key, seen_at);
  `);

  // эволюция схемы для уже созданных БД: добавить недостающие колонки
  addColumnIfMissing(db, "breweries", "links", "TEXT DEFAULT '[]'");
  addColumnIfMissing(db, "breweries", "image_url", "TEXT");
  addColumnIfMissing(db, "beers", "image_url", "TEXT");
  addColumnIfMissing(db, "price_listings", "source_type", "TEXT");
}

/** Идемпотентно добавить колонку, если её ещё нет (для старых БД). */
function addColumnIfMissing(db: DB, table: string, column: string, decl: string): void {
  const cols = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}
