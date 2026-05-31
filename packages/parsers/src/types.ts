import type { Beer, PriceListing, Source } from "@beer-log/catalog-core";

export interface ParseResult {
  source: Source;
  beers: Partial<Beer>[];
  listings: PriceListing[];
  /** элементы, которые парсер не смог уверенно структурировать — на ревью */
  unparsed: { text: string; reason: string }[];
  fetchedAt: string;
  /**
   * Сколько сортов реально заявлено источником (если он раскрывает счётчик), даже когда извлечь
   * удалось меньше из-за пагинации/гейта. Untappd: число из заголовка «N Beers» — позволяет честно
   * считать покрытие (извлечено/доступно), а не маскировать недобор статусом «capped». null — если
   * источник счётчик не отдаёт.
   */
  totalAvailable?: number | null;
}

export interface ParserHealth {
  ok: boolean;
  itemsSeen: number;
  itemsExtracted: number;
  errors: string[];
}

/** Опции разбора. Парсеры, которым они не нужны, их игнорируют. */
export interface ParseOptions {
  /**
   * Дочитывать все страницы списка, а не только первую (untappd: пагинация `more_beer` за
   * логин-гейтом). Требует валидной сессии (cookie). По умолчанию false — healthCheck и дешёвые
   * проверки берут только первую страницу.
   */
  paginate?: boolean;
  /** Cookie авторизованной сессии (Cookie-заголовок). Если не задан — парсер берёт из env/файла. */
  cookie?: string;
}

export interface Parser {
  /** стабильный id, напр. "telegram-web" */
  id: string;
  /** описание для агента самовосстановления */
  description: string;
  parse(target: string, opts?: ParseOptions): Promise<ParseResult>;
  /**
   * Самопроверка парсера. Возвращает health, чтобы агент мог решить,
   * «поплыл» ли парсер (изменилась разметка/структура источника) и нужен ли фикс.
   * См. vault/product/parser-architecture.md (самовосстановление).
   */
  healthCheck(target: string): Promise<ParserHealth>;
}

export class ParserDriftError extends Error {
  constructor(public readonly parserId: string, message: string) {
    super(message);
    this.name = "ParserDriftError";
  }
}
