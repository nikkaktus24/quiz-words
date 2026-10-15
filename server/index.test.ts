import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { wordKey } from "./words";
import type { Card, Deck } from "./db";

// Exercise the real HTTP handlers without MongoDB or paid AI requests.
const deck: Deck = { id: 7, user_id: 1, name: "Everyday French", source_lang: "fr", target_lang: "en", created_at: "2026-10-15" };
const original: Card = { id: 1, deck_id: 7, word: "bonjour", translation: "hello", sentence: "Bonjour, tout le monde.", sentence_translation: "Hello, everyone.", notes: "", known_count: 8, unknown_count: 2, created_at: "2026-10-15" };
let cards: Card[] = [];
let generatedWords: string[] = [];
let extractCalls = 0;

mock.module("./db", () => ({
  ...Object.fromEntries(["addShare", "createDeck", "createRule", "createUser", "deleteCardById", "deleteDeck", "deleteRule", "findRuleById", "findUserByUsername", "incrementCheckReview", "incrementReview", "insertRuleChecks", "listRuleChecks", "listStudyCards", "listUserRules", "removeShare"].map((name) => [name, async () => null])),
  findUserById: async () => ({ id: 1, username: "demo" }),
  canAccessDeck: async () => true,
  findDeckById: async (id: number) => id === 7 ? { ...deck } : null,
  updateDeck: async (_id: number, patch: Partial<Deck>) => Object.assign(deck, patch),
  listShares: async () => [],
  listUserDecks: async () => [{ ...deck, card_count: cards.length, is_owner: true }],
  listCards: async (_id: number, order: string) => [...cards].sort((a, b) => order === "asc" ? a.id - b.id : b.id - a.id),
  listCardWords: async () => cards.map((card) => card.word),
  insertCard: async (_id: number, input: { word: string; translation: string; sentence?: string; sentenceTranslation?: string }) => {
    if (cards.some((card) => wordKey(card.word) === wordKey(input.word))) return false;
    cards.push({ ...original, id: Math.max(0, ...cards.map((card) => card.id)) + 1, ...input, sentence: input.sentence || "", sentence_translation: input.sentenceTranslation || "", known_count: 0, unknown_count: 0 });
    return true;
  },
  deleteCardsByIds: async (ids: number[]) => { cards = cards.filter((card) => !ids.includes(card.id)); },
}));
mock.module("./ai", () => ({
  generateRule: async () => ({}),
  synthesizeSpeech: async () => new Uint8Array(64),
  generateCards: async ({ words }: { words: string[] }) => {
    generatedWords = words;
    return { sourceLang: "fr", cards: words.map((word) => ({ word, translation: `Translation of ${word}` })) };
  },
  extractWordsFromImage: async () => { extractCalls++; return { words: ["bonjour", "merci", "à bientôt"], sourceLang: "fr" }; },
}));

process.env.PORT = "0";
process.env.HOST = "127.0.0.1";
const { server } = await import("./index");
const base = `http://127.0.0.1:${server.port}`;
afterAll(() => server.stop(true));
beforeEach(() => { cards = [{ ...original }]; generatedWords = []; extractCalls = 0; });

function post(path: string, body: unknown) {
  return fetch(`${base}/api/decks/7/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

test("adding words appends to the existing set and keeps study progress", async () => {
  const res = await post("generate?userId=1", { words: [" BONJOUR ", "merci", "Merci", "à   bientôt", "À bientôt"] });
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.added).toBe(2);
  expect(data.skipped).toBe(3);
  expect(data.deck.id).toBe(7);
  expect(data.cards).toHaveLength(3);
  expect(data.cards.find((card: Card) => card.id === 1)).toEqual(original);
  expect(generatedWords).toEqual(["merci", "à   bientôt"]);
});

test("all-existing words skip the AI call", async () => {
  const data = await (await post("generate?userId=1", { words: ["BONJOUR", "bonjour"] })).json();
  expect(data.added).toBe(0);
  expect(data.skipped).toBe(2);
  expect(generatedWords).toEqual([]);
});

test("an import appends only novel words", async () => {
  const data = await (await post("import", { userId: 1, json: [["BONJOUR", "hello"], ["merci", "thanks"], ["Merci", "duplicate"]] })).json();
  expect(data.added).toBe(1);
  expect(data.skipped).toBe(1);
  expect(cards).toHaveLength(2);
  expect(cards[0]).toEqual(original);
});

test("legacy duplicates keep the copy with the most study progress", async () => {
  cards.push({ ...original, id: 2, word: " BONJOUR ", known_count: 15 });
  const data = await (await post("dedupe?userId=1", {})).json();
  expect(data.removed).toBe(1);
  expect(data.cards[0].id).toBe(2);
  expect(data.cards[0].known_count).toBe(15);
});

test("word generation validates the payload and refuses silent truncation", async () => {
  expect((await post("generate?userId=1", { words: [3] })).status).toBe(400);
  expect((await post("generate?userId=1", { words: Array.from({ length: 41 }, (_, i) => `word${i}`) })).status).toBe(400);
  expect(generatedWords).toEqual([]);
});

test("write operations require the set owner", async () => {
  for (const path of ["generate", "import", "dedupe", "extract-photo"]) {
    expect((await post(path, { words: ["merci"], json: [["merci", "thanks"]] })).status).toBe(403);
    expect((await post(`${path}?userId=2`, { words: ["merci"], json: [["merci", "thanks"]] })).status).toBe(403);
  }
});

test("photos return words for review without inserting cards", async () => {
  const form = new FormData();
  form.append("image", new File(["test image"], "notes.png", { type: "image/png" }));
  const res = await fetch(`${base}/api/decks/7/extract-photo?userId=1`, { method: "POST", body: form });
  expect(res.status).toBe(200);
  expect((await res.json()).words).toEqual(["bonjour", "merci", "à bientôt"]);
  expect(cards).toHaveLength(1);
  expect(extractCalls).toBe(1);
});

test("empty, unsupported, and oversized images are rejected before AI", async () => {
  for (const file of [new File([], "empty.png", { type: "image/png" }), new File(["text"], "text.txt", { type: "text/plain" }), new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.png", { type: "image/png" })]) {
    const form = new FormData();
    form.append("image", file);
    expect((await fetch(`${base}/api/decks/7/extract-photo?userId=1`, { method: "POST", body: form })).status).toBe(400);
  }
  expect(extractCalls).toBe(0);
});
