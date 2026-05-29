// Доменные модели каталога. См. vault/product/data-model.md
export type Id = string;

export type BeerStyleCategory =
  | "lager"
  | "pale-ale"
  | "ipa"
  | "stout-porter"
  | "wheat"
  | "sour-wild"
  | "belgian"
  | "specialty"
  | "non-beer"
  | "unknown";

export interface BeerStyle {
  /** канонический slug стиля, напр. "neipa" */
  slug: string;
  /** отображаемое имя, напр. "New England IPA" */
  name: string;
  category: BeerStyleCategory;
  /** исходная метка из источника — для провенанса */
  raw?: string;
}

export type SourceKind = "telegram" | "website" | "manual";

export interface SourceRef {
  sourceId?: Id;
  kind: SourceKind;
  url: string;
  /** исходный фрагмент текста для провенанса / переразбора */
  excerpt?: string;
  seenAt: string;
}

export interface Source {
  id: Id;
  kind: SourceKind;
  /** напр. telegram-хэндл @handle или домен сайта */
  handle: string;
  url: string;
  title?: string;
  active: boolean;
}

export interface Brewery {
  id: Id;
  name: string;
  slug: string;
  city?: string;
  country?: string; // по умолчанию RU
  aliases: string[];
  /** крафт vs мейнстрим — определяет фокус монетизации */
  segment: "craft" | "mainstream" | "unknown";
  links: SourceRef[];
  createdAt: string;
  updatedAt: string;
}

export interface Beer {
  id: Id;
  name: string;
  slug: string;
  breweryId?: Id;
  breweryNameRaw?: string;
  style?: BeerStyle;
  abv?: number;
  ibu?: number;
  description?: string;
  aliases: string[];
  sources: SourceRef[];
  /** статус модерации: почти весь ingest авто, человек валидирует */
  status: "auto" | "validated" | "rejected";
  createdAt: string;
  updatedAt: string;
}

export interface PriceListing {
  id: Id;
  beerId?: Id;
  beerNameRaw: string;
  price?: number;
  currency?: string; // RUB
  volumeMl?: number;
  format?: "bottle" | "can" | "keg" | "draft" | "unknown";
  sellerNameRaw?: string;
  source: SourceRef;
  seenAt: string;
}
