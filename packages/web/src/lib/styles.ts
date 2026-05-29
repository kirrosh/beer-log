// Мета категорий стилей: русская подпись + CSS-переменная цвета.
// Цвет = и навигация, и мета-картина каталога одним взглядом (см. reference-site-ux).
export const CATEGORY_META: Record<string, { label: string; color: string }> = {
  ipa: { label: "IPA", color: "var(--c-ipa)" },
  "pale-ale": { label: "Пэйл-эль", color: "var(--c-pale-ale)" },
  lager: { label: "Лагер", color: "var(--c-lager)" },
  "stout-porter": { label: "Стаут / Портер", color: "var(--c-stout-porter)" },
  "sour-wild": { label: "Сауэр / Дикие", color: "var(--c-sour-wild)" },
  wheat: { label: "Пшеничное", color: "var(--c-wheat)" },
  belgian: { label: "Бельгийское", color: "var(--c-belgian)" },
  specialty: { label: "Спешелти", color: "var(--c-specialty)" },
  "non-beer": { label: "Не пиво", color: "var(--c-non-beer)" },
  unknown: { label: "Прочее", color: "var(--c-unknown)" },
};

export function catMeta(category: string | null | undefined): { label: string; color: string } {
  return CATEGORY_META[category ?? "unknown"] ?? CATEGORY_META.unknown;
}

export const LINK_LABEL: Record<string, string> = {
  website: "Сайт",
  telegram: "Telegram",
  vk: "VK",
  untappd: "Untappd",
};
