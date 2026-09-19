/** Labels used by the first onboarding release are still present in saved profiles. */
export function normalizePersonality(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "Peace-seeking";
  const aliases: Record<string, string> = {
    "a thoughtful mix": "Ambivert",
    "lively and social": "Extrovert",
  };
  return aliases[value.trim().toLowerCase()] || value.trim();
}
