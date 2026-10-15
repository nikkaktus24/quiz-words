import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { getSavedUser } from "../session";
import type { Card, Deck } from "../types";

export function parseIdsParam(raw: string | null) {
  return (raw || "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function useStudyPack() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const user = getSavedUser();
  const deckId = Number(id) || 0;
  const ids = parseIdsParam(params.get("ids"));
  const idsKey = ids.join(",");

  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [sourceLang, setSourceLang] = useState("auto");
  const [backTo, setBackTo] = useState("/home");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      nav("/");
      return;
    }
    if (ids.length) {
      api
        .study(user.id, ids)
        .then((data) => {
          setCards(data.cards);
          setSourceLang(data.source_lang);
          setBackTo("/home");
          setDeck({
            id: 0,
            user_id: user.id,
            name: data.decks.map((d) => d.name).join(" · ") || "Review",
            source_lang: data.source_lang,
            target_lang: data.target_lang,
            created_at: "",
          });
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Could not load review"));
      return;
    }
    if (!deckId) return;
    api
      .deck(deckId, user.id)
      .then((data) => {
        setDeck(data.deck);
        setCards(data.cards);
        setSourceLang(data.deck.source_lang);
        setBackTo(`/decks/${data.deck.id}`);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load set"));
  }, [deckId, idsKey, nav, user?.id]);

  return { user, deck, cards, sourceLang, backTo, ids, idsKey, error };
}
