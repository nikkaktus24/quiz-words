import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { answersMatch, shuffle } from "../lib/study";
import { getSavedUser } from "../session";
import type { Rule, RuleCheck } from "../types";

type Item = { check: RuleCheck; streak: number };

export function RuleLearnPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const user = getSavedUser();
  const ruleId = Number(id);
  const [rule, setRule] = useState<Rule | null>(null);
  const [all, setAll] = useState<RuleCheck[]>([]);
  const [queue, setQueue] = useState<Item[]>([]);
  const [current, setCurrent] = useState<Item | null>(null);
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
    api.rule(ruleId, user.id).then((data) => {
      setRule(data.rule);
      setAll(data.checks);
      boot(data.checks);
    });
  }, [nav, ruleId, user?.id]);

  function boot(list: RuleCheck[]) {
    const items = shuffle(list).map((check) => ({ check, streak: 0 }));
    setQueue(items.slice(1));
    setCurrent(items[0] || null);
    setMastered(0);
    setTyped("");
    setResult(null);
    setDone(list.length === 0);
  }

  const total = all.length;
  const pct = useMemo(() => (total ? Math.round((mastered / total) * 100) : 0), [mastered, total]);

  async function grade(correct: boolean) {
    if (!current || grading.current) return;
    grading.current = true;
    try {
      await api.reviewCheck(current.check.id, correct);
      const updated: Item = { check: current.check, streak: correct ? current.streak + 1 : 0 };
      const masteredNow = correct && updated.streak >= 2;
      const rest = [...queue];
      if (!masteredNow) rest.push(updated);
      setMastered(mastered + (masteredNow ? 1 : 0));
      setTyped("");
      setResult(null);
      const next = rest.shift();
      setQueue(rest);
      if (!next) {
        setCurrent(null);
        setDone(true);
      } else setCurrent(next);
    } finally {
      grading.current = false;
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!current || result) {
      if (result) void grade(result === "correct");
      return;
    }
    const ok = matches(current.check, typed);
    if (current.check.kind === "mcq" || current.check.kind === "tf") return;
    setResult(ok ? "correct" : "wrong");
  }

  function pick(value: string) {
    if (!current || result) return;
    const ok = matches(current.check, value);
    if (ok) void grade(true);
    else setResult("wrong");
  }

  if (!rule) return <div className="shell">Loading…</div>;

  return (
    <div className="shell study-shell">
      <header className="topbar">
        <div>
          <Link className="meta" to={`/rules/${rule.id}`}>
            ← {rule.title}
          </Link>
          <h1 style={{ marginTop: 6 }}>Learn</h1>
        </div>
      </header>

      {total === 0 && <p>This rule has no checks yet.</p>}

      {current && !done && (
        <>
          <div className="progress">
            <div style={{ width: `${pct}%` }} />
          </div>
          <p className="meta" style={{ textAlign: "center" }}>
            {mastered} / {total} mastered
          </p>
          <form className="write-panel" onSubmit={submit}>
            <div className="eyebrow">{current.check.kind === "tf" ? "True or false" : current.check.kind === "mcq" ? "Choose" : "Write"}</div>
            <div className="word">{current.check.prompt}</div>
            {current.check.kind === "mcq" && (
              <div className="choice-grid">
                {(current.check.options.length ? current.check.options : [current.check.answer]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`choice ${result && option === current.check.answer ? "correct" : ""}`}
                    disabled={!!result}
                    onClick={() => pick(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
            {current.check.kind === "tf" && (
              <div className="choice-grid two">
                {["true", "false"].map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`choice ${result && option === foldAnswer(current.check.answer) ? "correct" : ""}`}
                    disabled={!!result}
                    onClick={() => pick(option)}
                  >
                    {option === "true" ? "True" : "False"}
                  </button>
                ))}
              </div>
            )}
            {current.check.kind === "write" && (
              <input
                className={`field write-field ${result ?? ""}`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
                disabled={!!result}
                placeholder="Your answer"
              />
            )}
            {result === "wrong" && (
              <p className="error">
                {current.check.answer}
                {current.check.explanation ? ` — ${current.check.explanation}` : ""}
              </p>
            )}
            {result === "correct" && current.check.explanation && <p className="ok">{current.check.explanation}</p>}
            <div className="actions">
              {current.check.kind === "write" && !result && (
                <button className="primary" disabled={!typed.trim()}>
                  Check
                </button>
              )}
              {result && (
                <button className={result === "correct" ? "pine" : "primary"} type="button" onClick={() => void grade(result === "correct")}>
                  Continue
                </button>
              )}
            </div>
          </form>
        </>
      )}

      {done && total > 0 && (
        <div className="done">
          <h2>Rule mastered</h2>
          <div className="actions">
            <button className="primary" onClick={() => boot(all)}>
              Learn again
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

function foldAnswer(value: string) {
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "false") return v;
  return v;
}

function matches(check: RuleCheck, typed: string) {
  if (check.kind === "tf") return foldAnswer(typed) === foldAnswer(check.answer);
  if (check.kind === "mcq") return typed.trim() === check.answer.trim();
  return answersMatch(typed, check.answer);
}
