// Preserve accents and punctuation: they can change a word's meaning.
export function wordKey(word: string) {
  return word.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

export function uniqueIncoming(words: string[]) {
  const seen = new Set<string>();
  return words.filter((word) => {
    const key = wordKey(word);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((word) => word.trim());
}
