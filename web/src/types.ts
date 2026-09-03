export type User = { id: number; username: string; created_at: string };

export type Deck = {
  id: number;
  user_id: number;
  name: string;
  source_lang: string;
  target_lang: string;
  created_at: string;
  card_count?: number;
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

export const LANGS = [
  { code: "auto", label: "Detect" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "uk", label: "Ukrainian" },
  { code: "pl", label: "Polish" },
  { code: "ru", label: "Russian" },
  { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" },
  { code: "ko", label: "Korean" },
  { code: "ar", label: "Arabic" },
] as const;

export function langLabel(code: string) {
  return LANGS.find((l) => l.code === code)?.label ?? code;
}
