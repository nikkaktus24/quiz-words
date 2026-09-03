import { all, get, insertId, run, type Card, type Deck, type User } from "./db";
import { extractWordsFromImage, generateCards } from "./ai";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ORIGIN = process.env.WEB_ORIGIN || "http://localhost:5173";

function allowOrigin(req?: Request) {
  if (ORIGIN === "*") return req?.headers.get("Origin") || "*";
  return ORIGIN;
}

function jsonBody(data: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": allowOrigin(req),
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    },
  });
}

function cors(req: Request) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowOrigin(req),
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    },
  });
}

async function readJson<T>(req: Request): Promise<T> {
  return (await req.json()) as T;
}

Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(req) {
    if (req.method === "OPTIONS") return cors(req);

    const json = (data: unknown, status = 200) => jsonBody(data, status, req);
    const notFound = () => json({ error: "Not found" }, 404);
    const bad = (message: string) => json({ error: message }, 400);

    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    if (method === "GET" && path === "/api/health") {
      return json({ ok: true });
    }

    try {
      if (method === "POST" && path === "/api/profile") {
        const body = await readJson<{ username?: string }>(req);
        const username = body.username?.trim();
        if (!username || username.length < 2) return bad("Username must be at least 2 characters");
        if (username.length > 32) return bad("Username is too long");

        const existing = await get<User>("SELECT * FROM users WHERE username = ?", [username]);
        if (existing) return json(existing);

        await run("INSERT INTO users (username) VALUES (?)", [username]);
        const user = await get<User>("SELECT * FROM users WHERE username = ?", [username]);
        return json(user, 201);
      }

      if (method === "GET" && path.startsWith("/api/users/") && path.endsWith("/decks")) {
        const userId = Number(path.split("/")[3]);
        const user = await get<User>("SELECT * FROM users WHERE id = ?", [userId]);
        if (!user) return json({ error: "User not found" }, 404);
        const decks = await all<Deck>(
          `SELECT d.*, (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id) AS card_count
           FROM decks d WHERE d.user_id = ? ORDER BY d.created_at DESC`,
          [userId],
        );
        return json({ user, decks });
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
        const id = await insertId(
          "INSERT INTO decks (user_id, name, source_lang, target_lang) VALUES (?, ?, ?, ?)",
          [body.userId, name, sourceLang, targetLang],
        );
        const deck = await get<Deck>("SELECT * FROM decks WHERE id = ?", [id]);
        return json(deck, 201);
      }

      const deckMatch = path.match(/^\/api\/decks\/(\d+)$/);
      if (deckMatch && method === "GET") {
        const deck = await get<Deck>("SELECT * FROM decks WHERE id = ?", [Number(deckMatch[1])]);
        if (!deck) return notFound();
        const cards = await all<Card>("SELECT * FROM cards WHERE deck_id = ? ORDER BY id DESC", [deck.id]);
        return json({ deck, cards });
      }

      if (deckMatch && method === "DELETE") {
        await run("DELETE FROM cards WHERE deck_id = ?", [Number(deckMatch[1])]);
        await run("DELETE FROM decks WHERE id = ?", [Number(deckMatch[1])]);
        return json({ ok: true });
      }

      if (deckMatch && method === "PATCH") {
        const body = await readJson<{ name?: string; sourceLang?: string; targetLang?: string }>(req);
        const deck = await get<Deck>("SELECT * FROM decks WHERE id = ?", [Number(deckMatch[1])]);
        if (!deck) return notFound();
        await run("UPDATE decks SET name = ?, source_lang = ?, target_lang = ? WHERE id = ?", [
          body.name?.trim() || deck.name,
          body.sourceLang || deck.source_lang,
          body.targetLang || deck.target_lang,
          deck.id,
        ]);
        const updated = await get<Deck>("SELECT * FROM decks WHERE id = ?", [deck.id]);
        return json(updated);
      }

      const extractMatch = path === "/api/extract-photo";
      if (method === "POST" && extractMatch) {
        const form = await req.formData();
        const file = form.get("image");
        if (!(file instanceof File)) return bad("image file required");
        if (file.size > 8 * 1024 * 1024) return bad("Image must be under 8MB");
        const bytes = Buffer.from(await file.arrayBuffer());
        const mime = file.type || "image/jpeg";
        const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
        const result = await extractWordsFromImage(dataUrl);
        return json(result);
      }

      const generateMatch = path.match(/^\/api\/decks\/(\d+)\/generate$/);
      if (generateMatch && method === "POST") {
        const deck = await get<Deck>("SELECT * FROM decks WHERE id = ?", [Number(generateMatch[1])]);
        if (!deck) return notFound();
        const body = await readJson<{ words?: string[] }>(req);
        const words = (body.words || []).map((w) => w.trim()).filter(Boolean);
        if (words.length === 0) return bad("Add at least one word");
        const generated = await generateCards({
          words,
          sourceLang: deck.source_lang,
          targetLang: deck.target_lang,
        });
        if (deck.source_lang === "auto" && generated.sourceLang && generated.sourceLang !== "und") {
          await run("UPDATE decks SET source_lang = ? WHERE id = ?", [generated.sourceLang, deck.id]);
        }
        for (const card of generated.cards) {
          await run(
            `INSERT INTO cards (deck_id, word, translation, sentence, sentence_translation, notes)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [deck.id, card.word, card.translation, card.sentence, card.sentenceTranslation, card.notes],
          );
        }
        const cards = await all<Card>("SELECT * FROM cards WHERE deck_id = ? ORDER BY id DESC", [deck.id]);
        const updatedDeck = await get<Deck>("SELECT * FROM decks WHERE id = ?", [deck.id]);
        return json({ deck: updatedDeck, cards, added: generated.cards.length });
      }

      const cardMatch = path.match(/^\/api\/cards\/(\d+)$/);
      if (cardMatch && method === "DELETE") {
        await run("DELETE FROM cards WHERE id = ?", [Number(cardMatch[1])]);
        return json({ ok: true });
      }

      const reviewMatch = path.match(/^\/api\/cards\/(\d+)\/review$/);
      if (reviewMatch && method === "POST") {
        const body = await readJson<{ known?: boolean }>(req);
        const field = body.known ? "known_count" : "unknown_count";
        await run(`UPDATE cards SET ${field} = ${field} + 1 WHERE id = ?`, [Number(reviewMatch[1])]);
        const card = await get<Card>("SELECT * FROM cards WHERE id = ?", [Number(reviewMatch[1])]);
        if (!card) return notFound();
        return json(card);
      }

      return notFound();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Server error";
      console.error(err);
      return json({ error: message }, 500);
    }
  },
});

console.log(`Quiz Words API on http://${HOST}:${PORT}`);
