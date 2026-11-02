import { expect, test } from "bun:test";
import { uniqueStudyCards, validateBuckets } from "./organization";
import type { Card } from "./db";
const card = (id: number, word: string, known_count = 0): Card => ({ id, deck_id: 1, word, known_count, unknown_count: 0, translation: "hello", sentence: "", sentence_translation: "", notes: "", created_at: "" });
test("organization deduplicates equivalent words and retains the most studied copy", () => {
  expect(uniqueStudyCards([card(1, "café"), card(2, "CAFE\u0301", 8), card(3, "merci")]).map((item) => item.id)).toEqual([2, 3]);
});
test("AI must account for every word exactly once and invent no IDs", () => {
  const cards = [card(1, "bonjour"), card(2, "merci")];
  for (const ids of [[1], [1, 1, 2], [1, 2, 99]]) expect(() => validateBuckets([{ name: "Greetings", cardIds: ids }], cards)).toThrow();
  expect(validateBuckets([{ name: "Greetings", cardIds: [1, 2] }], cards)[0].cardIds).toEqual([1, 2]);
});
