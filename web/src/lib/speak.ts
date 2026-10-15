import { api } from "../api";

const urls = new Map<string, string>();
let current: HTMLAudioElement | null = null;

function cacheKey(text: string, lang: string) {
  return `${lang}:${text.trim().toLowerCase()}`;
}

export async function speak(text: string, lang = "auto") {
  const value = text.trim();
  if (!value || typeof window === "undefined") return;
  const key = cacheKey(value, lang || "auto");
  let url = urls.get(key);
  if (!url) {
    const blob = await api.speak(value, lang);
    url = URL.createObjectURL(blob);
    urls.set(key, url);
  }
  if (current) {
    current.pause();
    current.src = "";
  }
  const audio = new Audio(url);
  current = audio;
  await audio.play();
}
