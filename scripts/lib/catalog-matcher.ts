// Обобщённый матчер «листинг магазина → канон» (demand-слой). Используется ингестами всех
// магазинов (kraftbeer/craftbeer78/pivokom/…) поверх единого каталога: по сырому заголовку
// товара находит пивоварню (скан алиаса в названии) и сорт (isSameBeer внутри её сортов).
// Отделено от beerkontora-ингеста (тот матчит по handle-коллекциям), здесь матч по тексту.
//
//   const m = buildMatcher(db);
//   const hit = m.match('Пиво светлое "AF Brew Хазер" 0.5');  // → {breweryId, beerId, beerSlug, beerName} | brewery=null
//
// Анти-ложняк: алиас ≥ MIN_ALIAS симв., не из STOP (родовые слова, что заодно бывают именами
// пивоварен), матч по границе слова. Латинские короткие алиасы (≤4) — только при границе.
import { isSameBeer, slugify, normalizeName } from "@beer-log/catalog-core";
import { shopTitleToBeerName } from "@beer-log/parsers";
import { upsertBeer } from "@beer-log/store";
import type { Database } from "bun:sqlite";

const MIN_ALIAS = 4;
// родовые токены: бывают частью имени пивоварни, но как одиночный алиас дают мусорный матч
const STOP = new Set([
  "beer", "пиво", "craft", "крафт", "brew", "brewery", "brewing", "brewers", "brewer",
  "пивоварня", "бровар", "brovar", "project", "lab", "company", "бир", "пивовар",
  "light", "dark", "imperial", "империал", "milk", "stout", "porter", "lager", "ale",
  "ipa", "apa", "neipa", "double", "session", "wheat", "пшеничное", "светлое", "темное",
  "разливное", "бутылочное", "российское", "крафтовое",
]);

export type Match = {
  breweryId: string | null;
  breweryName?: string;
  beerId?: string;
  beerSlug?: string;
  beerName?: string;
  createdAuto?: boolean;
};

type BrewRow = { id: string; name: string; slug: string; aliases: string };
type BeerRow = { id: string; name: string; slug: string; aliases: string };

export function buildMatcher(db: Database, opts: { createAuto?: boolean } = {}) {
  const createAuto = opts.createAuto ?? false;
  const brews = db.query("SELECT id, name, slug, aliases FROM breweries").all() as BrewRow[];
  const beersByBrew = new Map<string, BeerRow[]>();
  const aliasesByBrew = new Map<string, string[]>();

  // индекс алиасов: {aliasNorm (translit без пробелов), tokens (кол-во слов), breweryId}.
  // Матч — точным равенством run'а из tokens подряд идущих токенов заголовка (см. match):
  // это переживает translit/пробелы и не ловит омонимы внутри слов ("milk" ≠ "milkshake").
  // Сортировка по длине aliasNorm убыв. — берём самый специфичный (длинный) матч.
  const aliasIndex: { aliasNorm: string; tokens: number; breweryId: string }[] = [];
  for (const b of brews) {
    const aliases = [b.name, ...(safeArr(b.aliases))];
    aliasesByBrew.set(b.id, aliases);
    for (const a of aliases) {
      const al = a.trim();
      if (al.length < MIN_ALIAS) continue;
      if (STOP.has(al.toLowerCase())) continue;
      const aliasNorm = normalizeName(al);
      if (aliasNorm.length < MIN_ALIAS) continue;
      const tokens = al.split(/[^\p{L}\p{N}]+/u).filter(Boolean).length || 1;
      aliasIndex.push({ aliasNorm, tokens, breweryId: b.id });
    }
  }
  aliasIndex.sort((x, y) => y.aliasNorm.length - x.aliasNorm.length);

  function beersOf(breweryId: string): BeerRow[] {
    let arr = beersByBrew.get(breweryId);
    if (!arr) {
      arr = db.query("SELECT id, name, slug, aliases FROM beers WHERE brewery_id = ?").all(breweryId) as BeerRow[];
      beersByBrew.set(breweryId, arr);
    }
    return arr;
  }

  function match(rawTitle: string): Match {
    // токены заголовка → их translit-нормализация (как у алиасов), с префиксными конкатенациями
    const rawTokens = rawTitle.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const tok = rawTokens.map((t) => normalizeName(t));
    // найти пивоварню: самый длинный алиас, чей run токенов точно совпал с run'ом заголовка
    let hit: { breweryId: string } | null = null;
    for (const a of aliasIndex) {
      for (let i = 0; i + a.tokens <= tok.length; i++) {
        let run = "";
        for (let j = 0; j < a.tokens; j++) run += tok[i + j];
        if (run === a.aliasNorm) { hit = { breweryId: a.breweryId }; break; }
      }
      if (hit) break;
    }
    if (!hit) return { breweryId: null };

    const brewery = brews.find((b) => b.id === hit!.breweryId)!;
    const aliases = aliasesByBrew.get(brewery.id) ?? [];
    const cands = beerNameCandidates(rawTitle, aliases);
    const beers = beersOf(brewery.id);
    for (const c of cands) {
      const beer = beers.find((b) => {
        const names = [b.name, ...safeArr(b.aliases)];
        return names.some((n) => isSameBeer(c, n));
      });
      if (beer) {
        return { breweryId: brewery.id, breweryName: brewery.name, beerId: beer.id, beerSlug: beer.slug, beerName: beer.name };
      }
    }
    if (createAuto && cands.length) {
      const name = cands[0]!;
      const beerId = upsertBeer(db, { name, breweryId: brewery.id, breweryNameRaw: brewery.name, status: "auto" });
      const slug = slugify(name);
      beersOf(brewery.id).push({ id: beerId, name, slug, aliases: "[]" });
      return { breweryId: brewery.id, breweryName: brewery.name, beerId, beerSlug: slug, beerName: name, createdAuto: true };
    }
    // пивоварня известна, сорт не распознан — вернём пивоварню без сорта
    return { breweryId: brewery.id, breweryName: brewery.name };
  }

  return { match, aliasCount: aliasIndex.length, breweryCount: brews.length };
}

function safeArr(s: string): string[] {
  try { const a = JSON.parse(s || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
}
// кандидаты имени сорта: и из части после "/", и из всего заголовка (как в beerkontora)
function beerNameCandidates(title: string, aliases: string[]): string[] {
  const sl = title.lastIndexOf("/");
  const halves = sl >= 0 ? [title.slice(sl + 1), title.slice(0, sl)] : [title];
  return [...new Set(halves.map((h) => shopTitleToBeerName(h, aliases)).filter((n) => n.length >= 2))];
}
