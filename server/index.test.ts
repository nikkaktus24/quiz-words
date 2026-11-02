import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { wordKey } from "./words";
import type { OrganizationDraft, Card, Deck } from "./db";

// Exercise the real HTTP handlers without MongoDB or paid AI requests.
const deck: Deck = { id: 7, user_id: 1, name: "Everyday French", source_lang: "fr", target_lang: "en", created_at: "2026-10-15" };
const original: Card = { id: 1, deck_id: 7, word: "bonjour", translation: "hello", sentence: "Bonjour, tout le monde.", sentence_translation: "Hello, everyone.", notes: "", known_count: 8, unknown_count: 2, created_at: "2026-10-15" };
let cards: Card[] = [];
let generatedWords: string[] = [];
let extractCalls = 0;
let draft: OrganizationDraft | null = null;
let copies: Array<{ deckId: number; card: Card }> = [];
let createdCount = 0;
let groups: Array<{ id: number; user_id: number; name: string; deck_ids: number[] }> = [];

mock.module("./db", () => ({
  ...Object.fromEntries(["addShare", "createDeck", "createRule", "createUser", "deleteCardById", "deleteDeck", "deleteRule", "findRuleById", "findUserByUsername", "incrementCheckReview", "incrementReview", "insertRuleChecks", "listRuleChecks", "listStudyCards", "listUserRules", "removeShare"].map((name) => [name, async () => null])),
  saveOrganizationDraft: async (value: OrganizationDraft) => { draft = value; },
  findOrganizationDraft: async (id: string, userId: number) => draft?.id === id && draft.user_id === userId ? draft : null,
  claimOrganizationDraft: async (id: string, userId: number, status: "applying" | "rejected") => { if (draft?.id !== id || draft.user_id !== userId || draft.status !== "pending") return null; draft.status = status; return draft; },
  finishOrganizationDraft: async (_id: string, status: "applied" | "failed", ids: number[]) => { if (draft) { draft.status = status; draft.result_ids = ids; } },
  copyStudyCard: async (deckId: number, card: Card) => { copies.push({ deckId, card }); },
  createDeck: async (input: { name: string }) => ({ ...deck, id: 100 + ++createdCount, name: input.name }),
  listGroups: async (userId: number) => groups.filter((group) => group.user_id === userId),
  createGroup: async (userId: number, name: string) => { const group = { id: 1, user_id: userId, name, deck_ids: [] as number[] }; groups.push(group); return group; },
  updateGroup: async (id: number, userId: number, patch: { name?: string; deck_ids?: number[] }) => { const group = groups.find((item) => item.id === id && item.user_id === userId); return group ? Object.assign(group, patch) : null; },
  deleteGroup: async (id: number, userId: number) => { const before = groups.length; groups = groups.filter((item) => item.id !== id || item.user_id !== userId); return groups.length < before; },
  findUserById: async () => ({ id: 1, username: "demo" }),
  canAccessDeck: async () => true,
  findDeckById: async (id: number) => id === 7 || id === 8 ? { ...deck, id } : id === 9 ? { ...deck, id, source_lang: "es" } : null,
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
  organizeWords: async (items: Card[]) => [{ name: "Greetings", reason: "Useful greetings", cardIds: items.map((card) => card.id) }],
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
beforeEach(() => { cards = [{ ...original }]; generatedWords = []; extractCalls = 0; groups = []; draft = null; copies = []; createdCount = 0; });

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


test("groups organize accessible sets and remain private to the owner", async () => {
  const send = (path: string, method: string, body: unknown) => fetch(`${base}/api/groups${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  expect((await send("", "POST", { userId: 1, name: "French" })).status).toBe(201);
  expect((await send("/1", "PATCH", { userId: 1, deckIds: [7, 7] })).status).toBe(200);
  expect(groups[0].deck_ids).toEqual([7]);
  expect((await send("/1", "PATCH", { userId: 1, deckIds: [999] })).status).toBe(403);
  expect((await send("/1", "DELETE", { userId: 2 })).status).toBe(404);
  expect((await send("/1", "DELETE", { userId: 1 })).status).toBe(200);
  expect(cards).toHaveLength(1);
});

function organization(path: string, body: unknown) {
  return fetch(`${base}/api/organization/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
test("AI preview is read-only; rejecting creates no sets", async () => {
  const preview = await (await organization("preview", { userId: 1, deckIds: [7], mode: "ai" })).json();
  expect(preview.sets[0].words).toEqual(["bonjour"]);
  expect(createdCount).toBe(0);
  expect((await organization(`${preview.id}/reject`, { userId: 1 })).status).toBe(200);
  expect((await organization(`${preview.id}/approve`, { userId: 1 })).status).toBe(409);
  expect(copies).toHaveLength(0);
});
test("approval copies progress, preserves originals, and cannot apply twice", async () => {
  const preview = await (await organization("preview", { userId: 1, deckIds: [7], mode: "ai" })).json();
  expect((await organization(`${preview.id}/approve`, { userId: 2 })).status).toBe(404);
  const first = await (await organization(`${preview.id}/approve`, { userId: 1 })).json();
  const second = await (await organization(`${preview.id}/approve`, { userId: 1 })).json();
  expect(first.deckIds).toEqual(second.deckIds);
  expect(createdCount).toBe(1);
  expect(copies[0].card.known_count).toBe(8);
  expect(cards[0]).toEqual(original);
});
test("organization refuses invalid mode, missing sets, and a one-set merge", async () => {
  expect((await organization("preview", { userId: 1, deckIds: [], mode: "ai" })).status).toBe(400);
  expect((await organization("preview", { userId: 1, deckIds: [7], mode: "delete" })).status).toBe(400);
  expect((await organization("preview", { userId: 1, deckIds: [7], mode: "merge" })).status).toBe(400);
});

test("merge previews duplicates and creates a single set only after approval", async () => {
  const response = await organization("preview", { userId: 1, deckIds: [7, 8], mode: "merge", name: "Combined French" });
  expect(response.status).toBe(200);
  const preview = await response.json();
  expect(preview.duplicates).toBe(1);
  expect(preview.sets).toHaveLength(1);
  expect(preview.sets[0].name).toBe("Combined French");
  expect(createdCount).toBe(0);
  expect((await organization(`${preview.id}/approve`, { userId: 1 })).status).toBe(200);
  expect(copies).toHaveLength(1);
  expect(cards).toHaveLength(1);
});
test("organization rejects inaccessible sets and mixed languages", async () => {
  expect((await organization("preview", { userId: 1, deckIds: [7, 999], mode: "merge" })).status).toBe(403);
  expect((await organization("preview", { userId: 1, deckIds: [7, 9], mode: "merge" })).status).toBe(400);
});
