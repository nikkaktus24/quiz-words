import type { Card, Deck, User } from "./types";

function apiBase() {
  const runtime = typeof window !== "undefined" ? window.__API_URL__ : "";
  const fromEnv = import.meta.env.VITE_API_URL ?? "";
  return String(runtime || fromEnv || "").replace(/\/$/, "");
}

function apiUrl(path: string) {
  return `${apiBase()}${path}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
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
  extractPhoto(file: File) {
    const form = new FormData();
    form.append("image", file);
    return request<{ words: string[]; sourceLang: string }>("/api/extract-photo", {
      method: "POST",
      body: form,
    });
  },
  generate(deckId: number, words: string[]) {
    return request<{ deck: Deck; cards: Card[]; added: number }>(`/api/decks/${deckId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words }),
    });
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
