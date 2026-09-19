import type { Destination, DiscoveryItem } from "./data";

/** A district can contain distant destinations, so only match a named locality. */
export function destinationForDiscovery(
  item: DiscoveryItem,
  places: Destination[],
): Destination | undefined {
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const context = ` ${normalize(`${item.title} ${item.locality}`)} `;
  return places
    .filter((place) => place.district === item.district)
    .map((place) => {
      const names = [place.name];
      if (place.id === "kochi-city") names.push("Kochi");
      if (place.id === "kozhikode-city") names.push("Calicut");
      const matchLength = Math.max(...names.map((name) => {
        const normalized = normalize(name);
        return context.includes(` ${normalized} `) ? normalized.length : 0;
      }));
      return { place, matchLength };
    })
    .filter(({ matchLength }) => matchLength > 0)
    .sort((a, b) => b.matchLength - a.matchLength)[0]?.place;
}
