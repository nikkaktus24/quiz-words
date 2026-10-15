import { MongoClient, type Collection, type Db } from "mongodb";
import { wordKey } from "./words";

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const dbName = process.env.MONGODB_DB || "quiz";

type Counter = { _id: string; seq: number };
type UserDoc = { id: number; username: string; username_lc: string; created_at: string };
type DeckDoc = {
  id: number;
  user_id: number;
  name: string;
  source_lang: string;
  target_lang: string;
  created_at: string;
};
type CardDoc = {
  id: number;
  deck_id: number;
  word: string;
  word_lc: string;
  translation: string;
  sentence: string;
  sentence_translation: string;
  notes: string;
  known_count: number;
  unknown_count: number;
  created_at: string;
};
type ShareDoc = { deck_id: number; user_id: number; created_at: string };
type RuleDoc = {
  id: number;
  user_id: number;
  title: string;
  markup: string;
  prompt: string;
  created_at: string;
};
type CheckDoc = {
  id: number;
  rule_id: number;
  kind: "mcq" | "write" | "tf";
  prompt: string;
  answer: string;
  options: string[];
  explanation: string;
  known_count: number;
  unknown_count: number;
  created_at: string;
};

const mongo = new MongoClient(uri);
let database: Db;
let counters: Collection<Counter>;
let users: Collection<UserDoc>;
let decks: Collection<DeckDoc>;
let cards: Collection<CardDoc>;
let shares: Collection<ShareDoc>;
let rules: Collection<RuleDoc>;
let checks: Collection<CheckDoc>;

async function waitForDb() {
  const deadline = Date.now() + 120_000;
  let lastError: unknown;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      await mongo.connect();
      await mongo.db(dbName).command({ ping: 1 });
      if (attempt > 1) console.log("[quiz-words] MongoDB connected", { uri, attempt });
      return;
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[quiz-words] waiting for MongoDB", { uri, attempt, message });
      await Bun.sleep(Math.min(3000, 250 * attempt));
    }
  }
  throw new Error(
    `Could not connect to MongoDB at ${uri}: ${lastError instanceof Error ? lastError.message : lastError}`,
  );
}

await waitForDb();
database = mongo.db(dbName);
counters = database.collection("counters");
users = database.collection("users");
decks = database.collection("decks");
cards = database.collection("cards");
shares = database.collection("deck_shares");
rules = database.collection("rules");
checks = database.collection("rule_checks");

await users.createIndex({ id: 1 }, { unique: true });
await users.createIndex({ username_lc: 1 }, { unique: true });
await decks.createIndex({ id: 1 }, { unique: true });
await decks.createIndex({ user_id: 1 });
await cards.createIndex({ id: 1 }, { unique: true });
await cards.createIndex({ deck_id: 1, word_lc: 1 }, { unique: true });
await cards.createIndex({ deck_id: 1, id: -1 });
await shares.createIndex({ deck_id: 1, user_id: 1 }, { unique: true });
await shares.createIndex({ user_id: 1 });
await rules.createIndex({ id: 1 }, { unique: true });
await rules.createIndex({ user_id: 1 });
await checks.createIndex({ id: 1 }, { unique: true });
await checks.createIndex({ rule_id: 1 });

function now() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

async function nextId(name: string) {
  const row = await counters.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  return row?.seq ?? 1;
}

function publicUser(doc: UserDoc): User {
  return { id: doc.id, username: doc.username, created_at: doc.created_at };
}

function publicDeck(doc: DeckDoc): Deck {
  return {
    id: doc.id,
    user_id: doc.user_id,
    name: doc.name,
    source_lang: doc.source_lang,
    target_lang: doc.target_lang,
    created_at: doc.created_at,
  };
}

function publicCard(doc: CardDoc): Card {
  return {
    id: doc.id,
    deck_id: doc.deck_id,
    word: doc.word,
    translation: doc.translation,
    sentence: doc.sentence,
    sentence_translation: doc.sentence_translation,
    notes: doc.notes,
    known_count: doc.known_count,
    unknown_count: doc.unknown_count,
    created_at: doc.created_at,
  };
}

export async function findUserById(id: number) {
  const doc = await users.findOne({ id });
  return doc ? publicUser(doc) : null;
}

export async function findUserByUsername(username: string) {
  const doc = await users.findOne({ username_lc: username.trim().toLowerCase() });
  return doc ? publicUser(doc) : null;
}

export async function createUser(username: string) {
  const trimmed = username.trim();
  const doc: UserDoc = {
    id: await nextId("users"),
    username: trimmed,
    username_lc: trimmed.toLowerCase(),
    created_at: now(),
  };
  try {
    await users.insertOne(doc);
    return publicUser(doc);
  } catch (err) {
    if (isDuplicate(err)) {
      const existing = await findUserByUsername(trimmed);
      if (existing) return existing;
    }
    throw err;
  }
}

export async function listUserDecks(userId: number) {
  const shareRows = await shares.find({ user_id: userId }).toArray();
  const sharedIds = shareRows.map((s) => s.deck_id);
  const filter = sharedIds.length
    ? { $or: [{ user_id: userId }, { id: { $in: sharedIds } }] }
    : { user_id: userId };
  const docs = await decks.find(filter).sort({ created_at: -1, id: -1 }).toArray();
  const ownerIds = [...new Set(docs.map((d) => d.user_id))];
  const owners = await users.find({ id: { $in: ownerIds } }).toArray();
  const ownerMap = new Map(owners.map((u) => [u.id, u.username]));
  const deckIds = docs.map((d) => d.id);
  const counts = deckIds.length
    ? await cards
        .aggregate<{ _id: number; n: number }>([{ $match: { deck_id: { $in: deckIds } } }, { $group: { _id: "$deck_id", n: { $sum: 1 } } }])
        .toArray()
    : [];
  const countMap = new Map(counts.map((c) => [c._id, c.n]));
  return docs.map((d) => {
    const shared = d.user_id !== userId;
    return {
      ...publicDeck(d),
      owner_username: ownerMap.get(d.user_id),
      shared,
      is_owner: !shared,
      card_count: countMap.get(d.id) ?? 0,
    } satisfies Deck;
  });
}

export async function createDeck(input: {
  userId: number;
  name: string;
  sourceLang: string;
  targetLang: string;
}) {
  const doc: DeckDoc = {
    id: await nextId("decks"),
    user_id: input.userId,
    name: input.name,
    source_lang: input.sourceLang,
    target_lang: input.targetLang,
    created_at: now(),
  };
  await decks.insertOne(doc);
  return publicDeck(doc);
}

export async function findDeckById(id: number) {
  const doc = await decks.findOne({ id });
  return doc ? publicDeck(doc) : null;
}

export async function updateDeck(
  id: number,
  patch: { name?: string; source_lang?: string; target_lang?: string },
) {
  const $set: Partial<DeckDoc> = {};
  if (patch.name !== undefined) $set.name = patch.name;
  if (patch.source_lang !== undefined) $set.source_lang = patch.source_lang;
  if (patch.target_lang !== undefined) $set.target_lang = patch.target_lang;
  await decks.updateOne({ id }, { $set });
  return findDeckById(id);
}

export async function deleteDeck(id: number) {
  await cards.deleteMany({ deck_id: id });
  await shares.deleteMany({ deck_id: id });
  await decks.deleteOne({ id });
}

export async function listCards(deckId: number, order: "asc" | "desc" = "desc") {
  const docs = await cards.find({ deck_id: deckId }).sort({ id: order === "asc" ? 1 : -1 }).toArray();
  return docs.map(publicCard);
}

export async function listCardWords(deckId: number) {
  const docs = await cards.find({ deck_id: deckId }, { projection: { word: 1 } }).toArray();
  return docs.map((d) => d.word);
}

export async function insertCard(
  deckId: number,
  input: {
    word: string;
    translation: string;
    sentence?: string;
    sentenceTranslation?: string;
    notes?: string;
  },
) {
  const word = input.word.trim();
  const translation = input.translation.trim();
  if (!word || !translation) return false;
  const doc: CardDoc = {
    id: await nextId("cards"),
    deck_id: deckId,
    word,
    word_lc: wordKey(word),
    translation,
    sentence: input.sentence?.trim() || "",
    sentence_translation: input.sentenceTranslation?.trim() || "",
    notes: input.notes?.trim() || "",
    known_count: 0,
    unknown_count: 0,
    created_at: now(),
  };
  try {
    await cards.insertOne(doc);
    return true;
  } catch (err) {
    if (isDuplicate(err)) return false;
    throw err;
  }
}

export async function findCardById(id: number) {
  const doc = await cards.findOne({ id });
  return doc ? publicCard(doc) : null;
}

export async function deleteCardById(id: number) {
  await cards.deleteOne({ id });
}

export async function deleteCardsByIds(ids: number[]) {
  if (!ids.length) return;
  await cards.deleteMany({ id: { $in: ids } });
}

export async function incrementReview(id: number, known: boolean) {
  const field = known ? "known_count" : "unknown_count";
  await cards.updateOne({ id }, { $inc: { [field]: 1 } });
  return findCardById(id);
}

export async function listShares(deckId: number) {
  const rows = await shares.find({ deck_id: deckId }).toArray();
  if (!rows.length) return [] as { id: number; username: string }[];
  const people = await users.find({ id: { $in: rows.map((r) => r.user_id) } }).toArray();
  people.sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: "base" }));
  return people.map((u) => ({ id: u.id, username: u.username }));
}

export async function addShare(deckId: number, userId: number) {
  try {
    await shares.insertOne({ deck_id: deckId, user_id: userId, created_at: now() });
    return true;
  } catch (err) {
    if (isDuplicate(err)) return false;
    throw err;
  }
}

export async function removeShare(deckId: number, userId: number) {
  await shares.deleteOne({ deck_id: deckId, user_id: userId });
}

export async function canAccessDeck(deck: Deck, userId: number) {
  if (deck.user_id === userId) return true;
  const row = await shares.findOne({ deck_id: deck.id, user_id: userId });
  return Boolean(row);
}

export async function listStudyCards(userId: number, deckIds: number[]) {
  const uniqueIds = [...new Set(deckIds.filter((id) => Number.isFinite(id) && id > 0))];
  const allowed: number[] = [];
  for (const id of uniqueIds) {
    const deck = await findDeckById(id);
    if (deck && (await canAccessDeck(deck, userId))) allowed.push(id);
  }
  if (!allowed.length) return { decks: [] as Deck[], cards: [] as StudyCard[], source_lang: "auto", target_lang: "en" };
  const deckDocs = await decks.find({ id: { $in: allowed } }).toArray();
  const langByDeck = new Map(deckDocs.map((d) => [d.id, d]));
  const docs = await cards.find({ deck_id: { $in: allowed } }).toArray();
  const keep = new Map<string, CardDoc>();
  for (const doc of docs) {
    const key = wordKey(doc.word);
    const current = keep.get(key);
    if (!current) {
      keep.set(key, doc);
      continue;
    }
    const currentScore = current.known_count + current.unknown_count;
    const nextScore = doc.known_count + doc.unknown_count;
    if (nextScore > currentScore || (nextScore === currentScore && doc.id < current.id)) keep.set(key, doc);
  }
  const merged = [...keep.values()].map((doc) => {
    const parent = langByDeck.get(doc.deck_id);
    return {
      ...publicCard(doc),
      source_lang: parent?.source_lang || "auto",
      deck_name: parent?.name || "",
    } satisfies StudyCard;
  });
  const publicDecks = deckDocs.map(publicDeck);
  return {
    decks: publicDecks,
    cards: merged,
    source_lang: publicDecks[0]?.source_lang || "auto",
    target_lang: publicDecks[0]?.target_lang || "en",
  };
}

function publicRule(doc: RuleDoc, extras: Partial<Rule> = {}): Rule {
  return {
    id: doc.id,
    user_id: doc.user_id,
    title: doc.title,
    markup: doc.markup,
    prompt: doc.prompt,
    created_at: doc.created_at,
    ...extras,
  };
}

function publicCheck(doc: CheckDoc): RuleCheck {
  return {
    id: doc.id,
    rule_id: doc.rule_id,
    kind: doc.kind,
    prompt: doc.prompt,
    answer: doc.answer,
    options: doc.options || [],
    explanation: doc.explanation,
    known_count: doc.known_count,
    unknown_count: doc.unknown_count,
    created_at: doc.created_at,
  };
}

export async function createRule(input: { userId: number; title: string; markup: string; prompt: string }) {
  const doc: RuleDoc = {
    id: await nextId("rules"),
    user_id: input.userId,
    title: input.title,
    markup: input.markup,
    prompt: input.prompt,
    created_at: now(),
  };
  await rules.insertOne(doc);
  return publicRule(doc);
}

export async function findRuleById(id: number) {
  const doc = await rules.findOne({ id });
  return doc ? publicRule(doc) : null;
}

export async function listUserRules(userId: number) {
  const docs = await rules.find({ user_id: userId }).sort({ created_at: -1, id: -1 }).toArray();
  const counts = docs.length
    ? await checks
        .aggregate<{ _id: number; n: number }>([
          { $match: { rule_id: { $in: docs.map((d) => d.id) } } },
          { $group: { _id: "$rule_id", n: { $sum: 1 } } },
        ])
        .toArray()
    : [];
  const countMap = new Map(counts.map((c) => [c._id, c.n]));
  return docs.map((d) => publicRule(d, { check_count: countMap.get(d.id) ?? 0 }));
}

export async function deleteRule(id: number) {
  await checks.deleteMany({ rule_id: id });
  await rules.deleteOne({ id });
}

export async function insertRuleChecks(
  ruleId: number,
  incoming: Array<{ kind: string; prompt: string; answer: string; options?: string[]; explanation?: string }>,
) {
  const out: RuleCheck[] = [];
  for (const item of incoming) {
    const kind: RuleCheck["kind"] = item.kind === "mcq" || item.kind === "tf" ? item.kind : "write";
    const prompt = item.prompt.trim();
    const answer = String(item.answer ?? "").trim();
    if (!prompt || !answer) continue;
    const doc: CheckDoc = {
      id: await nextId("rule_checks"),
      rule_id: ruleId,
      kind,
      prompt,
      answer,
      options: Array.isArray(item.options) ? item.options.map((o) => String(o).trim()).filter(Boolean) : [],
      explanation: item.explanation?.trim() || "",
      known_count: 0,
      unknown_count: 0,
      created_at: now(),
    };
    await checks.insertOne(doc);
    out.push(publicCheck(doc));
  }
  return out;
}

export async function listRuleChecks(ruleId: number) {
  const docs = await checks.find({ rule_id: ruleId }).sort({ id: 1 }).toArray();
  return docs.map(publicCheck);
}

export async function incrementCheckReview(id: number, known: boolean) {
  const field = known ? "known_count" : "unknown_count";
  await checks.updateOne({ id }, { $inc: { [field]: 1 } });
  const doc = await checks.findOne({ id });
  return doc ? publicCheck(doc) : null;
}

function isDuplicate(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: number }).code === 11000;
}

export type User = { id: number; username: string; created_at: string };
export type Deck = {
  id: number;
  user_id: number;
  name: string;
  source_lang: string;
  target_lang: string;
  created_at: string;
  card_count?: number;
  owner_username?: string;
  shared?: boolean;
  is_owner?: boolean;
  shared_with?: { id: number; username: string }[];
};
export type Card = {
  id: number;
  deck_id: number;
  word: string;
  translation: string;
  sentence: string;
  sentence_translation: string;
  notes: string;
  known_count: number;
  unknown_count: number;
  created_at: string;
};
export type StudyCard = Card & { source_lang?: string; deck_name?: string };
export type Rule = {
  id: number;
  user_id: number;
  title: string;
  markup: string;
  prompt: string;
  created_at: string;
  check_count?: number;
  checks?: RuleCheck[];
};
export type RuleCheck = {
  id: number;
  rule_id: number;
  kind: "mcq" | "write" | "tf";
  prompt: string;
  answer: string;
  options: string[];
  explanation: string;
  known_count: number;
  unknown_count: number;
  created_at: string;
};
