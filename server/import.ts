export type ImportedCard = {
  word: string;
  translation: string;
  sentence?: string;
  sentenceTranslation?: string;
  notes?: string;
};

export function parseImportPayload(input: unknown): ImportedCard[] {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return [];
    try {
      return parseImportPayload(JSON.parse(trimmed));
    } catch {
      return parseTextPairs(trimmed);
    }
  }

  if (Array.isArray(input)) {
    const asPairs = pairsFromArray(input);
    if (asPairs.length) return uniqueCards(asPairs);
    return uniqueCards(collectCards(input));
  }

  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    for (const key of ["cards", "terms", "items", "studiableItems", "wordList", "data"]) {
      if (obj[key] != null) {
        const nested = parseImportPayload(obj[key]);
        if (nested.length) return nested;
      }
    }
    return uniqueCards(collectCards(input));
  }

  return [];
}

export function quizletSetId(url: string) {
  const match = url.trim().match(/quizlet\.com\/(?:[a-z]{2}\/)?(\d+)/i);
  return match?.[1] ?? "";
}

export async function importFromQuizletUrl(rawUrl: string): Promise<{ title: string; cards: ImportedCard[] }> {
  const id = quizletSetId(rawUrl);
  if (!id) throw new Error("That does not look like a Quizlet set URL.");

  const fromApi = await fetchQuizletApi(id);
  if (fromApi.length > 0) return { title: `Quizlet ${id}`, cards: fromApi };

  try {
    const html = await fetchPage(`https://quizlet.com/${id}`);
    const fromHtml = extractFromHtml(html);
    if (fromHtml.cards.length > 0) return fromHtml;
  } catch (err) {
    console.error("[quiz-words] quizlet html", err);
  }

  throw new Error(
    "Quizlet blocked that link (login wall or captcha). Export JSON or paste tab-separated terms instead.",
  );
}

async function fetchPage(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`Quizlet responded ${res.status}. Upload a JSON export instead.`);
  return res.text();
}

function extractFromHtml(html: string): { title: string; cards: ImportedCard[] } {
  let title = "";
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) title = titleMatch[1].replace(/\s*\|\s*Quizlet.*/i, "").replace(/&amp;/g, "&").trim();

  const next = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (next) {
    try {
      const cards = uniqueCards(collectCards(JSON.parse(next[1])));
      if (cards.length) return { title, cards };
    } catch {
      /* continue */
    }
  }

  const mapMatch = html.match(/"termIdToTermsMap"\s*:\s*(\{[\s\S]*?\})\s*,\s*"/);
  if (mapMatch) {
    try {
      const map = JSON.parse(mapMatch[1]) as Record<string, unknown>;
      const cards = uniqueCards(collectCards(Object.values(map)));
      if (cards.length) return { title, cards };
    } catch {
      /* continue */
    }
  }

  return { title, cards: [] };
}

async function fetchQuizletApi(id: string): Promise<ImportedCard[]> {
  const endpoint =
    `https://quizlet.com/webapi/3.4/studiable-item-documents?filters[studiableContainerId]=${id}` +
    `&filters[studiableContainerType]=1&perPage=1000`;
  try {
    const res = await fetch(endpoint, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return uniqueCards(collectCards(json));
  } catch (err) {
    console.error("[quiz-words] quizlet api", err);
    return [];
  }
}

function collectCards(node: unknown, depth = 0): ImportedCard[] {
  if (depth > 14 || node == null) return [];
  const out: ImportedCard[] = [];
  if (Array.isArray(node)) {
    const pairs = pairsFromArray(node);
    if (pairs.length) return pairs;
    for (const item of node) out.push(...collectCards(item, depth + 1));
    return out;
  }
  if (typeof node !== "object") return [];
  const one = normalizeOne(node);
  if (one) out.push(one);
  for (const value of Object.values(node as Record<string, unknown>)) {
    out.push(...collectCards(value, depth + 1));
  }
  return out;
}

function pairsFromArray(items: unknown[]): ImportedCard[] {
  if (items.length < 2 || items.length > 500) return [];
  if (!items.every((row) => Array.isArray(row) && row.length >= 2)) return [];
  const out: ImportedCard[] = [];
  for (const row of items) {
    const word = String((row as unknown[])[0] ?? "").trim();
    const translation = String((row as unknown[])[1] ?? "").trim();
    if (word && translation) out.push({ word, translation });
  }
  return out;
}

function normalizeOne(item: unknown): ImportedCard | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const word = pick(row, ["word", "term", "front", "question", "wordText", "side1"]);
  const translation = pick(row, ["translation", "definition", "back", "answer", "definitionText", "side2", "meaning"]);
  if (word && translation && plausiblePair(word, translation)) {
    return {
      word,
      translation,
      sentence: pick(row, ["sentence", "example", "exampleSentence"]) || undefined,
      sentenceTranslation: pick(row, ["sentenceTranslation", "sentence_translation", "exampleTranslation"]) || undefined,
      notes: pick(row, ["notes", "hint"]) || undefined,
    };
  }
  const sides = row.cardSides ?? row.sides;
  if (Array.isArray(sides) && sides.length >= 2) {
    const a = sideText(sides[0]);
    const b = sideText(sides[1]);
    if (a && b && plausiblePair(a, b)) return { word: a, translation: b };
  }
  return null;
}

function plausiblePair(word: string, translation: string) {
  if (word === translation) return false;
  if (word.length > 180 || translation.length > 800) return false;
  if (/^https?:/i.test(word) || /^https?:/i.test(translation)) return false;
  return true;
}

function sideText(side: unknown) {
  if (!side || typeof side !== "object") return "";
  const s = side as Record<string, unknown>;
  const direct = pick(s, ["text", "word", "label", "plainText"]);
  if (direct && direct.length < 200) return direct;
  if (Array.isArray(s.media)) {
    for (const media of s.media) {
      if (media && typeof media === "object") {
        const text = pick(media as Record<string, unknown>, ["plainText", "text"]);
        if (text) return text;
      }
    }
  }
  return "";
}

function pick(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object" && "plainText" in (value as object)) {
      const text = String((value as { plainText?: string }).plainText || "").trim();
      if (text) return text;
    }
  }
  return "";
}

function parseTextPairs(raw: string) {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const cards: ImportedCard[] = [];
  for (const line of lines) {
    const parts = line.includes("\t") ? line.split("\t") : line.split(/\s{2,}|[|;]/);
    if (parts.length >= 2) {
      const word = parts[0].trim();
      const translation = parts.slice(1).join(" ").trim();
      if (word && translation) cards.push({ word, translation });
    }
  }
  return uniqueCards(cards);
}

function uniqueCards(cards: ImportedCard[]) {
  const seen = new Set<string>();
  const out: ImportedCard[] = [];
  for (const card of cards) {
    const key = card.word.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      word: card.word.trim(),
      translation: card.translation.trim(),
      sentence: card.sentence?.trim() || "",
      sentenceTranslation: card.sentenceTranslation?.trim() || "",
      notes: card.notes?.trim() || "",
    });
  }
  return out.slice(0, 500);
}
