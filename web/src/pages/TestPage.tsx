import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { ModeNav } from "../components/ModeNav";
import { answersMatch, buildTest, questionPoints, shuffle, type TestQuestion } from "../lib/study";
import { getSavedUser } from "../session";
import type { Card, Deck } from "../types";

type Answer = { correct: number; total: number };

export function TestPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const user = getSavedUser();
  const deckId = Number(id);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [i, setI] = useState(0);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<string | boolean | null>(null);
  const [locked, setLocked] = useState(false);
  const [done, setDone] = useState(false);
  const [matchLeft, setMatchLeft] = useState<Card[]>([]);
  const [matchRight, setMatchRight] = useState<Card[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [matchWrong, setMatchWrong] = useState(0);

  useEffect(() => {
    if (!user) {
      nav("/");
      return;
    }
    api.deck(deckId, user.id).then((data) => {
      setDeck(data.deck);
      setCards(data.cards);
      start(data.cards);
    });
  }, [deckId, nav, user?.id]);

  function start(list: Card[]) {
    const qs = buildTest(list);
    setQuestions(qs);
    setI(0);
    setScore({ correct: 0, total: 0 });
    setTyped("");
    setPicked(null);
    setLocked(false);
    setDone(list.length === 0);
    prepareMatch(qs[0]);
  }

  function prepareMatch(q?: TestQuestion) {
    setSelected(null);
    setMatched(new Set());
    setMatchWrong(0);
    if (q?.type === "match") {
      setMatchLeft(q.items);
      setMatchRight(shuffle(q.items));
    } else {
      setMatchLeft([]);
      setMatchRight([]);
    }
  }

  const q = questions[i];
  const max = useMemo(() => questions.reduce((n, item) => n + questionPoints(item), 0), [questions]);
  const pct = useMemo(
    () => (questions.length ? Math.round(((done ? questions.length : i) / questions.length) * 100) : 0),
    [i, questions.length, done],
  );

  function advance(answer: Answer) {
    const nextScore = { correct: score.correct + answer.correct, total: score.total + answer.total };
    setScore(nextScore);
    setTyped("");
    setPicked(null);
    setLocked(false);
    if (i + 1 >= questions.length) {
      setDone(true);
      return;
    }
    const next = questions[i + 1];
    setI((n) => n + 1);
    prepareMatch(next);
  }

  function submitWritten(e: FormEvent) {
    e.preventDefault();
    if (!q || q.type !== "written" || locked) return;
    const ok = answersMatch(typed, q.card.word);
    setLocked(true);
    setPicked(ok);
    void api.review(q.card.id, ok);
  }

  function submitMcq(option: string) {
    if (!q || q.type !== "mcq" || locked) return;
    const ok = option === q.card.word;
    setPicked(option);
    setLocked(true);
    void api.review(q.card.id, ok);
  }

  function submitTf(value: boolean) {
    if (!q || q.type !== "tf" || locked) return;
    setPicked(value);
    setLocked(true);
    void api.review(q.card.id, value === q.truth);
  }

  function clickMatch(id: number, side: "left" | "right") {
    if (!q || q.type !== "match" || locked) return;
    if (matched.has(id) && side === "left") return;
    if (side === "left") {
      setSelected(id);
      return;
    }
    if (selected == null) return;
    if (selected === id) {
      const next = new Set(matched);
      next.add(id);
      setMatched(next);
      setSelected(null);
      void api.review(id, true);
      if (next.size === q.items.length) setLocked(true);
    } else {
      setMatchWrong((n) => n + 1);
      setSelected(null);
      void api.review(selected, false);
    }
  }

  function continueLocked() {
    if (!q || !locked) return;
    if (q.type === "written") advance({ correct: picked === true ? 1 : 0, total: 1 });
    else if (q.type === "mcq") advance({ correct: picked === q.card.word ? 1 : 0, total: 1 });
    else if (q.type === "tf") advance({ correct: picked === q.truth ? 1 : 0, total: 1 });
    else {
      const correct = Math.max(0, q.items.length - matchWrong);
      advance({ correct, total: q.items.length });
    }
  }

  if (!deck) return <div className="shell">Loading…</div>;

  return (
    <div className="shell study-shell">
      <header className="topbar">
        <div>
          <Link className="meta" to={`/decks/${deck.id}`}>
            ← {deck.name}
          </Link>
          <h1 style={{ marginTop: 6 }}>Test</h1>
        </div>
        <ModeNav deckId={deck.id} active="test" />
      </header>

      {cards.length === 0 && <p>Add cards before taking a test.</p>}

      {cards.length > 0 && !done && q && (
        <>
          <div className="progress">
            <div style={{ width: `${pct}%` }} />
          </div>
          <p className="meta" style={{ textAlign: "center" }}>
            Question {i + 1} of {questions.length}
          </p>

          {q.type === "written" && (
            <form className="write-panel" onSubmit={locked ? (e) => { e.preventDefault(); continueLocked(); } : submitWritten}>
              <div className="eyebrow">Written</div>
              <div className="word">{q.card.translation}</div>
              <label htmlFor="test-answer" style={{ marginTop: 18 }}>
                Type the term
              </label>
              <input
                id="test-answer"
                className={`field write-field ${locked ? (picked ? "correct" : "wrong") : ""}`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                disabled={locked}
              />
              {locked && !picked && (
                <p className="error">
                  Answer: <strong>{q.card.word}</strong>
                </p>
              )}
              {locked && picked === true && <p className="ok">Correct</p>}
              <div className="actions">
                <button className="primary" disabled={!locked && !typed.trim()}>
                  {locked ? "Continue" : "Answer"}
                </button>
              </div>
            </form>
          )}

          {q.type === "mcq" && (
            <div className="write-panel">
              <div className="eyebrow">Multiple choice</div>
              <div className="word">{q.card.translation}</div>
              <div className="choice-grid">
                {q.options.map((option) => (
                  <button
                    key={option}
                    className={`choice ${locked && option === q.card.word ? "correct" : ""} ${
                      locked && picked === option && option !== q.card.word ? "wrong" : ""
                    }`}
                    disabled={locked}
                    onClick={() => submitMcq(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              {locked && (
                <div className="actions">
                  <button className="primary" onClick={continueLocked}>
                    Continue
                  </button>
                </div>
              )}
            </div>
          )}

          {q.type === "tf" && (
            <div className="write-panel">
              <div className="eyebrow">True or false</div>
              <div className="word">{q.card.word}</div>
              <p className="lede" style={{ marginBottom: 8 }}>
                Definition: {q.shown}
              </p>
              <div className="choice-grid two">
                <button
                  className={`choice ${locked && q.truth ? "correct" : ""} ${locked && picked === true && !q.truth ? "wrong" : ""}`}
                  disabled={locked}
                  onClick={() => submitTf(true)}
                >
                  True
                </button>
                <button
                  className={`choice ${locked && !q.truth ? "correct" : ""} ${locked && picked === false && q.truth ? "wrong" : ""}`}
                  disabled={locked}
                  onClick={() => submitTf(false)}
                >
                  False
                </button>
              </div>
              {locked && (
                <div className="actions">
                  <button className="primary" onClick={continueLocked}>
                    Continue
                  </button>
                </div>
              )}
            </div>
          )}

          {q.type === "match" && (
            <div className="write-panel">
              <div className="eyebrow">Matching</div>
              <p className="meta">Tap a term, then its definition.</p>
              <div className="match-grid">
                <div>
                  {matchLeft.map((card) => (
                    <button
                      key={`l-${card.id}`}
                      className={`choice ${selected === card.id ? "on" : ""} ${matched.has(card.id) ? "correct" : ""}`}
                      disabled={matched.has(card.id) || locked}
                      onClick={() => clickMatch(card.id, "left")}
                    >
                      {card.word}
                    </button>
                  ))}
                </div>
                <div>
                  {matchRight.map((card) => (
                    <button
                      key={`r-${card.id}`}
                      className={`choice ${matched.has(card.id) ? "correct" : ""}`}
                      disabled={matched.has(card.id) || locked}
                      onClick={() => clickMatch(card.id, "right")}
                    >
                      {card.translation}
                    </button>
                  ))}
                </div>
              </div>
              {matchWrong > 0 && !locked && <p className="error">{matchWrong} miss{matchWrong === 1 ? "" : "es"}</p>}
              {locked && (
                <div className="actions">
                  <button className="primary" onClick={continueLocked}>
                    Continue
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {done && cards.length > 0 && (
        <div className="done">
          <div className="score-ring">{max ? Math.round((score.correct / max) * 100) : 0}%</div>
          <h2>Test complete</h2>
          <p className="lede">
            {score.correct} of {max} correct.
          </p>
          <div className="actions">
            <button className="primary" onClick={() => start(cards)}>
              Take test again
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
