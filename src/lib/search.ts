const intentVocabulary: Record<string, string[]> = {
  cool: ["hill", "mountain", "forest", "waterfall", "rainforest", "breeze", "cool weather", "scenic"],
  chill: ["quiet", "slow", "peace", "beach", "cafe", "sunset", "relaxed"],
  modern: ["mall", "contemporary", "cafe", "gallery", "design", "nightlife", "business"],
  romantic: ["couple", "sunset", "backwater", "beach", "lake", "cliff", "quiet", "views"],
  fun: ["adventure", "activity", "entertainment", "drive", "trek", "friends", "beach"],
  family: ["family-friendly", "children", "mall", "easy", "beach", "eco-tourism"],
  foodie: ["food", "cafe", "biryani", "seafood", "snacks", "restaurant", "local food"],
  cheap: ["budget", "free", "low-cost", "market", "walk"],
  affordable: ["budget", "free", "low-cost", "market", "homestay"],
  luxury: ["luxury", "resort", "wellness", "waterfront", "estate"],
  hidden: ["quiet", "low crowds", "village", "forest", "local"],
  rainy: ["mall", "museum", "gallery", "cafe", "indoor", "shopping"],
  nature: ["forest", "waterfall", "wildlife", "hill", "backwater", "beach"],
  culture: ["heritage", "history", "art", "temple", "market", "traditional"],
};

function normalize(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function expandedSearchTerms(query: string) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return words.map((word) => [word, ...(intentVocabulary[word] || [])]);
}

export function intentScore(query: string, fields: Array<string | undefined>) {
  const groups = expandedSearchTerms(query);
  if (!groups.length) return 1;
  const haystack = normalize(fields.filter(Boolean).join(" "));
  let score = 0;
  for (const [original, ...related] of groups) {
    if (haystack.includes(original)) {
      score += 12;
      continue;
    }
    const relatedMatches = related.filter((term) => haystack.includes(normalize(term)));
    if (!relatedMatches.length) return 0;
    score += Math.min(8, relatedMatches.length * 2);
  }
  return score;
}

export function hasIntentExpansion(query: string) {
  return expandedSearchTerms(query).some(([, ...related]) => related.length > 0);
}
