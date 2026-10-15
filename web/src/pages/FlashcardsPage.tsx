import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ModeNav } from "../components/ModeNav";
import { SpeakButton } from "../components/SpeakButton";
import { shuffle } from "../lib/study";
import { useStudyPack } from "../lib/useStudyPack";
import type { Card } from "../types";

export function FlashcardsPage() {
  const { deck, cards: loaded, sourceLang, backTo, ids, error } = useStudyPack();
  const [cards, setCards] = useState<Card[]>([]);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setCards(shuffle(loaded));
    setI(0);
    setKnown(0);
    setDone(false);
    setFlipped(false);
  }, [loaded]);

  const card = cards[i];
  const pct = useMemo(() => (cards.length ? Math.round(((done ? cards.length : i) / cards.length) * 100) : 0), [i, cards.length, done]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
      if (e.key === "1") void mark(false);
      if (e.key === "2") void mark(true);
      if (e.key === "ArrowRight" && flipped) void mark(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function mark(isKnown: boolean) {
    if (!card || done) return;
    await api.review(card.id, isKnown);
    if (isKnown) setKnown((n) => n + 1);
    setFlipped(false);
    if (i + 1 >= cards.length) setDone(true);
    else setI((n) => n + 1);
  }

  function restart() {
    setCards(shuffle(cards));
    setI(0);
    setKnown(0);
    setDone(false);
    setFlipped(false);
  }

  if (!deck) return <div className="shell">{error || "Loading…"}</div>;

  return (
    <div className="shell study-shell">
      <header className="topbar">
        <div>
          <Link className="meta" to={backTo}>
            ← {deck.name}
          </Link>
          <h1 style={{ marginTop: 6 }}>Flashcards</h1>
        </div>
        <ModeNav deckId={deck.id} active="cards" ids={ids} />
      </header>

      {cards.length === 0 && <p>Add cards before studying.</p>}

      {cards.length > 0 && !done && card && (
        <>
          <div className="progress">
            <div style={{ width: `${pct}%` }} />
          </div>
          <p className="meta" style={{ textAlign: "center" }}>
            {i + 1} / {cards.length} · click or space to flip · press 1 still learning · 2 know it
          </p>
          <div className="stage">
            <button className={`flip ${flipped ? "show-back" : ""}`} onClick={() => setFlipped((f) => !f)}>
              <div className="face">
                <div>
                  <div className="eyebrow">Term</div>
                  <div className="word">{card.word}</div>
                  <p className="sentence" style={{ marginTop: 16 }}>
                    {card.sentence}
                  </p>
                </div>
              </div>
              <div className="face back">
                <div>
                  <div className="eyebrow">Definition</div>
                  <div className="word">{card.translation}</div>
                  <p className="sentence" style={{ marginTop: 16 }}>
                    {card.sentence_translation}
                  </p>
                  {card.notes && <p className="note">{card.notes}</p>}
                </div>
              </div>
            </button>
          </div>
          <div className="actions">
            <SpeakButton text={card.word} lang={card.source_lang || sourceLang} />
            <button className="danger" onClick={() => void mark(false)}>
              Still learning
            </button>
            <button className="pine" onClick={() => void mark(true)}>
              Know
            </button>
          </div>
        </>
      )}

      {done && (
        <div className="done">
          <h2>Round complete</h2>
          <p className="lede">
            You marked {known} of {cards.length} as known.
          </p>
          <div className="actions">
            <button className="primary" onClick={restart}>
              Shuffle again
            </button>
            <Link className="ghost" to={backTo}>
              Back
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
