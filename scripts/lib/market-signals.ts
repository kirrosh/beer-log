// market-signals.ts — рыночные сигналы из price_listings/price_snapshots без новых источников
// (TASK-51, M5). Два сигнала, оба арифметика по готовым данным:
//
//  • Дистрибуция (breadth) — в скольких из продавцов держат сорт. Широкая = рыночный отбор
//    закупщиков (аргумент доверия); обратный край breadth==1 = «есть только здесь» = редкость,
//    повод взять сейчас. Измеряется сразу по price_listings.
//
//  • Персистентность — непрерывность присутствия пары (сорт, точка) во времени: span между первым
//    и последним наблюдением + число различных срезов seen_at. Многомесячный якорь точки против
//    разовой ротации крана. ВРЕМЕННОЙ РЯД живёт ТОЛЬКО в price_snapshots (price_listings —
//    текущее состояние, seen_at заморожен на первом наблюдении, повторный ingest строк не плодит).
//    Сигнал ВПЕРЁДСМОТРЯЩИЙ: пока продавцов не переобходили повторно (TASK-24/25 recurring refresh),
//    у всех пар slices=1/days=0 и якорь молчит — это корректно, не фейк. Загорится по мере
//    накопления срезов. Пороги ниже подобраны под целевой режим (еженедельный refresh), не текущий.
import type { Database } from "bun:sqlite";

// Пороги (AC#3), подобраны по факт. распределению базы (см. TASK-51):
//  breadth: ≥5 продавцов держат сорт — широкая дистрибуция (≈топ 7% сортов с листингами); ==1 —
//  «только здесь». Между — нейтрально (рынок не сказал ничего определённого).
export const BREADTH_BROAD = 5;
//  персистентность: ≥3 различных срезов ИЛИ span ≥45 дн — якорь точки (а не разовая ротация).
export const PERSIST_ANCHOR_SLICES = 3;
export const PERSIST_ANCHOR_DAYS = 45;
// Бонусы скоринга (малые — рыночный сигнал поддерживает, но не перебивает вкус/value):
const BONUS_BROAD = 0.15;
const BONUS_RARE = 0.1;
const BONUS_ANCHOR = 0.15;

const MS_PER_DAY = 86_400_000;
function daysBetween(a: string, b: string): number {
  const da = Date.parse(a), db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.round(Math.abs(db - da) / MS_PER_DAY);
}

/** breadth по каждому сорту: число различных продавцов с листингом beer_id. Один запрос. */
export function breadthMap(db: Database): Map<string, number> {
  const rows = db.query(
    `SELECT beer_id AS id, COUNT(DISTINCT seller) AS b
       FROM price_listings WHERE beer_id IS NOT NULL GROUP BY beer_id`,
  ).all() as { id: string; b: number }[];
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.id, r.b);
  return m;
}

export type Persistence = { days: number; slices: number };

/**
 * Персистентность пар (сорт, точка) на ОДНОЙ точке из price_snapshots. Ключ снапшота —
 * `beerSlug|seller|volumeMl`; агрегируем по beerSlug (max срезов / широчайший span среди объёмов).
 * Возвращает Map<beerSlug, Persistence>. Пустая/одно-срезовая история → days=0, slices=1.
 */
export function persistenceForSeller(db: Database, seller: string): Map<string, Persistence> {
  // `|seller|` в середине ключа: beerSlug и seller не содержат '|', матч строгий после split.
  const rows = db.query(
    `SELECT item_key AS k, MIN(seen_at) AS f, MAX(seen_at) AS l, COUNT(DISTINCT seen_at) AS sl
       FROM price_snapshots WHERE item_key LIKE ? GROUP BY item_key`,
  ).all(`%|${seller}|%`) as { k: string; f: string; l: string; sl: number }[];
  const m = new Map<string, Persistence>();
  for (const r of rows) {
    const parts = r.k.split("|");
    if (parts.length < 3 || parts[1] !== seller) continue; // строгая проверка среднего поля
    const slug = parts[0]!;
    const p: Persistence = { days: daysBetween(r.f, r.l), slices: r.sl };
    const prev = m.get(slug);
    if (!prev || p.slices > prev.slices || p.days > prev.days) m.set(slug, p);
  }
  return m;
}

export type MarketAssessment = { bonus: number; reasons: string[] };

/**
 * Свести breadth + персистентность в бонус скоринга и человекочитаемые причины (AC#1/#2).
 * breadth=undefined (нет в карте) трактуем как 0 — сигнал просто не даём.
 */
export function marketSignal(breadth: number | undefined, persist: Persistence | undefined): MarketAssessment {
  const reasons: string[] = [];
  let bonus = 0;
  const b = breadth ?? 0;
  if (b >= BREADTH_BROAD) {
    bonus += BONUS_BROAD;
    reasons.push(`широко берут: ${b} точек (рыночный отбор)`);
  } else if (b === 1) {
    bonus += BONUS_RARE;
    reasons.push("есть только здесь — редкость");
  }
  if (persist && (persist.slices >= PERSIST_ANCHOR_SLICES || persist.days >= PERSIST_ANCHOR_DAYS)) {
    bonus += BONUS_ANCHOR;
    reasons.push(`якорь точки: держат ${persist.days}+ дн`);
  }
  return { bonus, reasons };
}
