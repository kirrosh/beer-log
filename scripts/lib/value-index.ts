// value-index.ts — Value Index: ₽/литр листинга против медианы стиля (TASK-50, M5).
//
// Самая честная метрика выбора из УЖЕ имеющихся данных: ноль новых источников, чистая арифметика
// по price_listings. Для каждого style_category считаем медиану ₽-за-литр по всем продавцам, затем
// сравниваем конкретный листинг — «−18% к медиане стиля» (выгодно) / «переплата +40%». В отличие от
// средней, медиана устойчива к перекосу (стаут за 23k ₽/л не утянет порог). Используется в скоринге
// bot-recommend (бонус value + причина) и в интенте #9 «стоит ли брать» (bot-lookup).
//
//   const medians = styleValueMedians(db);
//   const sig = valueSignal({ price: 590, volumeMl: 450, category: "ipa" }, medians);
//   sig?.reason; // "−18% к медиане стиля" | "переплата +40% к медиане стиля" | null (в норме)
//
// Деградация (AC #4): пустой category/volume_ml/price ≤ 0 → valueSignal вернёт null, сигнал просто
// пропускается без ошибки. Категория без достаточной выборки (< VALUE_MIN_SAMPLE) в медианы не идёт.
import type { Database } from "bun:sqlite";

// Только рыночные листинги: веб-магазины (source_type IS NULL — легаси-загрузки) и untappd-меню
// баров. Будущие менее надёжные для цены типы (фото-полки, vision) сюда не попадают намеренно.
const VALUE_SOURCE_TYPES = ["web", "untappd-menu"];
// Меньше наблюдений — медиана стиля шумная, сигналу нельзя верить → категория пропускается.
export const VALUE_MIN_SAMPLE = 8;
// Пороги человекочитаемых вердиктов (подобраны по факт. распределению базы, см. TASK-50):
// дешевле медианы на ≥10% — «выгодно»; дороже на ≥25% — «переплата». Между — «справедливо», молчим.
const VALUE_THRESHOLD = -0.10;
const OVERPAY_THRESHOLD = 0.25;
// Перевод отклонения в бонус скоринга: −50% к медиане ≈ +0.3, +50% ≈ −0.3 (симметрично, с потолком).
const VALUE_BONUS_SCALE = 0.6;
const VALUE_BONUS_CAP = 0.3;

export type StyleMedian = { median: number; n: number };

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

function median(sorted: number[]): number {
  const n = sorted.length;
  const mid = n >> 1;
  return n % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Медиана ₽-за-литр по каждому style_category (AC #1). Один запрос, медиана считается в JS
 * (bun:sqlite без window-перцентилей). Категории с выборкой < VALUE_MIN_SAMPLE отбрасываются.
 */
export function styleValueMedians(db: Database): Map<string, StyleMedian> {
  const placeholders = VALUE_SOURCE_TYPES.map(() => "?").join(",");
  const rows = db.query(
    `SELECT b.style_category AS cat, pl.price * 1000.0 / pl.volume_ml AS rpl
       FROM price_listings pl
       JOIN beers b ON b.id = pl.beer_id
      WHERE pl.price > 0 AND pl.volume_ml > 0
        AND b.style_category IS NOT NULL AND b.style_category != 'unknown'
        AND (pl.source_type IS NULL OR pl.source_type IN (${placeholders}))`,
  ).all(...VALUE_SOURCE_TYPES) as { cat: string; rpl: number }[];

  const byCat = new Map<string, number[]>();
  for (const r of rows) {
    const arr = byCat.get(r.cat) ?? byCat.set(r.cat, []).get(r.cat)!;
    arr.push(r.rpl);
  }
  const out = new Map<string, StyleMedian>();
  for (const [cat, arr] of byCat) {
    if (arr.length < VALUE_MIN_SAMPLE) continue;
    arr.sort((a, b) => a - b);
    out.set(cat, { median: median(arr), n: arr.length });
  }
  return out;
}

export type ValueSignal = {
  rubPerLitre: number;   // ₽/литр этого листинга
  median: number;        // медиана стиля
  deviation: number;     // (rubPerLitre − median) / median; < 0 дешевле медианы
  bonus: number;         // вклад в score рекомендации, −VALUE_BONUS_CAP..+VALUE_BONUS_CAP
  kind: "value" | "overpay" | "fair";
  reason: string | null; // человекочитаемая фраза для reasons[]; null если цена в норме
};

export type ValueInput = { price: number | null; volumeMl: number | null; category: string | null };

/**
 * Сигнал value для одного листинга против медианы его стиля (AC #2/#4).
 * Возвращает null при нехватке данных (нет категории/объёма/цены, нет медианы стиля).
 */
export function valueSignal(input: ValueInput, medians: Map<string, StyleMedian>): ValueSignal | null {
  const { price, volumeMl, category } = input;
  if (!category || category === "unknown") return null;
  if (price == null || price <= 0 || volumeMl == null || volumeMl <= 0) return null;
  const sm = medians.get(category);
  if (!sm) return null;

  const rubPerLitre = (price * 1000) / volumeMl;
  const deviation = (rubPerLitre - sm.median) / sm.median;
  const bonus = clamp(-deviation * VALUE_BONUS_SCALE, -VALUE_BONUS_CAP, VALUE_BONUS_CAP);
  const pct = Math.round(Math.abs(deviation) * 100);

  let kind: ValueSignal["kind"] = "fair";
  let reason: string | null = null;
  if (deviation <= VALUE_THRESHOLD) {
    kind = "value";
    reason = `выгодно: −${pct}% к медиане стиля`;
  } else if (deviation >= OVERPAY_THRESHOLD) {
    kind = "overpay";
    reason = `переплата +${pct}% к медиане стиля`;
  }
  return { rubPerLitre: Math.round(rubPerLitre), median: Math.round(sm.median), deviation, bonus, kind, reason };
}
