import { describe, expect, test } from "bun:test";
import { uniqueIncoming, wordKey } from "./words";
import { parseImportPayload } from "./import";
import { reviewWords, wordKey as clientWordKey } from "../web/src/lib/words";

describe("vocabulary duplicate handling", () => {
  test("normalizes case, Unicode forms, and whitespace consistently on client and server", () => {
    for (const word of ["  BONJOUR ", "à\u00a0  bientôt", "cafe\u0301", "Ｃａｆé", "Straße"]) {
      expect(clientWordKey(word)).toBe(wordKey(word));
    }
    expect(wordKey("à\u00a0  bientôt")).toBe(wordKey("À bientôt"));
    expect(wordKey("cafe\u0301")).toBe(wordKey("CAFÉ"));
    expect(wordKey("Ｃａｆé")).toBe(wordKey("café"));
  });

  test("preserves meaningful accents and punctuation", () => {
    expect(wordKey("sí")).not.toBe(wordKey("si"));
    expect(wordKey("we're")).not.toBe(wordKey("were"));
  });

  test("reviews words against existing cards and repeats across multiple screenshots", () => {
    expect(reviewWords(" BONJOUR\nmerci\nMerci;à   bientôt,À bientôt\n", ["bonjour"])).toEqual({
      words: ["merci", "à   bientôt"], inSet: 1, repeated: 2, skipped: 3,
    });
  });

  test("all-existing lists have no new words", () => {
    expect(reviewWords("bonjour;Bonjour", ["BONJOUR"]).words).toEqual([]);
    expect(uniqueIncoming([" café", "cafe\u0301", " ", "merci"])).toEqual(["café", "merci"]);
  });

  test("JSON and pasted imports use the same duplicate rules", () => {
    const cards = parseImportPayload({ cards: [
      { word: "à bientôt", translation: "see you" },
      { word: "À   bientôt", translation: "duplicate" },
      { word: "cafe\u0301", translation: "coffee" },
      { word: "café", translation: "duplicate" },
    ] });
    expect(cards).toHaveLength(2);
    expect(parseImportPayload("bonjour\thello\nBONJOUR\thi")).toHaveLength(1);
  });
});
