import type { Card, Deck, User } from "./types";

function apiBase() {
  const runtime = typeof window !== "undefined" ? window.__API_URL__ : "";
  const fromEnv = import.meta.env.VITE_API_URL ?? "";
  return String(runtime || fromEnv || "").trim().replace(/\/$/, "");
}

function apiUrl(path: string) {
  const base = apiBase();
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = apiUrl(path);
  const method = init?.method || "GET";
  const started = performance.now();
  try {
    const res = await fetch(url, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(10 * 60 * 1000),
    });
    const text = await res.text();
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text.slice(0, 800) };
    }
    if (!res.ok) {
      console.error("[quiz-words] request failed", {
        method,
        url,
        status: res.status,
        durationMs: Math.round(performance.now() - started),
        body: data,
      });
      throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
    }
    return data as T;
  } catch (err) {
    console.error("[quiz-words] request error", {
      method,
      url,
      durationMs: Math.round(performance.now() - started),
      err,
    });
    throw err;
  }
}

export const api = {
  profile(username: string) {
    return request<User>("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
  },
  userDecks(userId: number) {
    return request<{ user: User; decks: Deck[] }>(`/api/users/${userId}/decks`);
  },
  createDeck(body: { userId: number; name: string; sourceLang: string; targetLang: string }) {
    return request<Deck>("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },
  deck(id: number) {
    return request<{ deck: Deck; cards: Card[] }>(`/api/decks/${id}`);
  },
  deleteDeck(id: number) {
    return request<{ ok: boolean }>(`/api/decks/${id}`, { method: "DELETE" });
  },
  extractPhoto(deckId: number, file: File) {
    const form = new FormData();
    form.append("image", file);
    return request<{ words: string[]; sourceLang: string }>(`/api/decks/${deckId}/extract-photo`, {
      method: "POST",
      body: form,
    });
  },
  generate(deckId: number, words: string[]) {
    return request<{ deck: Deck; cards: Card[]; added: number; skipped: number }>(
      `/api/decks/${deckId}/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words }),
      },
    );
  },
  deleteCard(id: number) {
    return request<{ ok: boolean }>(`/api/cards/${id}`, { method: "DELETE" });
  },
  review(id: number, known: boolean) {
    return request<Card>(`/api/cards/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ known }),
    });
  },
};
