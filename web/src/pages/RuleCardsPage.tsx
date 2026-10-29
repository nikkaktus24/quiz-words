import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { getSavedUser } from "../session";
import type { Rule, RuleCheck } from "../types";

export function RuleCardsPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const user = getSavedUser();
  const [rule, setRule] = useState<Rule | null>(null);
  const [checks, setChecks] = useState<RuleCheck[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!user) { nav("/"); return; }
    api.rule(Number(id), user.id).then((data) => { setRule(data.rule); setChecks(data.checks); }).catch((err) => setError(err.message));
  }, [id, nav, user?.id]);
  async function mark(known: boolean) {
    setSaving(true); setError("");
    try { await api.reviewCheck(checks[index].id, known); setFlipped(false); setIndex((i) => i + 1); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not save progress"); }
    finally { setSaving(false); }
  }
  if (!rule) return <div className="shell"><Link to="/home">← Your library</Link><p role="status">{error || "Loading…"}</p></div>;
  const current = checks[index];
  return <div className="shell"><header className="topbar"><div><Link className="meta" to={`/rules/${rule.id}`}>← {rule.title}</Link><h1>Rule flashcards</h1><p className="meta">{Math.min(index + 1, checks.length)} / {checks.length}</p></div></header>
    {error && <p className="error" role="alert">{error}</p>}
    {!checks.length ? <p>This rule has no practice questions yet.</p> : current ? <><div className="stage"><button className={`flip ${flipped ? "show-back" : ""}`} onClick={() => setFlipped(!flipped)} aria-label={flipped ? "Show question" : "Reveal answer"}><span className="face"><span><small className="meta">QUESTION · CLICK TO REVEAL</small><h2>{current.prompt}</h2></span></span><span className="face back"><span><small className="meta">ANSWER</small><h2>{current.answer}</h2><p>{current.explanation}</p></span></span></button></div><div className="actions"><button className="ghost" disabled={!flipped || saving} onClick={() => void mark(false)}>Still learning</button><button className="primary" disabled={!flipped || saving} onClick={() => void mark(true)}>I know this</button></div></> : <div className="done"><h2>Review complete</h2><p>You reviewed {checks.length} questions.</p><div className="actions"><button className="primary" onClick={() => { setIndex(0); setFlipped(false); }}>Review again</button><Link className="ghost" to={`/rules/${rule.id}`}>Back to rule</Link></div></div>}
  </div>;
}
