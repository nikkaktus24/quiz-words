import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { answersMatch, shuffle } from "../lib/study";
import { getSavedUser } from "../session";
import type { Rule, RuleCheck } from "../types";

export function RuleTestPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const user = getSavedUser();
  const ruleId = Number(id);
  const [rule, setRule] = useState<Rule | null>(null);
  const [checks, setChecks] = useState<RuleCheck[]>([]);
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState("");
  const [locked, setLocked] = useState(false);
  const [ok, setOk] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!user) {
      nav("/");
      return;
    }
    api.rule(ruleId, user.id).then((data) => {
      setRule(data.rule);
      const list = shuffle(data.checks);
      setChecks(list);
      setDone(list.length === 0);
    });
  }, [nav, ruleId, user?.id]);

  const q = checks[i];
  const pct = useMemo(
    () => (checks.length ? Math.round(((done ? checks.length : i) / checks.length) * 100) : 0),
    [i, checks.length, done],
  );

  function grade(correct: boolean) {
    if (!q || locked) return;
    setOk(correct);
    setLocked(true);
    void api.reviewCheck(q.id, correct);
  }

  function next() {
    setScore((n) => n + (ok ? 1 : 0));
    setTyped("");
    setLocked(false);
    setOk(false);
    if (i + 1 >= checks.length) setDone(true);
    else setI((n) => n + 1);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (locked) {
      next();
      return;
    }
    if (!q || q.kind !== "write") return;
    grade(answersMatch(typed, q.answer));
  }

  if (!rule) return <div className="shell">Loading…</div>;

  return (
    <div className="shell study-shell">
      <header className="topbar">
        <div>
          <Link className="meta" to={`/rules/${rule.id}`}>
            ← {rule.title}
          </Link>
          <h1 style={{ marginTop: 6 }}>Test</h1>
        </div>
      </header>

      {checks.length === 0 && <p>This rule has no checks yet.</p>}

      {q && !done && (
        <>
          <div className="progress">
            <div style={{ width: `${pct}%` }} />
          </div>
          <p className="meta" style={{ textAlign: "center" }}>
            {i + 1} / {checks.length}
          </p>
          <form className="write-panel" onSubmit={submit}>
            <div className="eyebrow">{q.kind === "tf" ? "True or false" : q.kind === "mcq" ? "Choose" : "Write"}</div>
            <div className="word">{q.prompt}</div>
            {q.kind === "mcq" && (
              <div className="choice-grid">
                {(q.options.length ? q.options : [q.answer]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`choice ${locked && option === q.answer ? "correct" : ""} ${locked && !ok && option !== q.answer ? "dim" : ""}`}
                    disabled={locked}
                    onClick={() => grade(option === q.answer)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
            {q.kind === "tf" && (
              <div className="choice-grid two">
                {["true", "false"].map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`choice ${locked && option === q.answer.trim().toLowerCase() ? "correct" : ""}`}
                    disabled={locked}
                    onClick={() => grade(option === q.answer.trim().toLowerCase())}
                  >
                    {option === "true" ? "True" : "False"}
                  </button>
                ))}
              </div>
            )}
            {q.kind === "write" && (
              <input
                className={`field write-field ${locked ? (ok ? "correct" : "wrong") : ""}`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={locked}
                autoFocus
                placeholder="Your answer"
              />
            )}
            {locked && (
              <p className={ok ? "ok" : "error"}>
                {ok ? "Correct" : q.answer}
                {q.explanation ? ` — ${q.explanation}` : ""}
              </p>
            )}
            <div className="actions">
              {q.kind === "write" && !locked && (
                <button className="primary" disabled={!typed.trim()}>
                  Check
                </button>
              )}
              {locked && (
                <button className="primary" type="button" onClick={next}>
                  Continue
                </button>
              )}
            </div>
          </form>
        </>
      )}

      {done && checks.length > 0 && (
        <div className="done">
          <div className="score-ring">{Math.round((score / checks.length) * 100)}%</div>
          <h2>Test complete</h2>
          <p className="lede">
            {score} of {checks.length} correct.
          </p>
          <div className="actions">
            <button
              className="primary"
              onClick={() => {
                setChecks(shuffle(checks));
                setI(0);
                setScore(0);
                setDone(false);
                setLocked(false);
                setTyped("");
              }}
            >
              Test again
            </button>
            <Link className="ghost" to={`/rules/${rule.id}`}>
              Back to rule
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
