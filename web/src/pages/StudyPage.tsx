import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { getSavedUser } from "../session";
import { langLabel, type Card, type Deck } from "../types";

type Mode = "flip" | "write";
type WriteResult = "correct" | "wrong" | null;

export function StudyPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const user = getSavedUser();
  const deckId = Number(id);
  const mode: Mode = params.get("mode") === "write" ? "write" : "flip";

  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const [done, setDone] = useState(false);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<WriteResult>(null);

  useEffect(() => {
    if (!user) {
      nav("/");
      return;
    }
    api.deck(deckId).then((data) => {
      setDeck(data.deck);
      setCards(shuffle(data.cards));
    });
  }, [deckId, nav, user?.id]);

  const card = cards[i];
  const pct = useMemo(() => (cards.length ? Math.round((i / cards.length) * 100) : 0), [i, cards.length]);

  function setMode(next: Mode) {
    const nextParams = new URLSearchParams(params);
    if (next === "write") nextParams.set("mode", "write");
    else nextParams.delete("mode");
    setParams(nextParams, { replace: true });
    setFlipped(false);
    setTyped("");
    setResult(null);
  }

  async function mark(isKnown: boolean) {
    if (!card) return;
    await api.review(card.id, isKnown);
    if (isKnown) setKnown((n) => n + 1);
    setFlipped(false);
    setTyped("");
    setResult(null);
    if (i + 1 >= cards.length) setDone(true);
    else setI((n) => n + 1);
  }

  function checkWrite(e: FormEvent) {
    e.preventDefault();
    if (!card || result) return;
    const ok = answersMatch(typed, card.word);
    setResult(ok ? "correct" : "wrong");
  }

  function restart() {
    setCards(shuffle(cards));
    setI(0);
    setKnown(0);
    setDone(false);
    setFlipped(false);
    setTyped("");
    setResult(null);
  }

  if (!deck) return <div className="shell">Loading…</div>;

  const sourceName = langLabel(deck.source_lang);
  const promptLang = sourceName === "Detect" ? "word" : sourceName;

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <Link className="meta" to={`/decks/${deck.id}`}>
            ← {deck.name}
          </Link>
          <h1 style={{ marginTop: 6 }}>{mode === "write" ? "Write" : "Study"}</h1>
        </div>
        {cards.length > 0 && !done && (
          <div className="tabs">
            <button className={`tab ${mode === "flip" ? "on" : ""}`} onClick={() => setMode("flip")}>
              Flip
            </button>
            <button className={`tab ${mode === "write" ? "on" : ""}`} onClick={() => setMode("write")}>
              Write
            </button>
          </div>
        )}
      </header>

      {cards.length === 0 && <p>Add cards before studying.</p>}

      {cards.length > 0 && !done && card && mode === "flip" && (
        <>
          <div className="progress">
            <div style={{ width: `${pct}%` }} />
          </div>
          <p className="meta" style={{ textAlign: "center" }}>
            {i + 1} / {cards.length} · tap the card to flip
          </p>
          <div className="stage">
            <button className={`flip ${flipped ? "show-back" : ""}`} onClick={() => setFlipped((f) => !f)}>
              <div className="face">
                <div>
                  <div className="eyebrow">Word</div>
                  <div className="word">{card.word}</div>
                  <p className="sentence" style={{ marginTop: 16 }}>
                    {card.sentence}
                  </p>
                </div>
              </div>
              <div className="face back">
                <div>
                  <div className="eyebrow">Meaning</div>
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
            <button className="danger" onClick={() => void mark(false)}>
              Still learning
            </button>
            <button className="pine" onClick={() => void mark(true)}>
              I know it
            </button>
          </div>
        </>
      )}

      {cards.length > 0 && !done && card && mode === "write" && (
        <>
          <div className="progress">
            <div style={{ width: `${pct}%` }} />
          </div>
          <p className="meta" style={{ textAlign: "center" }}>
            {i + 1} / {cards.length} · type the {promptLang} word
          </p>
          <form className="write-panel" onSubmit={result ? (e) => { e.preventDefault(); void mark(result === "correct"); } : checkWrite}>
            <div className="eyebrow">Meaning</div>
            <div className="word">{card.translation}</div>
            <p className="sentence" style={{ marginTop: 14 }}>
              {blankSentence(card.sentence, card.word)}
            </p>
            <p className="sentence">{card.sentence_translation}</p>
            <label htmlFor="write-answer" style={{ marginTop: 18 }}>
              Your answer
            </label>
            <input
              id="write-answer"
              className={`field write-field ${result ?? ""}`}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              disabled={!!result}
              placeholder="Type the word"
            />
            {result === "correct" && <p className="ok">Correct</p>}
            {result === "wrong" && (
              <p className="error">
                The word is <strong>{card.word}</strong>
              </p>
            )}
            <div className="actions">
              {!result && (
                <button className="primary" disabled={!typed.trim()}>
                  Check
                </button>
              )}
              {result && (
                <button className={result === "correct" ? "pine" : "primary"}>
                  Continue
                </button>
              )}
            </div>
          </form>
        </>
      )}

      {done && (
        <div className="done">
          <h2>Round complete</h2>
          <p className="lede">
            You got {known} of {cards.length} {mode === "write" ? "right" : "marked as known"}.
          </p>
          <div className="actions">
            <button className="primary" onClick={restart}>
              Shuffle again
            </button>
            <Link className="ghost" to={`/decks/${deck.id}`}>
              Back to deck
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function shuffle<T>(list: T[]) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function answersMatch(typed: string, expected: string) {
  const a = fold(typed);
  const b = fold(expected);
  if (!a || !b) return false;
  if (a === b) return true;
  const stripped = expected.split(/[,(/]/)[0] ?? expected;
  return a === fold(stripped);
}

function blankSentence(sentence: string, word: string) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "i");
  if (!re.test(sentence)) return sentence;
  return sentence.replace(re, "______");
}
