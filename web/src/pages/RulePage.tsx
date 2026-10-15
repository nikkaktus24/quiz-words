import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { getSavedUser } from "../session";
import type { Rule, RuleCheck } from "../types";

export function RulePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const user = getSavedUser();
  const ruleId = Number(id);
  const [rule, setRule] = useState<Rule | null>(null);
  const [checks, setChecks] = useState<RuleCheck[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      nav("/");
      return;
    }
    api
      .rule(ruleId, user.id)
      .then((data) => {
        setRule(data.rule);
        setChecks(data.checks);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load rule"));
  }, [nav, ruleId, user?.id]);

  async function remove() {
    if (!rule || !confirm(`Delete “${rule.title}”?`)) return;
    await api.deleteRule(rule.id, user?.id);
    nav("/home");
  }

  if (!rule) return <div className="shell">{error || "Loading…"}</div>;
  const count = checks.length;

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <Link className="meta" to="/home">
            ← Your library
          </Link>
          <h1 style={{ marginTop: 6 }}>{rule.title}</h1>
          <p className="meta">{count} check{count === 1 ? "" : "s"}</p>
        </div>
        <button className="danger" onClick={() => void remove()}>
          Delete
        </button>
      </header>

      <div className="mode-grid">
        <Link className={`mode-tile learn ${count === 0 ? "off" : ""}`} to={count ? `/rules/${rule.id}/learn` : "#"}>
          <div>
            <strong>Learn</strong>
            <p>Practice the checks until they stick.</p>
          </div>
        </Link>
        <Link className={`mode-tile test ${count === 0 ? "off" : ""}`} to={count ? `/rules/${rule.id}/test` : "#"}>
          <div>
            <strong>Test</strong>
            <p>One scored pass through the checks.</p>
          </div>
        </Link>
      </div>

      <section className="panel rule-panel">
        <div className="rule-markup" dangerouslySetInnerHTML={{ __html: visibleMarkup(rule.markup) }} />
      </section>

      {count > 0 && (
        <>
          <h2 className="terms-heading">Checks ({count})</h2>
          <ol className="check-preview">
            {checks.map((c) => (
              <li key={c.id}>
                <span className="meta">{c.kind}</span> {c.prompt}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function visibleMarkup(html: string) {
  return html.replace(/\\n/g, "").replace(/\\t/g, " ").replace(/\\r/g, "");
}
