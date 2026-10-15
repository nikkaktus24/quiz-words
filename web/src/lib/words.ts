export function wordKey(word: string) {
  return word.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

export function reviewWords(raw: string, existing: string[]) {
  const taken = new Set(existing.map(wordKey));
  const seen = new Set<string>();
  const words: string[] = [];
  let repeated = 0;
  let inSet = 0;
  for (const word of raw.split(/[\n,;]+/).map((w) => w.trim()).filter(Boolean)) {
    const key = wordKey(word);
    if (taken.has(key)) inSet++;
    else if (seen.has(key)) repeated++;
    else words.push(word);
    seen.add(key);
  }
  return { words, repeated, inSet, skipped: repeated + inSet };
}
