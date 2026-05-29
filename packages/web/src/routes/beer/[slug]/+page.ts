import { error } from "@sveltejs/kit";
import { beers, brewBySlug } from "$lib/catalog";
import type { EntryGenerator, PageLoad } from "./$types";

// уникальные slug привязанных сортов (slug уникален в рамках пивоварни; для v1 берём первый)
export const entries: EntryGenerator = () => {
  const seen = new Set<string>();
  return beers
    .filter((b) => b.brewerySlug && !seen.has(b.slug) && seen.add(b.slug))
    .map((b) => ({ slug: b.slug }));
};

export const load: PageLoad = ({ params }) => {
  const beer = beers.find((b) => b.slug === params.slug && b.brewerySlug);
  if (!beer) throw error(404, "Сорт не найден");
  const brewery = beer.brewerySlug ? brewBySlug.get(beer.brewerySlug) ?? null : null;
  const siblings = brewery ? beers.filter((b) => b.brewerySlug === brewery.slug && b.slug !== beer.slug) : [];
  return { beer, brewery, siblings };
};
