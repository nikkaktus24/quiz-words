const MODEL = "openai/gpt-5-nano";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

type ChatContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

function apiKey() {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is missing. Add it to a .env file in the project root.");
  }
  return key;
}

async function chat(content: ChatContent, system: string) {
  console.log("[quiz-words] OpenRouter request", { model: MODEL });
  const started = Date.now();
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:5173",
      "X-Title": "Quiz Words",
    },
    signal: AbortSignal.timeout(9 * 60 * 1000),
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[quiz-words] OpenRouter error", {
      status: res.status,
      durationMs: Date.now() - started,
      body: errText.slice(0, 2000),
    });
    throw new Error(`OpenRouter error ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  console.log("[quiz-words] OpenRouter ok", { durationMs: Date.now() - started, chars: raw.length });
  return parseJson(raw);
}

function parseJson(raw: string) {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("AI returned invalid JSON");
  }
}

export type GeneratedCard = {
  word: string;
  translation: string;
  sentence: string;
  sentenceTranslation: string;
  notes: string;
};

export async function extractWordsFromImage(
  dataUrl: string,
  opts: { sourceLang: string; targetLang: string },
) {
  const source =
    opts.sourceLang === "auto"
      ? "the language being learned (not the target language below)"
      : `ISO 639-1 code ${opts.sourceLang}`;
  const target = opts.targetLang || "en";

  const system = `You extract vocabulary from photos of notes, textbooks, lists, or screenshots.
Return JSON only: {"words":["word or short phrase",...],"sourceLang":"ISO 639-1 code"}.
This deck is ${opts.sourceLang} → ${target}.
Rules:
- Extract ONLY vocabulary written in ${source}.
- Ignore text in ${target} and in every other language (captions, UI, translations, English chrome, mixed headings).
- Keep original spelling of each kept word/phrase.
- Skip numbers and full paragraphs unless they are clearly vocab items in the source language.
- Deduplicate case-insensitively.
- Prefer single words or short phrases (max ~5 words).
- If nothing in the source language is found, return {"words":[],"sourceLang":"${opts.sourceLang === "auto" ? "und" : opts.sourceLang}"}.`;

  const json = await chat(
    [
      {
        type: "text",
        text: `Extract only ${opts.sourceLang === "auto" ? "source-language" : opts.sourceLang} vocabulary. Ignore ${target} and other languages.`,
      },
      { type: "image_url", image_url: { url: dataUrl } },
    ],
    system,
  );

  const words = Array.isArray(json.words)
    ? json.words.map((w: unknown) => String(w).trim()).filter(Boolean)
    : [];
  const sourceLang = String(json.sourceLang || opts.sourceLang || "und");
  return { words: uniqueWords(words), sourceLang };
}

export async function generateCards(opts: {
  words: string[];
  sourceLang: string;
  targetLang: string;
}) {
  const words = uniqueWords(opts.words);
  if (words.length === 0) return { sourceLang: opts.sourceLang, cards: [] as GeneratedCard[] };

  const sourceHint =
    opts.sourceLang === "auto"
      ? "Detect the source language of the words."
      : `Source language code: ${opts.sourceLang}.`;

  const system = `You are a language tutor making Quizlet-style study cards.
Return JSON only:
{"sourceLang":"ISO 639-1 code","cards":[{"word":"","translation":"","sentence":"","sentenceTranslation":"","notes":""}]}
Rules:
- ${sourceHint}
- Target language code: ${opts.targetLang}.
- "word" is the original item, lightly normalized (trim, keep original casing unless all-caps list).
- "translation" is the best everyday meaning in the target language.
- "sentence" is a short, natural example in the SOURCE language that uses the word.
- "sentenceTranslation" is that sentence in the TARGET language.
- "notes" is one short memory hook (cognate, usage, false friend). Empty string if nothing useful.
- One card per input word, same order.
- No extra keys.`;

  const json = await chat(
    `Create study cards for these words:\n${words.map((w, i) => `${i + 1}. ${w}`).join("\n")}`,
    system,
  );

  const cards: GeneratedCard[] = Array.isArray(json.cards)
    ? json.cards.map((c: Record<string, unknown>, i: number) => ({
        word: String(c.word ?? words[i] ?? "").trim(),
        translation: String(c.translation ?? "").trim(),
        sentence: String(c.sentence ?? "").trim(),
        sentenceTranslation: String(c.sentenceTranslation ?? "").trim(),
        notes: String(c.notes ?? "").trim(),
      }))
    : [];

  return {
    sourceLang: String(json.sourceLang || opts.sourceLang),
    cards: cards.filter((c) => c.word && c.translation),
  };
}

function uniqueWords(words: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    const key = w.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(w.trim());
  }
  return out.slice(0, 40);
}
