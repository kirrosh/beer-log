import type { Beer, PriceListing, Source } from "@beer-log/catalog-core";

export interface ParseResult {
  source: Source;
  beers: Partial<Beer>[];
  listings: PriceListing[];
  /** элементы, которые парсер не смог уверенно структурировать — на ревью */
  unparsed: { text: string; reason: string }[];
  fetchedAt: string;
}

export interface ParserHealth {
  ok: boolean;
  itemsSeen: number;
  itemsExtracted: number;
  errors: string[];
}

export interface Parser {
  /** стабильный id, напр. "telegram-web" */
  id: string;
  /** описание для агента самовосстановления */
  description: string;
  parse(target: string): Promise<ParseResult>;
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
