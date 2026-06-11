// Регрессии горячего пути бота (TASK-49 #5). Защищают то, что легко тихо ломается при
// ингестах/рефакторах: профиль вкуса, свежесть/провенанс, гео-утилиты, матчинг сорта.
// Read-only: матчер-тест открывает data/catalog.sqlite только на чтение и скипается, если файла нет.
import { test, expect, describe } from "bun:test";
import { existsSync } from "node:fs";
import { Database } from "bun:sqlite";
import { ageDays, freshness, tier } from "../scripts/lib/provenance.ts";
import { haversineKm, mapUrlFor } from "../scripts/lib/venue-registry.ts";
import { tasteProfile, tasteStats, tasteAssessment, type BeerMeta, type Tasting } from "../scripts/lib/venue-personal.ts";
import { buildMatcher } from "../scripts/lib/catalog-matcher.ts";
import { parseQuery, runFilter } from "../scripts/lib/query-filter.ts";
import { valueSignal, styleValueMedians, type StyleMedian } from "../scripts/lib/value-index.ts";
import { marketSignal, breadthMap, persistenceForSeller, BREADTH_BROAD } from "../scripts/lib/market-signals.ts";
import { loadCanon, saveCanon, type CanonEntry, type CanonFile } from "../scripts/lib/canon.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const NOW = new Date("2026-06-06T00:00:00Z");

describe("provenance: свежесть", () => {
  test("ageDays считает дни от наблюдения", () => {
    expect(ageDays("2026-06-01", NOW)).toBe(5);
    expect(ageDays("2026-06-06", NOW)).toBe(0);
  });
  test("freshness: свежее < 180 дн, stale ≥ 180, dead ≥ 365", () => {
    expect(freshness("2026-06-01", NOW)).toMatchObject({ stale: false, dead: false });
    expect(freshness("2025-12-01", NOW).stale).toBe(true);   // ~187 дн
    expect(freshness("2025-01-01", NOW).dead).toBe(true);    // > 365 дн
  });
  test("tier: свежий self — высокий; протухший web-photo — низкий", () => {
    expect(tier({ sourceType: "self", observedAt: "2026-06-01" }, NOW).level).toBe("high");
    expect(tier({ sourceType: "web-photo", observedAt: "2024-01-01" }, NOW).level).toBe("low");
  });
});

describe("venue-registry: гео-утилиты", () => {
  test("haversineKm: Москва→Питер ≈ 630 км", () => {
    const d = haversineKm(55.7558, 37.6173, 59.9311, 30.3609);
    expect(d).toBeGreaterThan(600);
    expect(d).toBeLessThan(680);
  });
  test("haversineKm: одна точка = 0", () => {
    expect(haversineKm(56.3, 44.0, 56.3, 44.0)).toBe(0);
  });
  test("mapUrlFor: deeplink Яндекса с именем и городом", () => {
    const u = mapUrlFor("Hophead Pivoteka", "Нижний Новгород");
    expect(u).toStartWith("https://yandex.ru/maps/?text=");
    expect(decodeURIComponent(u)).toContain("Hophead Pivoteka");
    expect(decodeURIComponent(u)).toContain("Нижний Новгород");
  });
});

describe("venue-personal: профиль вкуса", () => {
  const meta = new Map<string, BeerMeta>([
    ["b1", { category: "ipa", styleName: "NEIPA", breweryId: "br1", abv: 6.5 }],
    ["b2", { category: "sour-wild", styleName: "Gose", breweryId: "br2", abv: 4.5 }],
    ["b3", { category: "ipa", styleName: "DIPA", breweryId: "br1", abv: 8 }],
  ]);
  const tastings: Tasting[] = [
    { beerId: "b1", beer: "A", verdict: "fire", wouldRepeat: true },
    { beerId: "b2", beer: "B", verdict: "good" },
    { beerId: "b3", beer: "C", verdict: "pass" },
  ];
  const p = tasteProfile(tastings, meta);

  test("fire → fireStyles + repeatable + любимая пивоварня", () => {
    expect([...p.fireStyles]).toEqual(["ipa"]);
    expect(p.repeatable.has("b1")).toBe(true);
    expect(p.favBreweries.has("br1")).toBe(true);
  });
  test("good → goodStyles, не repeatable, не favBrewery", () => {
    expect([...p.goodStyles]).toEqual(["sour-wild"]);
    expect(p.repeatable.has("b2")).toBe(false);
    expect(p.favBreweries.has("br2")).toBe(false);
  });
  test("pass не попадает в repeatable/fav, но числится пробованным", () => {
    expect(p.repeatable.has("b3")).toBe(false);
    expect(p.tastedSet.has("b3")).toBe(true);
  });
  test("unknown-категория в стили не попадает", () => {
    const m2 = new Map<string, BeerMeta>([["x", { category: "unknown", styleName: null, breweryId: "b", abv: null }]]);
    const p2 = tasteProfile([{ beerId: "x", beer: "X", verdict: "fire" }], m2);
    expect(p2.fireStyles.size).toBe(0);
  });
});

describe("query-filter: разбор запроса словами (TASK-32 #1)", () => {
  test("«кислое до 500» → стиль sour-wild + цена", () => {
    expect(parseQuery("кислое до 500")).toMatchObject({ style: "sour-wild", priceMax: 500 });
  });
  test("«крепкий стаут» → стиль + нижний порог ABV", () => {
    expect(parseQuery("крепкий стаут")).toMatchObject({ style: "stout-porter", abvMin: 7 });
  });
  test("«лёгкое на вынос» → верхний ABV + упакованный формат", () => {
    const f = parseQuery("лёгкое на вынос");
    expect(f.abvMax).toBe(5);
    expect(f.format).toEqual(["can", "bottle"]);
  });
  test("«что покрепче но не очень» → диапазон ABV без стиля", () => {
    expect(parseQuery("что покрепче но не очень")).toMatchObject({ abvMin: 7, abvMax: 9 });
  });
  test("явное «до 5%» — это ABV, а не цена", () => {
    const f = parseQuery("светлое до 5%");
    expect(f.abvMax).toBe(5);
    expect(f.priceMax).toBeUndefined();
  });
  test("«нейпа на кране» → ipa + draft", () => {
    const f = parseQuery("нейпа на кране");
    expect(f.style).toBe("ipa");
    expect(f.format).toEqual(["draft", "keg"]);
  });
});

describe("query-filter: SQL по пулу + деградация (TASK-32 #2)", () => {
  function seedDb(): Database {
    const db = new Database(":memory:");
    db.run("CREATE TABLE breweries (id TEXT PRIMARY KEY, name TEXT)");
    db.run("CREATE TABLE beers (id TEXT PRIMARY KEY, name TEXT, brewery_id TEXT, abv REAL, style_category TEXT, style_name TEXT)");
    db.run("CREATE TABLE price_listings (id TEXT PRIMARY KEY, beer_id TEXT, beer_name_raw TEXT, price REAL, format TEXT, seller TEXT, seen_at TEXT, source_type TEXT)");
    db.run("INSERT INTO breweries VALUES ('br1','Jaws'),('br2','Salden')");
    db.run("INSERT INTO beers VALUES ('b1','Кислая',  'br1', 4.5, 'sour-wild',    'Gose')");
    db.run("INSERT INTO beers VALUES ('b2','Стаут',   'br2', 8.5, 'stout-porter', 'Imperial Stout')");
    db.run("INSERT INTO beers VALUES ('b3','Лёгкий',  'br1', 4.0, 'lager',        'Helles')");
    // Кислая дешёвая в банке; стаут дорогой на кране; лагер дешёвый в банке
    db.run("INSERT INTO price_listings VALUES ('l1','b1','Jaws Кислая', 450,'can',  's1','2026-06-01','self')");
    db.run("INSERT INTO price_listings VALUES ('l2','b2','Salden Стаут',700,'draft','s1','2026-06-01','self')");
    db.run("INSERT INTO price_listings VALUES ('l3','b3','Jaws Лёгкий', 300,'can',  's1','2026-06-01','self')");
    return db;
  }
  test("точный фильтр: кислое до 500 → одна позиция, без ослабления", () => {
    const db = seedDb();
    const r = runFilter(db, "s1", { style: "sour-wild", priceMax: 500 });
    expect(r.count).toBe(1);
    expect(r.relaxed).toEqual([]);
    expect(r.items[0]!.beerId).toBe("b1");
  });
  test("деградация: стаут до 500 пуст → ослабляет price, находит дорогой стаут", () => {
    const db = seedDb();
    const r = runFilter(db, "s1", { style: "stout-porter", priceMax: 500 });
    expect(r.relaxed).toContain("price");
    expect(r.count).toBe(1);
    expect(r.items[0]!.beerId).toBe("b2");
  });
  test("стиль — ядро: держится, пока ослабление format+abv возвращает результат", () => {
    const db = seedDb();
    // крепкое (abvMin 9) кислое на кране: нет → роняет format, потом abv → находит кислую, стиль не трогает
    const r = runFilter(db, "s1", { style: "sour-wild", abvMin: 9, format: ["draft"] });
    expect(r.relaxed).toContain("format");
    expect(r.relaxed).toContain("abv");
    expect(r.relaxed).not.toContain("style"); // ядро сохранено
    expect(r.count).toBe(1);
    expect(r.items[0]!.style).toBe("sour-wild");
  });
});

describe("value-index: ₽/литр против медианы стиля (TASK-50)", () => {
  const medians = new Map<string, StyleMedian>([["ipa", { median: 1311, n: 990 }]]);

  test("дешевле медианы на ≥10% → kind=value, бонус положительный", () => {
    const cheap = valueSignal({ price: 370, volumeMl: 450, category: "ipa" }, medians)!; // ~822 ₽/л
    expect(cheap.kind).toBe("value");
    expect(cheap.reason).toContain("выгодно");
    expect(cheap.bonus).toBeGreaterThan(0);
  });

  test("дороже медианы на ≥25% → kind=overpay, бонус отрицательный", () => {
    const dear = valueSignal({ price: 900, volumeMl: 450, category: "ipa" }, medians)!; // 2000 ₽/л, +53%
    expect(dear.kind).toBe("overpay");
    expect(dear.reason).toContain("переплата");
    expect(dear.bonus).toBeLessThan(0);
  });

  test("в норме (±) → kind=fair, reason=null", () => {
    const fair = valueSignal({ price: 600, volumeMl: 450, category: "ipa" }, medians)!; // ~1333 ₽/л, +2%
    expect(fair.kind).toBe("fair");
    expect(fair.reason).toBeNull();
  });

  test("деградация: нет категории/объёма/цены или нет медианы стиля → null", () => {
    expect(valueSignal({ price: 590, volumeMl: 450, category: null }, medians)).toBeNull();
    expect(valueSignal({ price: 590, volumeMl: 450, category: "unknown" }, medians)).toBeNull();
    expect(valueSignal({ price: 590, volumeMl: null, category: "ipa" }, medians)).toBeNull();
    expect(valueSignal({ price: 0, volumeMl: 450, category: "ipa" }, medians)).toBeNull();
    expect(valueSignal({ price: 590, volumeMl: 450, category: "stout-porter" }, medians)).toBeNull(); // нет в medians
  });

  test("styleValueMedians (на реальном каталоге, read-only): отбрасывает редкие стили", () => {
    const DB = "data/catalog.sqlite";
    if (!existsSync(DB)) return;
    const db = new Database(DB, { readonly: true });
    try {
      const m = styleValueMedians(db);
      expect(m.size).toBeGreaterThan(0);
      for (const sm of m.values()) {
        expect(sm.n).toBeGreaterThanOrEqual(8); // VALUE_MIN_SAMPLE
        expect(sm.median).toBeGreaterThan(0);
      }
    } finally {
      db.close();
    }
  });
});

describe("market-signals: дистрибуция и персистентность (TASK-51)", () => {
  test("широкая дистрибуция (≥порог) → бонус + причина «широко берут»", () => {
    const a = marketSignal(BREADTH_BROAD, undefined);
    expect(a.bonus).toBeGreaterThan(0);
    expect(a.reasons.join(" ")).toContain("широко берут");
  });

  test("breadth==1 → причина «только здесь» (редкость)", () => {
    const a = marketSignal(1, undefined);
    expect(a.bonus).toBeGreaterThan(0);
    expect(a.reasons.join(" ")).toContain("только здесь");
  });

  test("средняя дистрибуция без персистентности → молчит (нейтрально)", () => {
    const a = marketSignal(3, { days: 0, slices: 1 });
    expect(a.bonus).toBe(0);
    expect(a.reasons).toHaveLength(0);
  });

  test("персистентность ≥порога срезов → причина «якорь точки»", () => {
    const a = marketSignal(3, { days: 60, slices: 3 });
    expect(a.reasons.join(" ")).toContain("якорь");
  });

  test("breadthMap/persistenceForSeller на реальном каталоге (read-only)", () => {
    const DB = "data/catalog.sqlite";
    if (!existsSync(DB)) return;
    const db = new Database(DB, { readonly: true });
    try {
      const bm = breadthMap(db);
      expect(bm.size).toBeGreaterThan(0);
      for (const v of bm.values()) expect(v).toBeGreaterThanOrEqual(1);
      // персистентность по любой точке: текущая база — один срез, span=0/slices=1, без ошибок
      const seller = (db.query("SELECT seller FROM price_listings WHERE seller IS NOT NULL LIMIT 1")
        .get() as { seller: string } | null)?.seller;
      if (seller) {
        const pm = persistenceForSeller(db, seller);
        for (const p of pm.values()) {
          expect(p.slices).toBeGreaterThanOrEqual(1);
          expect(p.days).toBeGreaterThanOrEqual(0);
        }
      }
    } finally {
      db.close();
    }
  });
});

describe("профиль вкуса v2: hit-rate / ABV-зона / cost-per-🔥 / анти-сигналы (TASK-57)", () => {
  const meta = (over: Partial<BeerMeta>): BeerMeta => ({ category: "ipa", styleName: "IPA", breweryId: "br_a", abv: 6, ...over });
  const t = (over: Partial<Tasting>): Tasting => ({ beerId: "be_x", beer: "B Sort", ...over });

  test("tasteStats: noRepeat, hit-rate, ABV-зона и cost подавлены при малом N", () => {
    const tastings: Tasting[] = [
      t({ beerId: "be_1", verdict: "fire", pricePaid: 400 }),
      t({ beerId: "be_2", verdict: "good", wouldRepeat: false }),
    ];
    const m = new Map<string, BeerMeta>([["be_1", meta({})], ["be_2", meta({})]]);
    const s = tasteStats(tastings, m);
    expect(s.noRepeat.has("be_2")).toBe(true);
    expect(s.byBrewery.get("br_a")).toMatchObject({ n: 2, fire: 1, good: 1 });
    expect(s.abvZone).toBeNull();    // <3 🔥 → нет зоны
    expect(s.costPerFire).toBeNull(); // <3 🔥 с ценой → нет
  });

  test("tasteStats: ABV-зона и cost считаются при ≥3 🔥", () => {
    const m = new Map<string, BeerMeta>();
    const tastings: Tasting[] = [5, 6.5, 8].map((abv, i) => {
      const id = `be_${i}`;
      m.set(id, meta({ abv }));
      return t({ beerId: id, verdict: "fire", pricePaid: 300 + i * 100 });
    });
    const s = tasteStats(tastings, m);
    expect(s.abvZone).toMatchObject({ lo: 5, hi: 8, n: 3 });
    expect(s.costPerFire).toMatchObject({ avg: 400, n: 3 });
  });

  test("assessment: «не возьму снова» — жёсткий минус + ⚠", () => {
    const s = tasteStats([t({ beerId: "be_2", verdict: "good", wouldRepeat: false })], new Map([["be_2", meta({})]]));
    const a = tasteAssessment({ beerId: "be_2", breweryId: "br_a", category: "ipa", abv: 6 }, s);
    expect(a.bonus).toBeLessThan(0);
    expect(a.antiReasons.join(" ")).toContain("не возьму снова");
  });

  test("assessment: пивоварня 2/2 🔥 → ✓ hit-rate; пивоварня 2×👎 → ⚠", () => {
    const m = new Map<string, BeerMeta>([["be_1", meta({ breweryId: "br_good" })], ["be_2", meta({ breweryId: "br_good" })], ["be_3", meta({ breweryId: "br_bad" })], ["be_4", meta({ breweryId: "br_bad" })]]);
    const s = tasteStats([
      t({ beerId: "be_1", verdict: "fire" }), t({ beerId: "be_2", verdict: "fire" }),
      t({ beerId: "be_3", verdict: "pass" }), t({ beerId: "be_4", verdict: "pass" }),
    ], m);
    const good = tasteAssessment({ beerId: "be_new", breweryId: "br_good", breweryName: "Jaws", category: "ipa", abv: 6 }, s);
    expect(good.reasons.join(" ")).toContain("🔥");
    expect(good.bonus).toBeGreaterThan(0);
    const bad = tasteAssessment({ beerId: "be_new2", breweryId: "br_bad", breweryName: "Meh", category: "ipa", abv: 6 }, s);
    expect(bad.antiReasons.join(" ")).toContain("👎");
    expect(bad.bonus).toBeLessThan(0);
  });

  test("assessment: ABV вне 🔥-зоны → ⚠ (когда зона известна)", () => {
    const m = new Map<string, BeerMeta>();
    const tastings: Tasting[] = [5, 5.5, 6].map((abv, i) => { const id = `be_${i}`; m.set(id, meta({ abv })); return t({ beerId: id, verdict: "fire" }); });
    const s = tasteStats(tastings, m);
    const strong = tasteAssessment({ beerId: "be_z", breweryId: null, category: "ipa", abv: 10 }, s);
    expect(strong.antiReasons.join(" ")).toContain("крепче");
  });

  test("деградация: пивоварня с 1 наблюдением → сигнал не применяется", () => {
    const s = tasteStats([t({ beerId: "be_1", verdict: "fire" })], new Map([["be_1", meta({})]]));
    const a = tasteAssessment({ beerId: "be_new", breweryId: "br_a", category: "ipa", abv: 6 }, s);
    expect(a.reasons).toHaveLength(0);
    expect(a.antiReasons).toHaveLength(0);
  });
});

describe("canon: загрузка/сохранение/дедуп (TASK-52)", () => {
  const entry = (over: Partial<CanonEntry>): CanonEntry => ({
    beerId: "be_x", beer: "Brew Sort", canonType: "brewery-flagship",
    basis: "distribution", basisNote: "тест", addedAt: "2026-06-11", ...over,
  });

  test("loadCanon на отсутствующем файле → пустой канон с дефолтной схемой", () => {
    const dir = mkdtempSync(`${tmpdir()}/canon-`);
    try {
      const f = loadCanon(dir);
      expect(f.canon).toHaveLength(0);
      expect(f.schema).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("saveCanon → loadCanon round-trip сохраняет записи и порядок полей", () => {
    const dir = mkdtempSync(`${tmpdir()}/canon-`);
    try {
      const file: CanonFile = { schema: { what: "t" }, canon: [entry({}), entry({ beerId: null, beer: "Вне каталога", basis: "research" })] };
      saveCanon(file, dir);
      const back = loadCanon(dir);
      expect(back.canon).toHaveLength(2);
      expect(back.canon[0]!.canonType).toBe("brewery-flagship");
      expect(back.canon[1]!.beerId).toBeNull(); // null beerId сохраняется (вне каталога)
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("чистка: пустые опц. поля (note) отбрасываются при сериализации", () => {
    const dir = mkdtempSync(`${tmpdir()}/canon-`);
    try {
      saveCanon({ schema: {}, canon: [entry({ note: "" })] }, dir);
      const back = loadCanon(dir);
      expect("note" in back.canon[0]!).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("bot-canon паспорт: валидный JSON с headline и byType (на реальном каталоге)", () => {
    if (!existsSync("data/catalog.sqlite")) return;
    const p = Bun.spawnSync(["bun", "run", "scripts/bot-canon.ts"], { stdout: "pipe", stderr: "pipe" });
    expect(p.exitCode).toBe(0);
    const out = JSON.parse(p.stdout.toString());
    expect(out.mode).toBe("passport");
    expect(typeof out.headline).toBe("string");
    expect(out.breweriesTotal).toBeGreaterThan(0);
  });
});

describe("catalog-matcher: резолв сорта (на реальном каталоге, read-only)", () => {
  const DB = "data/catalog.sqlite";
  test.if(existsSync(DB))("Атомная Прачечная резолвится в Jaws, не в чужой бренд", () => {
    const db = new Database(DB, { readonly: true });
    try {
      const m = buildMatcher(db, { createAuto: false }).match("Jaws Атомная Прачечная");
      expect(m.breweryId).toBeTruthy();
      expect((m.breweryName ?? "").toLowerCase()).toContain("jaws");
    } finally {
      db.close();
    }
  });
});
