import assert from "node:assert/strict";
import test from "node:test";
import { expandedSearchTerms, hasIntentExpansion, intentScore } from "./search.ts";

test("intent search maps vibe words to useful travel concepts", () => {
  assert.ok(intentScore("cool", ["forest waterfall trail"]) > 0);
  assert.ok(intentScore("modern", ["contemporary city cafes and shopping malls"]) > 0);
  assert.ok(intentScore("romantic", ["quiet backwater sunset for couples"]) > 0);
  assert.equal(intentScore("modern", ["remote wildlife rainforest"]), 0);
});

test("direct names remain stronger than related intent matches", () => {
  const exact = intentScore("Kochi", ["Kochi city"]);
  const related = intentScore("modern", ["Kochi city"]);
  assert.ok(exact > related);
});

test("multi-word search requires every idea to match", () => {
  assert.ok(intentScore("cool romantic", ["quiet hill views and sunsets"]) > 0);
  assert.equal(intentScore("cool romantic", ["forest trail"]), 0);
  assert.equal(hasIntentExpansion("Kochi"), false);
  assert.equal(hasIntentExpansion("cool"), true);
  assert.deepEqual(expandedSearchTerms("cool")[0][0], "cool");
});
