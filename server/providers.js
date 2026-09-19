/** Replaceable provider boundary: integrations never substitute fictional live data. */
export const DATA_SOURCES = Object.freeze({
  LIVE: 'LIVE', ESTIMATED: 'ESTIMATED', HISTORICAL: 'HISTORICAL',
  USER_PROVIDED: 'USER-PROVIDED', RECOMMENDATION: 'AI-GENERATED RECOMMENDATION',
  EXAMPLE: 'EXAMPLE', UNAVAILABLE: 'UNAVAILABLE',
});

export function unavailable(provider, reason = 'A provider has not been connected.') {
  return { provider, provenance: DATA_SOURCES.UNAVAILABLE, available: false, data: null, updatedAt: null, reason };
}

/** Each adapter returns {provider, provenance, available, data, updatedAt}. */
export function createProviders(overrides = {}) {
  const absent = (name) => ({ configured: false, async get() { return unavailable(name); } });
  return {
    maps: absent('maps'), places: absent('places'), weather: absent('weather'),
    traffic: absent('traffic'), currency: absent('currency'), ai: absent('ai'),
    ...overrides,
  };
}

/** User-entered inputs produce estimates, never telemetry or live fuel prices. */
export function estimateFuel({ distanceKm, mileage, pricePerLitre, tankCapacity, fuelLevel }) {
  if (![distanceKm, mileage, pricePerLitre, tankCapacity, fuelLevel].every(Number.isFinite)
      || distanceKm < 0 || mileage <= 0 || pricePerLitre < 0 || tankCapacity <= 0
      || fuelLevel < 0 || fuelLevel > 100) throw new Error('Invalid fuel calculation inputs.');
  const litres = distanceKm / mileage;
  return {
    provenance: DATA_SOURCES.ESTIMATED,
    inputProvenance: DATA_SOURCES.USER_PROVIDED,
    litres, cost: litres * pricePerLitre, remainingRangeKm: tankCapacity * fuelLevel / 100 * mileage,
    explanation: 'Estimate from entered mileage, fuel level and price; driving conditions can change consumption.',
  };
}
