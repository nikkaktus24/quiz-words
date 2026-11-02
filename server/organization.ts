import { wordKey } from "./words";
import type { Card } from "./db";

export type Bucket = { name: string; cardIds: number[]; reason: string };
export function uniqueStudyCards(cards: Card[]) {
  const keep = new Map<string, Card>();
  for (const card of cards) {
    const key = wordKey(card.word);
    const previous = keep.get(key);
    if (!previous || card.known_count + card.unknown_count > previous.known_count + previous.unknown_count) keep.set(key, card);
  }
  return [...keep.values()];
}
export function validateBuckets(value: unknown, cards: Card[]): Bucket[] {
  if (!Array.isArray(value) || !value.length || value.length > 12) throw new Error("Expected 1–12 suggested sets");
  const available = new Set(cards.map((card) => card.id));
  const seen = new Set<number>();
  const names = new Set<string>();
  const buckets = value.map((item) => {
    if (!item || typeof item.name !== "string" || !item.name.trim() || item.name.length > 80 || !Array.isArray(item.cardIds) || !item.cardIds.length) throw new Error("Invalid suggested set");
    const key = wordKey(item.name);
    if (names.has(key)) throw new Error("Suggested set names must be distinct");
    names.add(key);
    for (const id of item.cardIds) {
      if (!available.has(id) || seen.has(id)) throw new Error("Each word must appear exactly once");
      seen.add(id);
    }
    return { name: item.name.trim(), cardIds: item.cardIds as number[], reason: typeof item.reason === "string" ? item.reason.slice(0, 500) : "" };
  });
  if (seen.size !== available.size) throw new Error("The proposal omitted words. Please try again.");
  return buckets;
}
