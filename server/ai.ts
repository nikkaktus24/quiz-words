import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { uniqueIncoming } from "./words";

const MODEL = "openai/gpt-5-nano";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TTS_URL = "https://openrouter.ai/api/v1/audio/speech";
const TTS_MODEL = process.env.TTS_MODEL?.trim() || "";
const TTS_VOICE = process.env.TTS_VOICE?.trim() || "";
const TTS_CACHE = join(tmpdir(), "quiz-words-tts");
const ttsMem = new Map<string, Uint8Array>();

type TtsTarget = { model: string; voice: string };

const MS = "microsoft/mai-voice-2.1-flash";
const MS_VOICES: Record<string, string> = {
  en: "en-US-Harper:MAI-Voice-2.1-Flash",
  es: "es-ES-Marta:MAI-Voice-2.1-Flash",
  fr: "fr-FR-Soleil:MAI-Voice-2.1-Flash",
  de: "de-DE-Mia:MAI-Voice-2.1-Flash",
  it: "it-IT-Rosa:MAI-Voice-2.1-Flash",
  pt: "pt-PT-Harper:MAI-Voice-2.1-Flash",
  pl: "pl-PL-Harper:MAI-Voice-2.1-Flash",
  ru: "ru-RU-Masha:MAI-Voice-2.1-Flash",
  uk: "ru-RU-Masha:MAI-Voice-2.1-Flash",
  zh: "zh-CN-Mei:MAI-Voice-2.1-Flash",
  ko: "ko-KR-Haena:MAI-Voice-2.1-Flash",
};

const KOKORO = "hexgrad/kokoro-82m";
const KOKORO_VOICES: Record<string, string> = {
  en: "af_heart",
  es: "ef_dora",
  fr: "ff_siwis",
  it: "if_sara",
  pt: "pf_dora",
  ja: "jf_alpha",
  zh: "zf_xiaoxiao",
};

function guessTtsLang(text: string, hinted: string) {
  if (hinted && hinted !== "auto") return hinted;
  if (/[áéíóúñ¿¡]/i.test(text) || /\b(el|la|los|las|hola|gracias|qué|cómo)\b/i.test(text)) return "es";
  if (/[àâçéèêëîïôûùüÿœ]/i.test(text) || /\b(bonjour|merci|être|vous)\b/i.test(text)) return "fr";
  if (/[äöüß]/i.test(text) || /\b(der|die|das|und|nicht)\b/i.test(text)) return "de";
  if (/[ґєії]/i.test(text)) return "uk";
  if (/[\u0400-\u04FF]/.test(text)) return "ru";
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  if (/\b(ciao|grazie|sono)\b/i.test(text)) return "it";
  if (/\b(olá|obrigado|não)\b/i.test(text)) return "pt";
  return "en";
}

function ttsTargets(lang: string): TtsTarget[] {
  const code = lang === "auto" ? "en" : lang;
  const list: TtsTarget[] = [
    { model: "x-ai/grok-voice-tts-1.0", voice: "ara" },
    { model: MS, voice: MS_VOICES[code] || MS_VOICES.en },
    { model: KOKORO, voice: KOKORO_VOICES[code] || KOKORO_VOICES.en },
  ];
  if (TTS_MODEL) list.unshift({ model: TTS_MODEL, voice: TTS_VOICE || "ara" });
  const seen = new Set<string>();
  return list.filter((t) => {
    const key = `${t.model}|${t.voice}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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
- Ignore translations, captions, UI, and headings. ${opts.sourceLang === target ? "The source and target language match; still extract vocabulary in that language." : `Ignore text in ${target} and in every other language.`}
- Keep original spelling of each kept word/phrase.
- Skip numbers and full paragraphs unless they are clearly vocab items in the source language.
- Deduplicate case-insensitively.
- Prefer single words or short phrases (max ~5 words).
- If nothing in the source language is found, return {"words":[],"sourceLang":"${opts.sourceLang === "auto" ? "und" : opts.sourceLang}"}.`;

  const json = await chat(
    [
      {
        type: "text",
        text: `Extract only ${opts.sourceLang === "auto" ? "source-language" : opts.sourceLang} vocabulary. Ignore interface text and translations.`,
      },
      { type: "image_url", image_url: { url: dataUrl } },
    ],
    system,
  );

  const words = Array.isArray(json.words)
    ? json.words.map((w: unknown) => String(w).trim()).filter(Boolean)
    : [];
  const sourceLang = String(json.sourceLang || opts.sourceLang || "und");
  return { words: uniqueIncoming(words).slice(0, 500), sourceLang };
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

  const system = `You are a language tutor making study cards.
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
  return uniqueIncoming(words).slice(0, 40);
}

export type GeneratedCheck = {
  kind: "mcq" | "write" | "tf";
  prompt: string;
  answer: string;
  options: string[];
  explanation: string;
};

export async function generateRule(opts: { prompt?: string; imageDataUrl?: string }) {
  const text = opts.prompt?.trim() || "";
  if (!text && !opts.imageDataUrl) throw new Error("Write a rule or attach a screenshot.");

  const system = `You are a language tutor. Explain ONE grammar or usage rule as a visual study sheet.
Return JSON only:
{
  "title":"short title",
  "markup":"<html snippet>",
  "checks":[
    {"kind":"mcq","prompt":"question","options":["a","b","c","d"],"answer":"exact matching option","explanation":"one line"},
    {"kind":"write","prompt":"transform or fill-in","answer":"expected reply","explanation":"one line"},
    {"kind":"tf","prompt":"true/false statement","answer":"true","explanation":"one line"}
  ]
}
Markup is HTML, not markdown. Allowed tags: p,h2,h3,ul,ol,li,table,thead,tbody,tr,th,td,strong,em,code,br,span,div,blockquote.
Allowed class names only: ex, ok, no, pair, label, rule-box.
No script, styles, iframes, or inline event handlers. No literal \\n characters.
Copy this structure:
<div class="rule-box"><p class="label">The pattern</p><p>Use <span class="ex">form A</span> for X. Use <span class="ex">form B</span> for Y.</p></div>
<div class="pair"><p class="ok">correct example</p><p class="no">incorrect example</p></div>
<h3>When to use it</h3>
<ul><li>...</li></ul>
<table><thead><tr><th>Use</th><th>Example</th></tr></thead><tbody><tr><td>...</td><td><span class="ex">...</span></td></tr></tbody></table>
Keep it compact: one formula box, one good-vs-bad pair, a short list or table. No walls of prose.
Create 8-12 checks mixing mcq, write, and tf.
For tf, answer must be "true" or "false".
For mcq, include 4 options and answer must be one of them.`;

  const content: ChatContent = opts.imageDataUrl
    ? [
        { type: "text", text: text || "Explain the language rule shown in this screenshot. Build visual HTML markup and practice checks." },
        { type: "image_url", image_url: { url: opts.imageDataUrl } },
      ]
    : `Explain this language rule and build visual HTML markup plus practice checks:\n${text}`;

  const json = await chat(content, system);
  const title = String(json.title || "Rule").trim() || "Rule";
  const markup = sanitizeMarkup(String(json.markup || ""));
  const checks: GeneratedCheck[] = Array.isArray(json.checks)
    ? json.checks.map((c: Record<string, unknown>) => {
        const kind = c.kind === "mcq" || c.kind === "tf" ? c.kind : "write";
        return {
          kind,
          prompt: String(c.prompt ?? "").trim(),
          answer: String(c.answer ?? "").trim(),
          options: Array.isArray(c.options) ? c.options.map((o) => String(o).trim()).filter(Boolean) : [],
          explanation: String(c.explanation ?? "").trim(),
        };
      })
    : [];
  if (!markup) throw new Error("AI did not return a usable rule explanation.");
  return { title, markup, checks: checks.filter((c) => c.prompt && c.answer).slice(0, 16) };
}

const ALLOWED_TAGS = new Set([
  "p", "h2", "h3", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td",
  "strong", "em", "b", "i", "code", "br", "span", "div", "blockquote",
]);
const ALLOWED_CLASS = /^(ex|ok|no|pair|label|rule-box)$/;

export function sanitizeMarkup(input: string) {
  const cleaned = input.replace(/\\n/g, "\n").replace(/\\t/g, " ").replace(/\\r/g, "");
  return cleaned.replace(/<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g, (full, tag: string, attrs = "") => {
    const name = tag.toLowerCase();
    const closing = full.startsWith("</");
    if (!ALLOWED_TAGS.has(name)) return "";
    if (closing) return `</${name}>`;
    if (name === "br") return "<br/>";
    const cls = /class\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const safe = (cls?.[1] || "")
      .split(/\s+/)
      .filter((c) => ALLOWED_CLASS.test(c))
      .join(" ");
    return safe ? `<${name} class="${safe}">` : `<${name}>`;
  });
}

function ttsKey(text: string, lang: string) {
  return createHash("sha256").update(`v2|${lang}|${text}`).digest("hex");
}

function rememberAudio(key: string, bytes: Uint8Array) {
  ttsMem.set(key, bytes);
  if (ttsMem.size > 400) {
    const first = ttsMem.keys().next().value;
    if (first) ttsMem.delete(first);
  }
  mkdir(TTS_CACHE, { recursive: true })
    .then(() => writeFile(join(TTS_CACHE, `${key}.mp3`), bytes))
    .catch(() => undefined);
}

async function ttsOnce(target: TtsTarget, input: string) {
  const started = Date.now();
  try {
    const res = await fetch(TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Quiz Words",
      },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model: target.model,
        input,
        voice: target.voice,
        response_format: "mp3",
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[quiz-words] TTS error", {
        model: target.model,
        status: res.status,
        durationMs: Date.now() - started,
        body: errText.slice(0, 400),
      });
      return { ok: false as const, status: res.status, body: errText };
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength < 64) {
      console.error("[quiz-words] TTS empty", { model: target.model, durationMs: Date.now() - started });
      return { ok: false as const, status: 502, body: "empty audio" };
    }
    console.log("[quiz-words] TTS ok", {
      model: target.model,
      durationMs: Date.now() - started,
      bytes: bytes.byteLength,
    });
    return { ok: true as const, bytes };
  } catch (err) {
    console.error("[quiz-words] TTS request failed", {
      model: target.model,
      durationMs: Date.now() - started,
      err: err instanceof Error ? err.message : err,
    });
    return { ok: false as const, status: 502, body: err instanceof Error ? err.message : "request failed" };
  }
}

export async function synthesizeSpeech(text: string, lang = "auto") {
  const input = text.trim().slice(0, 400);
  if (!input) throw new Error("Nothing to speak");
  const langKey = guessTtsLang(input, (lang || "auto").trim() || "auto");
  const key = ttsKey(input, langKey);
  const cached = ttsMem.get(key);
  if (cached) return cached;

  const file = join(TTS_CACHE, `${key}.mp3`);
  try {
    const fromDisk = await readFile(file);
    ttsMem.set(key, fromDisk);
    return fromDisk;
  } catch {
    // generate
  }

  const targets = ttsTargets(langKey);
  let last = "TTS failed";
  for (const target of targets) {
    console.log("[quiz-words] TTS request", { model: target.model, chars: input.length, lang: langKey });
    let result = await ttsOnce(target, input);
    if (!result.ok && result.status >= 500 && target.model.startsWith("x-ai/")) {
      result = await ttsOnce(target, input);
    }
    if (result.ok) {
      rememberAudio(key, result.bytes);
      return result.bytes;
    }
    last = `TTS error ${result.status}: ${result.body.slice(0, 200)}`;
  }
  throw new Error(last);
}
