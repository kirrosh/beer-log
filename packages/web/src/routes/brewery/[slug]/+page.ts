import { error } from "@sveltejs/kit";
import { breweries, brewBySlug, beersOf, styleDistribution } from "$lib/catalog";
import type { EntryGenerator, PageLoad } from "./$types";

export const entries: EntryGenerator = () => breweries.map((b) => ({ slug: b.slug }));

export const load: PageLoad = ({ params }) => {
  const brewery = brewBySlug.get(params.slug);
  if (!brewery) throw error(404, "Пивоварня не найдена");
  const list = beersOf(brewery.slug).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return { brewery, beers: list, dist: styleDistribution(list) };
};
