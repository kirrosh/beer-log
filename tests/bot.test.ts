// Регрессии горячего пути бота (TASK-49 #5). Защищают то, что легко тихо ломается при
// ингестах/рефакторах: профиль вкуса, свежесть/провенанс, гео-утилиты, матчинг сорта.
// Read-only: матчер-тест открывает data/catalog.sqlite только на чтение и скипается, если файла нет.
import { test, expect, describe } from "bun:test";
import { existsSync } from "node:fs";
import { Database } from "bun:sqlite";
import { ageDays, freshness, tier } from "../scripts/lib/provenance.ts";
import { haversineKm, mapUrlFor } from "../scripts/lib/venue-registry.ts";
import { tasteProfile, type BeerMeta, type Tasting } from "../scripts/lib/venue-personal.ts";
import { buildMatcher } from "../scripts/lib/catalog-matcher.ts";

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
