import assert from "node:assert/strict";
import test from "node:test";
import { destinations, discoveryItems } from "./data.ts";
import { destinationForDiscovery } from "./discovery.ts";
import { normalizePersonality } from "./preferences.ts";

test("district guide actions use the named locality rather than the district's first destination", () => {
  const target = (id) => destinationForDiscovery(discoveryItems.find((item) => item.id === id), destinations)?.id;
  assert.equal(target("food-thrissur"), "thrissur-city");
  assert.equal(target("food-fort-kochi"), "fort-kochi");
  assert.equal(target("shop-lulu-kochi"), "kochi-city");
  assert.equal(target("shop-hilite"), "kozhikode-city");
  assert.equal(target("food-thalassery"), undefined);
  assert.equal(target("shop-lulu-tvm"), undefined);
});

test("discovery names must match whole words in the same district", () => {
  const base = discoveryItems[0];
  assert.equal(destinationForDiscovery({ ...base, title: "Koching", locality: "" }, destinations), undefined);
  assert.equal(destinationForDiscovery({ ...base, title: "Munnar", locality: "" }, destinations), undefined);
});

test("legacy onboarding labels select and recommend the current travel styles", () => {
  assert.equal(normalizePersonality("A thoughtful mix"), "Ambivert");
  assert.equal(normalizePersonality("Lively and social"), "Extrovert");
  assert.equal(normalizePersonality("Introvert"), "Introvert");
  assert.equal(normalizePersonality(undefined), "Peace-seeking");
});
