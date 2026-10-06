import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { ModeNav } from "../components/ModeNav";
import { answersMatch, blankSentence, mcqOptions, shuffle } from "../lib/study";
import { getSavedUser } from "../session";
import { langLabel, type Card, type Deck } from "../types";

type Item = { card: Card; streak: number };
type Kind = "mcq" | "write";
type Prompt = { item: Item; kind: Kind; options: string[] };

export function LearnPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const user = getSavedUser();
  const deckId = Number(id);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [queue, setQueue] = useState<Item[]>([]);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [mastered, setMastered] = useState(0);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [done, setDone] = useState(false);
  const grading = useRef(false);

  useEffect(() => {
    if (!user) {
      nav("/");
      return;
    }
    api.deck(deckId, user.id).then((data) => {
      setDeck(data.deck);
      setAllCards(data.cards);
      const items = shuffle(data.cards).map((card) => ({ card, streak: 0 }));
      setQueue(items.slice(1));
      setMastered(0);
      setDone(data.cards.length === 0);
      if (items[0]) setPrompt(makePrompt(items[0], data.cards));
    });
  }, [deckId, nav, user?.id]);

  const total = allCards.length;
  const pct = useMemo(() => (total ? Math.round((mastered / total) * 100) : 0), [mastered, total]);

  function nextAfter(updated: Item, correct: boolean) {
    const masteredNow = correct && updated.streak >= 2;
    const rest = [...queue];
    if (!masteredNow) rest.push(updated);
    setMastered(mastered + (masteredNow ? 1 : 0));
    setTyped("");
    setResult(null);
    const next = rest.shift();
    setQueue(rest);
    if (!next) {
      setPrompt(null);
      setDone(true);
      return;
    }
    setPrompt(makePrompt(next, allCards));
  }

  async function grade(correct: boolean) {
    if (!prompt || grading.current) return;
    grading.current = true;
    try {
      await api.review(prompt.item.card.id, correct);
      const updated: Item = {
        card: prompt.item.card,
        streak: correct ? prompt.item.streak + 1 : 0,
      };
      nextAfter(updated, correct);
    } finally {
      grading.current = false;
    }
  }

  function checkWrite(e: FormEvent) {
    e.preventDefault();
    if (!prompt || result) return;
    const ok = answersMatch(typed, prompt.item.card.word);
    setResult(ok ? "correct" : "wrong");
  }

  function pickChoice(option: string) {
    if (!prompt || result) return;
    const ok = option === prompt.item.card.word;
    if (ok) {
      void grade(true);
      return;
    }
    setResult("wrong");
  }

  function continueAfterReveal() {
    if (!result) return;
    void grade(result === "correct");
  }

  if (!deck) return <div className="shell">Loading…</div>;

  const sourceName = langLabel(deck.source_lang);
  const promptLang = sourceName === "Detect" ? "term" : sourceName;

  return (
    <div className="shell study-shell">
      <header className="topbar">
        <div>
          <Link className="meta" to={`/decks/${deck.id}`}>
            ← {deck.name}
          </Link>
          <h1 style={{ marginTop: 6 }}>Learn</h1>
        </div>
        <ModeNav deckId={deck.id} active="learn" />
      </header>

      {total === 0 && <p>Add cards before studying.</p>}

      {total > 0 && !done && prompt && (
        <>
          <div className="progress">
            <div style={{ width: `${pct}%` }} />
          </div>
          <p className="meta" style={{ textAlign: "center" }}>
            {mastered} / {total} mastered · {queue.length + 1} left in this round
          </p>

          {prompt.kind === "mcq" && (
            <div className="write-panel">
              <div className="eyebrow">Definition</div>
              <div className="word">{prompt.item.card.translation}</div>
              <p className="sentence" style={{ marginTop: 12 }}>
                {prompt.item.card.sentence_translation}
              </p>
              <div className="choice-grid">
                {prompt.options.map((option) => (
                  <button
                    key={option}
                    className={`choice ${result && option === prompt.item.card.word ? "correct" : ""} ${
                      result === "wrong" && option !== prompt.item.card.word ? "dim" : ""
                    }`}
                    disabled={!!result}
                    onClick={() => pickChoice(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              {result === "wrong" && (
                <p className="error">
                  Correct answer: <strong>{prompt.item.card.word}</strong>
                </p>
              )}
              {result && (
                <div className="actions">
                  <button className={result === "correct" ? "pine" : "primary"} onClick={continueAfterReveal}>
                    Continue
                  </button>
                </div>
              )}
            </div>
          )}

          {prompt.kind === "write" && (
            <form
              className="write-panel"
              onSubmit={result ? (e) => { e.preventDefault(); continueAfterReveal(); } : checkWrite}
            >
              <div className="eyebrow">Type the {promptLang}</div>
              <div className="word">{prompt.item.card.translation}</div>
              <p className="sentence" style={{ marginTop: 14 }}>
                {blankSentence(prompt.item.card.sentence, prompt.item.card.word)}
              </p>
              <p className="sentence">{prompt.item.card.sentence_translation}</p>
              <label htmlFor="learn-answer" style={{ marginTop: 18 }}>
                Your answer
              </label>
              <input
                id="learn-answer"
                className={`field write-field ${result ?? ""}`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                disabled={!!result}
                placeholder="Type the term"
              />
              {result === "correct" && <p className="ok">Correct</p>}
              {result === "wrong" && (
                <p className="error">
                  The term is <strong>{prompt.item.card.word}</strong>
                </p>
              )}
              <div className="actions">
                {!result && (
                  <>
                    <button className="ghost" type="button" onClick={() => setResult("wrong")}>
                      Don&apos;t know
                    </button>
                    <button className="primary" disabled={!typed.trim()}>
                      Check
                    </button>
                  </>
                )}
                {result && (
                  <button className={result === "correct" ? "pine" : "primary"}>Continue</button>
                )}
              </div>
            </form>
          )}
        </>
      )}

      {done && total > 0 && (
        <div className="done">
          <h2>You mastered this set</h2>
          <p className="lede">Every term reached the written round. Start again to keep it fresh.</p>
          <div className="actions">
            <button
              className="primary"
              onClick={() => {
                const items = shuffle(allCards).map((card) => ({ card, streak: 0 }));
                setQueue(items.slice(1));
                setMastered(0);
                setDone(false);
                setTyped("");
                setResult(null);
                if (items[0]) setPrompt(makePrompt(items[0], allCards));
              }}
            >
              Learn again
            </button>
            <Link className="ghost" to={`/decks/${deck.id}`}>
              Back to set
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function makePrompt(item: Item, cards: Card[]): Prompt {
  const write = item.streak >= 1 || cards.length < 3;
  if (write) return { item, kind: "write", options: [] };
  return { item, kind: "mcq", options: mcqOptions(item.card, cards, "word") };
}
