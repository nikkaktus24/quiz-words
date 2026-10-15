const LANG: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  pt: "pt-PT",
  uk: "uk-UA",
  pl: "pl-PL",
  ru: "ru-RU",
  ja: "ja-JP",
  zh: "zh-CN",
  ko: "ko-KR",
  ar: "ar-SA",
};

const HINTS: [RegExp, string][] = [
  [/[áéíóúñ¿¡]/i, "es"],
  [/\b(el|la|los|las|hola|gracias|por|qué|cómo|está|estoy|buenos|días)\b/i, "es"],
  [/[àâçéèêëîïôûùüÿœ]/i, "fr"],
  [/\b(bonjour|merci|être|avec|vous|je|pas|une)\b/i, "fr"],
  [/[äöüß]/i, "de"],
  [/\b(der|die|das|und|nicht|ich|sie|ein)\b/i, "de"],
  [/\b(ciao|grazie|sono|che|non|una)\b/i, "it"],
  [/\b(olá|obrigado|não|você|uma)\b/i, "pt"],
  [/[ґєії]/i, "uk"],
  [/[\u0400-\u04FF]/, "ru"],
  [/[\u3040-\u30ff]/, "ja"],
  [/[\u4e00-\u9fff]/, "zh"],
  [/[\uac00-\ud7af]/, "ko"],
  [/[\u0600-\u06FF]/, "ar"],
  [/\b(the|and|you|not|this)\b/i, "en"],
];

export function guessSpeakLang(text: string) {
  for (const [re, code] of HINTS) {
    if (re.test(text)) return code;
  }
  return "en";
}

function pickVoice(lang: string) {
  const voices = window.speechSynthesis.getVoices();
  const prefix = (LANG[lang] || lang).slice(0, 2).toLowerCase();
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix) && v.localService) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix))
  );
}

export function speak(text: string, lang = "auto") {
  const value = text.trim();
  if (!value || typeof window === "undefined" || !window.speechSynthesis) return;
  const code = !lang || lang === "auto" ? guessSpeakLang(value) : lang;
  const run = () => {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(value);
    utter.lang = LANG[code] || (code.includes("-") ? code : "en-US");
    utter.rate = 0.92;
    const voice = pickVoice(code);
    if (voice) utter.voice = voice;
    window.speechSynthesis.speak(utter);
  };
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.addEventListener("voiceschanged", run, { once: true });
  }
  run();
}
