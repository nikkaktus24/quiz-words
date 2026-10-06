import type { Card } from "../types";

export function shuffle<T>(list: T[]) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function answersMatch(typed: string, expected: string) {
  const a = fold(typed);
  const b = fold(expected);
  if (!a || !b) return false;
  if (a === b) return true;
  const stripped = expected.split(/[,(/]/)[0] ?? expected;
  return a === fold(stripped);
}

export function blankSentence(sentence: string, word: string) {
  if (!sentence) return "";
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "i");
  if (!re.test(sentence)) return sentence;
  return sentence.replace(re, "______");
}

export function distractors(card: Card, cards: Card[], take: number, field: "word" | "translation") {
  const pool = shuffle(cards.filter((c) => c.id !== card.id));
  const seen = new Set<string>([fold(card[field])]);
  const out: string[] = [];
  for (const other of pool) {
    const value = other[field].trim();
    const key = fold(value);
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= take) break;
  }
  return out;
}

export function mcqOptions(card: Card, cards: Card[], field: "word" | "translation") {
  const extra = distractors(card, cards, 3, field);
  return shuffle([card[field], ...extra]);
}

export type TestQuestion =
  | { type: "written"; card: Card }
  | { type: "mcq"; card: Card; options: string[] }
  | { type: "tf"; card: Card; shown: string; truth: boolean }
  | { type: "match"; items: Card[] };

export function buildTest(cards: Card[]): TestQuestion[] {
  const shuffled = shuffle(cards);
  const questions: TestQuestion[] = [];
  let i = 0;
  let kind = 0;
  while (i < shuffled.length) {
    const mode = kind % 4;
    if (mode === 3 && i + 4 <= shuffled.length) {
      questions.push({ type: "match", items: shuffled.slice(i, i + 4) });
      i += 4;
    } else if (mode === 1 && shuffled.length >= 3) {
      const card = shuffled[i++];
      questions.push({ type: "mcq", card, options: mcqOptions(card, shuffled, "word") });
    } else if (mode === 2 && shuffled.length >= 2) {
      const card = shuffled[i++];
      const truth = Math.random() < 0.5;
      const others = shuffled.filter((c) => c.id !== card.id);
      const shown = truth ? card.translation : others[Math.floor(Math.random() * others.length)]?.translation || card.translation;
      questions.push({ type: "tf", card, shown, truth: shown === card.translation });
    } else {
      questions.push({ type: "written", card: shuffled[i++] });
    }
    kind += 1;
  }
  return questions;
}

export function questionPoints(q: TestQuestion) {
  return q.type === "match" ? q.items.length : 1;
}
