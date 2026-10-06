import {
  addShare,
  canAccessDeck,
  createDeck,
  createUser,
  deleteCardById,
  deleteCardsByIds,
  deleteDeck,
  findDeckById,
  findUserById,
  findUserByUsername,
  incrementReview,
  insertCard,
  listCardWords,
  listCards,
  listShares,
  listUserDecks,
  removeShare,
  updateDeck,
  type Card,
} from "./db";
import { extractWordsFromImage, generateCards } from "./ai";
import { importFromSetUrl, parseImportPayload, type ImportedCard } from "./import";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ORIGIN = (process.env.WEB_ORIGIN || "*").trim() || "*";

function allowOrigin(req: Request) {
  const requestOrigin = req.headers.get("Origin");
  if (ORIGIN === "*") return requestOrigin || "*";
  return ORIGIN;
}

function corsHeaders(req: Request): Record<string, string> {
  const requested = req.headers.get("Access-Control-Request-Headers");
  return {
    "Access-Control-Allow-Origin": allowOrigin(req),
    "Access-Control-Allow-Methods": "GET,HEAD,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      requested || "Content-Type, Authorization, Accept, X-Requested-With",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin, Access-Control-Request-Headers",
  };
}

function jsonBody(data: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(req ? corsHeaders(req) : {}),
    },
  });
}

function cors(req: Request) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(req),
      "Content-Length": "0",
    },
  });
}

function apiPath(pathname: string) {
  const idx = pathname.indexOf("/api/");
  if (idx >= 0) return pathname.slice(idx);
  if (pathname === "/api" || pathname.endsWith("/api")) return "/api";
  return pathname;
}

async function readJson<T>(req: Request): Promise<T> {
  return (await req.json()) as T;
}

Bun.serve({
  port: PORT,
  hostname: HOST,
  idleTimeout: 255,
  async fetch(req) {
    if (req.method === "OPTIONS") return cors(req);

    const json = (data: unknown, status = 200) => jsonBody(data, status, req);
    const notFound = () => json({ error: "Not found" }, 404);
    const bad = (message: string) => json({ error: message }, 400);

    const url = new URL(req.url);
    const path = apiPath(url.pathname);
    const method = req.method;
    const started = Date.now();
    if (path.includes("generate") || path.includes("extract-photo") || path.includes("import")) {
      console.log("[quiz-words] start", method, path);
    }

    if (method === "GET" && path === "/api/health") {
      return json({ ok: true });
    }

    try {
      if (method === "POST" && path === "/api/profile") {
        const body = await readJson<{ username?: string }>(req);
        const username = body.username?.trim();
        if (!username || username.length < 2) return bad("Username must be at least 2 characters");
        if (username.length > 32) return bad("Username is too long");

        const existing = await findUserByUsername(username);
        if (existing) return json(existing);

        const user = await createUser(username);
        return json(user, 201);
      }

      if (method === "GET" && path.startsWith("/api/users/") && path.endsWith("/decks")) {
        const userId = Number(path.split("/")[3]);
        const user = await findUserById(userId);
        if (!user) return json({ error: "User not found" }, 404);
        const decks = await listUserDecks(userId);
        return json({ user, decks });
      }

      if (method === "POST" && path === "/api/import") {
        const parsed = await readImportRequest(req);
        if (!parsed.userId) return bad("userId required");
        const user = await findUserById(parsed.userId);
        if (!user) return json({ error: "User not found" }, 404);
        if (parsed.cards.length === 0) return bad("No cards found in that file or link.");
        const name = parsed.title || parsed.name || "Imported set";
        const deck = await createDeck({
          userId: parsed.userId,
          name,
          sourceLang: parsed.sourceLang,
          targetLang: parsed.targetLang,
        });
        const result = await insertImported(deck.id, parsed.cards, parsed.title);
        console.log("[quiz-words] import new", { deckId: deck.id, added: result.added, skipped: result.skipped, title: parsed.title });
        return json({ deck, cards: result.cards, added: result.added, skipped: result.skipped, title: parsed.title }, 201);
      }

      if (method === "POST" && path === "/api/decks") {
        const body = await readJson<{
          userId?: number;
          name?: string;
          sourceLang?: string;
          targetLang?: string;
        }>(req);
        if (!body.userId) return bad("userId required");
        const name = body.name?.trim();
        if (!name) return bad("Deck name required");
        const sourceLang = (body.sourceLang || "auto").trim();
        const targetLang = (body.targetLang || "en").trim();
        const deck = await createDeck({
          userId: body.userId,
          name,
          sourceLang,
          targetLang,
        });
        return json(deck, 201);
      }

      const deckMatch = path.match(/^\/api\/decks\/(\d+)$/);
      if (deckMatch && method === "GET") {
        const deck = await findDeckById(Number(deckMatch[1]));
        if (!deck) return notFound();
        const actorId = Number(url.searchParams.get("userId") || 0);
        if (actorId && !(await canAccessDeck(deck, actorId))) {
          return json({ error: "You do not have access to this deck" }, 403);
        }
        const owner = await findUserById(deck.user_id);
        const sharedWith = await listShares(deck.id);
        const cards = await listCards(deck.id, "desc");
        return json({
          deck: {
            ...deck,
            owner_username: owner?.username,
            shared_with: sharedWith,
            is_owner: actorId ? deck.user_id === actorId : true,
            shared: actorId ? deck.user_id !== actorId : false,
          },
          cards,
        });
      }

      if (deckMatch && method === "DELETE") {
        const actorId = Number(url.searchParams.get("userId") || 0);
        const deck = await findDeckById(Number(deckMatch[1]));
        if (!deck) return notFound();
        if (actorId && deck.user_id !== actorId) return json({ error: "Only the owner can delete this deck" }, 403);
        await deleteDeck(deck.id);
        return json({ ok: true });
      }

      if (deckMatch && method === "PATCH") {
        const body = await readJson<{ name?: string; sourceLang?: string; targetLang?: string }>(req);
        const deck = await findDeckById(Number(deckMatch[1]));
        if (!deck) return notFound();
        const updated = await updateDeck(deck.id, {
          name: body.name?.trim() || deck.name,
          source_lang: body.sourceLang || deck.source_lang,
          target_lang: body.targetLang || deck.target_lang,
        });
        return json(updated);
      }

      const shareMatch = path.match(/^\/api\/decks\/(\d+)\/share$/);
      if (shareMatch && method === "POST") {
        const deck = await findDeckById(Number(shareMatch[1]));
        if (!deck) return notFound();
        const body = await readJson<{ userId?: number; usernames?: string[]; username?: string }>(req);
        if (!body.userId || deck.user_id !== body.userId) {
          return json({ error: "Only the owner can share this deck" }, 403);
        }
        const names = parseUsernames(body.usernames?.length ? body.usernames : [body.username || ""]);
        if (names.length === 0) return bad("Write at least one username");
        const missing: string[] = [];
        const added: string[] = [];
        const skipped: string[] = [];
        for (const name of names) {
          const target = await findUserByUsername(name);
          if (!target) {
            missing.push(name);
            continue;
          }
          if (target.id === deck.user_id) {
            skipped.push(name);
            continue;
          }
          const inserted = await addShare(deck.id, target.id);
          if (inserted) added.push(target.username);
          else skipped.push(target.username);
        }
        const sharedWith = await listShares(deck.id);
        if (missing.length && added.length === 0) {
          return json({ error: `No such user: ${missing.join(", ")}`, shared_with: sharedWith }, 400);
        }
        return json({
          shared_with: sharedWith,
          added,
          skipped,
          missing,
        });
      }

      if (shareMatch && method === "DELETE") {
        const deck = await findDeckById(Number(shareMatch[1]));
        if (!deck) return notFound();
        const body = await readJson<{ userId?: number; username?: string }>(req);
        if (!body.userId || !body.username?.trim()) return bad("userId and username required");
        const target = await findUserByUsername(body.username.trim());
        if (!target) return json({ error: "User not found" }, 404);
        const isOwner = deck.user_id === body.userId;
        const isSelf = target.id === body.userId;
        if (!isOwner && !isSelf) return json({ error: "Not allowed" }, 403);
        await removeShare(deck.id, target.id);
        return json({ shared_with: await listShares(deck.id) });
      }

      const dedupeMatch = path.match(/^\/api\/decks\/(\d+)\/dedupe$/);
      if (dedupeMatch && method === "POST") {
        const deck = await findDeckById(Number(dedupeMatch[1]));
        if (!deck) return notFound();
        const actorId = Number(url.searchParams.get("userId") || 0);
        if (actorId && deck.user_id !== actorId) return json({ error: "Only the owner can edit this deck" }, 403);
        const cards = await listCards(deck.id, "asc");
        const keep = new Map<string, Card>();
        const removeIds: number[] = [];
        for (const card of cards) {
          const key = card.word.trim().toLowerCase().replace(/\s+/g, " ");
          const current = keep.get(key);
          if (!current) {
            keep.set(key, card);
            continue;
          }
          const currentScore = current.known_count + current.unknown_count;
          const nextScore = card.known_count + card.unknown_count;
          if (nextScore > currentScore) {
            removeIds.push(current.id);
            keep.set(key, card);
          } else {
            removeIds.push(card.id);
          }
        }
        await deleteCardsByIds(removeIds);
        const remaining = await listCards(deck.id, "desc");
        console.log("[quiz-words] dedupe", { deckId: deck.id, removed: removeIds.length });
        return json({ deck, cards: remaining, removed: removeIds.length });
      }

      const extractMatch = path.match(/^\/api\/decks\/(\d+)\/extract-photo$/);
      if (method === "POST" && extractMatch) {
        const deck = await findDeckById(Number(extractMatch[1]));
        if (!deck) return notFound();
        const actorId = Number(url.searchParams.get("userId") || 0);
        if (actorId && deck.user_id !== actorId) return json({ error: "Only the owner can add cards" }, 403);
        const form = await req.formData();
        const file = form.get("image");
        if (!(file instanceof File)) return bad("image file required");
        if (file.size > 8 * 1024 * 1024) return bad("Image must be under 8MB");
        const bytes = Buffer.from(await file.arrayBuffer());
        const mime = file.type || "image/jpeg";
        const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
        const result = await extractWordsFromImage(dataUrl, {
          sourceLang: deck.source_lang,
          targetLang: deck.target_lang,
        });
        return json(result);
      }

      const generateMatch = path.match(/^\/api\/decks\/(\d+)\/generate$/);
      if (generateMatch && method === "POST") {
        const deck = await findDeckById(Number(generateMatch[1]));
        if (!deck) return notFound();
        const actorId = Number(url.searchParams.get("userId") || 0);
        if (actorId && deck.user_id !== actorId) return json({ error: "Only the owner can add cards" }, 403);
        const body = await readJson<{ words?: string[] }>(req);
        const words = uniqueIncoming(body.words || []);
        if (words.length === 0) return bad("Add at least one word");
        const existing = await listCardWords(deck.id);
        const taken = new Set(existing.map((word) => word.trim().toLowerCase()));
        const novel = words.filter((w) => !taken.has(w.toLowerCase()));
        let skipped = words.length - novel.length;
        if (novel.length === 0) {
          const cards = await listCards(deck.id, "desc");
          return json({ deck, cards, added: 0, skipped });
        }
        const generated = await generateCards({
          words: novel,
          sourceLang: deck.source_lang,
          targetLang: deck.target_lang,
        });
        if (deck.source_lang === "auto" && generated.sourceLang && generated.sourceLang !== "und") {
          await updateDeck(deck.id, { source_lang: generated.sourceLang });
        }
        let added = 0;
        for (const card of generated.cards) {
          if (taken.has(card.word.trim().toLowerCase())) continue;
          const ok = await insertCard(deck.id, {
            word: card.word,
            translation: card.translation,
            sentence: card.sentence,
            sentenceTranslation: card.sentenceTranslation,
            notes: card.notes,
          });
          if (ok) {
            taken.add(card.word.trim().toLowerCase());
            added += 1;
          } else {
            skipped += 1;
          }
        }
        const cards = await listCards(deck.id, "desc");
        const updatedDeck = await findDeckById(deck.id);
        return json({ deck: updatedDeck, cards, added, skipped });
      }

      const importMatch = path.match(/^\/api\/decks\/(\d+)\/import$/);
      if (importMatch && method === "POST") {
        const deck = await findDeckById(Number(importMatch[1]));
        if (!deck) return notFound();
        const parsed = await readImportRequest(req);
        const actorId = parsed.userId || Number(url.searchParams.get("userId") || 0);
        if (actorId && deck.user_id !== actorId) return json({ error: "Only the owner can import cards" }, 403);
        if (parsed.cards.length === 0) return bad("No cards found in that file or link.");
        const result = await insertImported(deck.id, parsed.cards, parsed.title);
        if (parsed.title && (deck.name === "Untitled" || deck.name.toLowerCase() === "imported set")) {
          await updateDeck(deck.id, { name: parsed.title });
        }
        const updatedDeck = await findDeckById(deck.id);
        console.log("[quiz-words] import", { deckId: deck.id, added: result.added, skipped: result.skipped, title: parsed.title });
        return json({ deck: updatedDeck, cards: result.cards, added: result.added, skipped: result.skipped, title: parsed.title });
      }

      const cardMatch = path.match(/^\/api\/cards\/(\d+)$/);
      if (cardMatch && method === "DELETE") {
        await deleteCardById(Number(cardMatch[1]));
        return json({ ok: true });
      }

      const reviewMatch = path.match(/^\/api\/cards\/(\d+)\/review$/);
      if (reviewMatch && method === "POST") {
        const body = await readJson<{ known?: boolean }>(req);
        const card = await incrementReview(Number(reviewMatch[1]), Boolean(body.known));
        if (!card) return notFound();
        return json(card);
      }

      return notFound();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Server error";
      console.error("[quiz-words] handler error", {
        method,
        path,
        durationMs: Date.now() - started,
        err,
      });
      return json({ error: message }, 500);
    }
  },
});

console.log(`Quiz Words API on http://${HOST}:${PORT}`);

function uniqueIncoming(words: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of words) {
    const word = raw.trim();
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

function parseUsernames(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    for (const part of value.split(/[\n,;]+/)) {
      const name = part.trim();
      const key = name.toLowerCase();
      if (name.length < 2 || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

async function insertImported(deckId: number, incoming: ImportedCard[], title = "") {
  const existing = await listCardWords(deckId);
  const taken = new Set(existing.map((word) => word.trim().toLowerCase()));
  let added = 0;
  let skipped = 0;
  const note = title || "";
  for (const card of incoming) {
    const key = card.word.trim().toLowerCase();
    if (taken.has(key)) {
      skipped += 1;
      continue;
    }
    const ok = await insertCard(deckId, {
      word: card.word,
      translation: card.translation,
      sentence: card.sentence || "",
      sentenceTranslation: card.sentenceTranslation || "",
      notes: card.notes || note,
    });
    if (ok) {
      taken.add(key);
      added += 1;
    } else {
      skipped += 1;
    }
  }
  const cards = await listCards(deckId, "desc");
  return { cards, added, skipped };
}

async function readImportRequest(req: Request) {
  const ctype = req.headers.get("content-type") || "";
  let userId = 0;
  let name = "";
  let sourceLang = "auto";
  let targetLang = "en";
  let title = "";
  let cards: ImportedCard[] = [];

  if (ctype.includes("multipart/form-data")) {
    const form = await req.formData();
    userId = Number(form.get("userId") || 0);
    name = String(form.get("name") || "").trim();
    sourceLang = String(form.get("sourceLang") || "auto").trim() || "auto";
    targetLang = String(form.get("targetLang") || "en").trim() || "en";
    const file = form.get("file");
    const link = String(form.get("url") || "").trim();
    const raw = String(form.get("json") || "").trim();
    if (file instanceof File && file.size > 0) {
      cards = parseImportPayload(await file.text());
    } else if (raw) {
      cards = parseImportPayload(raw);
    } else if (link) {
      const fetched = await importFromSetUrl(link);
      cards = fetched.cards;
      title = fetched.title;
    }
  } else {
    const body = await readJson<{
      userId?: number;
      name?: string;
      sourceLang?: string;
      targetLang?: string;
      url?: string;
      json?: unknown;
      cards?: unknown;
      text?: string;
    }>(req);
    userId = Number(body.userId || 0);
    name = body.name?.trim() || "";
    sourceLang = (body.sourceLang || "auto").trim();
    targetLang = (body.targetLang || "en").trim();
    if (body.url?.trim()) {
      const fetched = await importFromSetUrl(body.url.trim());
      cards = fetched.cards;
      title = fetched.title;
    } else {
      cards = parseImportPayload(body.cards ?? body.json ?? body.text ?? body);
    }
  }

  return { userId, name, sourceLang, targetLang, title, cards };
}

