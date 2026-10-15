const LANG_KEY = "quiz-words-langs";

export function getLangPrefs() {
  try {
    const raw = localStorage.getItem(LANG_KEY);
    const parsed = raw ? (JSON.parse(raw) as { sourceLang?: string; targetLang?: string }) : {};
    return {
      sourceLang: parsed.sourceLang || "auto",
      targetLang: parsed.targetLang || "en",
    };
  } catch {
    return { sourceLang: "auto", targetLang: "en" };
  }
}

export function saveLangPrefs(sourceLang: string, targetLang: string) {
  localStorage.setItem(LANG_KEY, JSON.stringify({ sourceLang, targetLang }));
}
