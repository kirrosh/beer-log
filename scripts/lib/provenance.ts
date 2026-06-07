// Достоверность факта о наличии на точке = провенанс источника + возраст наблюдения.
// НЕ пиксельная геометка (веб-платформы стрипают EXIF — для веб-фото GPS физически нет), а:
//   source_type — ОТКУДА факт (сам видел / фото владельца / прислал юзер / открытое веб-фото);
//   observed_at — КОГДА наблюдалось (для веб-фото = дата поста, НЕ дата ингеста — иначе старьё
//                 выдаётся за свежак);
//   → tier      — выводимый уровень доверия для выдачи у полки и витрины (зачаток TASK-35).
//
// Привязка наблюдения к ТОЧКЕ идёт через контекст источника (пост этого филиала / карточка этого
// адреса), а не через GPS. Поэтому web-photo по умолчанию низкий tier: его легко спутать с другим
// филиалом сети или с прошлогодним ассортиментом.

export type SourceType = "owner" | "self" | "user" | "web-photo" | "shop-web" | "map-menu" | "untappd-menu" | "ai-vision";
export type TierLevel = "high" | "medium" | "low";

export type Provenance = {
  sourceType: SourceType | null; // null = унаследованный веб-каталог (как shop-web)
  observedAt: string;            // YYYY-MM-DD — дата наблюдения
};

// базовое доверие к каналу (до поправки на возраст)
const BASE: Record<SourceType, number> = {
  owner: 0.95, self: 0.9, user: 0.85, "untappd-menu": 0.75, "shop-web": 0.7, "map-menu": 0.65,
  "ai-vision": 0.6, "web-photo": 0.5,
};
const STALE_DAYS = 180;   // старше — «возможно неактуально»
const DEAD_DAYS = 365;    // старше — низкий tier независимо от источника

/** Можно ли поднять провенанс from→to — только усиление (BASE строго растёт), не понижение.
 *  Гард для upgradeProvenance: ai-vision(0.6)→self(0.9) ✓, self→ai-vision ✗. NULL = shop-web. */
export function canUpgrade(from: SourceType | null, to: SourceType): boolean {
  return BASE[to] > (BASE[from ?? "shop-web"] ?? 0.6);
}

/** Дефолт «что поднимаем до self после личного подтверждения у полки»: AI-распознанное с фото
 *  и слабое открытое веб-фото. owner/user/shop-web/*-menu не трогаем — иное доверие, не «я видел». */
export const UPGRADE_TO_SELF_FROM: SourceType[] = ["ai-vision", "web-photo"];

export function ageDays(observedAt: string, now: Date = new Date()): number {
  const t = Date.parse(observedAt + "T00:00:00Z");
  if (Number.isNaN(t)) return Infinity;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

/** Лёгкая свежесть наблюдения для выдачи у полки: возраст в днях + флаги «возможно/точно устарело». */
export function freshness(observedAt: string, now: Date = new Date()): {
  ageDays: number; stale: boolean; dead: boolean;
} {
  const age = ageDays(observedAt, now);
  return { ageDays: Number.isFinite(age) ? age : -1, stale: age >= STALE_DAYS, dead: age >= DEAD_DAYS };
}

/** Уровень достоверности + человекочитаемая метка для выдачи. */
export function tier(p: Provenance, now: Date = new Date()): {
  level: TierLevel; score: number; label: string; stale: boolean;
} {
  const st = p.sourceType ?? "shop-web";
  const age = ageDays(p.observedAt, now);
  const stale = age >= STALE_DAYS;
  let score = BASE[st] ?? 0.6;
  if (age >= DEAD_DAYS) score = Math.min(score, 0.4);
  else if (stale) score -= 0.2;

  const level: TierLevel = score >= 0.8 ? "high" : score >= 0.55 ? "medium" : "low";
  return { level, score: Math.round(score * 100) / 100, label: label(st, p.observedAt, stale), stale };
}

function label(st: SourceType, observedAt: string, stale: boolean): string {
  const src = {
    owner: "подтверждено владельцем",
    self: "проверено на месте",
    user: "фото от пользователя",
    "shop-web": "веб-каталог",
    "untappd-menu": `по меню заведения · Untappd (${observedAt})`,
    "map-menu": `по меню на картах (${observedAt})`,
    "ai-vision": `распознано с фото на месте (${observedAt})`,
    "web-photo": `по открытому фото (${observedAt})`,
  }[st];
  return stale ? `${src} · возможно неактуально` : src;
}
