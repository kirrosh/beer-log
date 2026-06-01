import type { Source } from "@beer-log/catalog-core";

/**
 * Стартовый список Telegram-источников (найдено ресёрчем 2026-05-29).
 * ВНИМАНИЕ: пока это в основном медиа/индустриальные каналы, а не прайс-листы
 * боттлшопов. Прайсовые каналы нужно ещё найти — см. vault/research/telegram-sources.md
 */
/**
 * Вид ОФИЦ. источника пивоварни по host `source_url` из `beer_sources` (провенанс, task-21).
 * Магазины/бары сюда НЕ попадают: shop-ингест пишет только в `price_listings`, не в
 * `beer_sources` — значит любая строка в `beer_sources` уже редакционная/офиц. (проверено).
 * Неизвестный домен трактуем как сайт пивоварни (catch-all), а не как магазин.
 */
export type SourceChannel = "untappd" | "telegram" | "vk" | "website";

export function sourceChannelOfUrl(url: string): SourceChannel | null {
  let host: string;
  try { host = new URL(url).host.replace(/^www\./, ""); } catch { return null; }
  if (host === "untappd.com") return "untappd";
  if (host === "t.me" || host === "telegram.me") return "telegram";
  if (host === "vk.com" || host === "m.vk.com") return "vk";
  return "website";
}

export const SEED_TELEGRAM_SOURCES: Source[] = [
  { id: "@pivnoe_delo", kind: "telegram", handle: "@pivnoe_delo",
    url: "https://t.me/s/pivnoe_delo", title: "Пивное дело (индустрия/аналитика)", active: true },
  { id: "@beervaria", kind: "telegram", handle: "@beervaria",
    url: "https://t.me/s/beervaria", title: "Бирвария (магазины пива)", active: true },
  { id: "@moronityandbeer", kind: "telegram", handle: "@moronityandbeer",
    url: "https://t.me/s/moronityandbeer", title: "Слабоумие, отвага и крафтовое пиво", active: true },
  { id: "@prostopropivo", kind: "telegram", handle: "@prostopropivo",
    url: "https://t.me/s/prostopropivo", title: "Просто Про Пиво", active: true },
];
