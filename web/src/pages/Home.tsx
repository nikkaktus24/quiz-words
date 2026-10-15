import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { ImportPanel, type ImportSubmit } from "../components/ImportPanel";
import { RenameName } from "../components/RenameName";
import { getLangPrefs, saveLangPrefs } from "../lib/prefs";
import { clearUser, getSavedUser } from "../session";
import { LANGS, langLabel, type Deck, type Rule } from "../types";

export function Home() {
  const nav = useNavigate();
  const user = getSavedUser();
  const langs = getLangPrefs();
  const [tab, setTab] = useState<"sets" | "rules">("sets");
  const [decks, setDecks] = useState<Deck[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [composer, setComposer] = useState<"set" | "rule" | "">("");
  const [name, setName] = useState("");
  const [shareWith, setShareWith] = useState("");
  const [sourceLang, setSourceLang] = useState(langs.sourceLang);
  const [targetLang, setTargetLang] = useState(langs.targetLang);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [staged, setStaged] = useState<{ payload: ImportSubmit; label: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [shareDeckId, setShareDeckId] = useState<number | null>(null);
  const [shareNames, setShareNames] = useState("");
  const [rulePrompt, setRulePrompt] = useState("");
  const [ruleTitle, setRuleTitle] = useState("");
  const [ruleImage, setRuleImage] = useState<File | null>(null);
  const [ruleBusy, setRuleBusy] = useState(false);
  const [ruleError, setRuleError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"all" | "mine" | "shared">("all");

  useEffect(() => {
    if (!user) {
      nav("/");
      return;
    }
    api
      .userDecks(user.id)
      .then((data) => setDecks(data.decks))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    api
      .userRules(user.id)
      .then((data) => setRules(data.rules))
      .catch((err) => setRuleError(err.message));
  }, [nav, user?.id]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  if (!user) return null;
  const me = user;

  function setLangs(source: string, target: string) {
    setSourceLang(source);
    setTargetLang(target);
    saveLangPrefs(source, target);
  }

  async function afterShare(deckId: number) {
    const names = shareWith
      .split(/[\n,;]+/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (!names.length) return;
    await api.share(deckId, me.id, names);
  }

  async function onCreate() {
    setBusy(true);
    setError("");
    try {
      if (staged) {
        const data = await api.importSet({
          userId: me.id,
          sourceLang,
          targetLang,
          name: name.trim() || "Imported set",
          ...staged.payload,
        });
        await afterShare(data.deck.id);
        nav(`/decks/${data.deck.id}`);
        return;
      }
      const title = name.trim();
      if (!title) {
        setError("Name required");
        return;
      }
      const deck = await api.createDeck({ userId: me.id, name: title, sourceLang, targetLang });
      await afterShare(deck.id);
      nav(`/decks/${deck.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create set");
    } finally {
      setBusy(false);
    }
  }

  async function onImportSubmit(payload: ImportSubmit) {
    setBusy(true);
    setError("");
    try {
      const data = await api.importSet({
        userId: me.id,
        sourceLang,
        targetLang,
        name: name.trim() || undefined,
        ...payload,
      });
      await afterShare(data.deck.id);
      nav(`/decks/${data.deck.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateRule(e: FormEvent) {
    e.preventDefault();
    if (!rulePrompt.trim() && !ruleImage) {
      setRuleError("Write the rule or attach a screenshot.");
      return;
    }
    setRuleBusy(true);
    setRuleError("");
    try {
      const data = await api.createRule({
        userId: me.id,
        title: ruleTitle.trim() || undefined,
        prompt: rulePrompt.trim() || undefined,
        image: ruleImage || undefined,
      });
      nav(`/rules/${data.rule.id}`);
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : "Could not create rule");
    } finally {
      setRuleBusy(false);
    }
  }

  function toggle(id: number) {
    setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  function stopPick() {
    setPicking(false);
    setSelected([]);
  }

  async function removeDeck(deck: Deck) {
    if (!confirm(`Delete “${deck.name}”?`)) return;
    try {
      await api.deleteDeck(deck.id, me.id);
      setDecks((list) => list.filter((d) => d.id !== deck.id));
      setSelected((list) => list.filter((id) => id !== deck.id));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not delete set"); }
  }

  async function removeRule(rule: Rule) {
    if (!confirm(`Delete “${rule.title}”?`)) return;
    try {
      await api.deleteRule(rule.id, me.id);
      setRules((list) => list.filter((r) => r.id !== rule.id));
    } catch (err) { setRuleError(err instanceof Error ? err.message : "Could not delete rule"); }
  }

  async function shareDeck(e: FormEvent) {
    e.preventDefault();
    if (!shareDeckId) return;
    const names = shareNames.split(/[\n,;]+/).map((n) => n.trim()).filter(Boolean);
    if (!names.length) return;
    try {
      await api.share(shareDeckId, me.id, names);
      setShareDeckId(null);
      setShareNames("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not share set"); }
  }

  const reviewHref = (mode: string) => `/review/${mode}?ids=${selected.join(",")}`;
  const visibleDecks = decks.filter((deck) => deck.name.toLowerCase().includes(query.trim().toLowerCase()) && (scope === "all" || (scope === "shared" ? deck.shared : !deck.shared)));
  const visibleRules = rules.filter((rule) => rule.title.toLowerCase().includes(query.trim().toLowerCase()));
  const wordCount = decks.reduce((total, deck) => total + (deck.card_count || 0), 0);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>✳</span>
          <strong>Lumen</strong>
          <span className="brand-caption">A little every day.</span>
        </div>
        <div className="user-chip">
          {user.username}
          <button
            className="ghost"
            onClick={() => {
              clearUser();
              nav("/");
            }}
          >
            Switch
          </button>
        </div>
      </header>

      <section className="library-hero">
        <div><div className="eyebrow">Your space to learn</div><h1>Your next word awaits.</h1><p>Collect the words you find. Make them the words you know.</p></div>
        <div className="library-stats"><div><strong>{decks.length}</strong><span>study set{decks.length === 1 ? "" : "s"}</span></div><div><strong>{wordCount}</strong><span>word{wordCount === 1 ? "" : "s"} collected</span></div></div>
      </section>

      <div className="toolbar">
        <button className="primary" aria-expanded={composer === "set"} onClick={() => setComposer(composer === "set" ? "" : "set")}>
          {composer === "set" ? "Close" : "+ Create set"}
        </button>
        <button className={`ghost ${composer === "rule" ? "on" : ""}`} aria-expanded={composer === "rule"} onClick={() => setComposer(composer === "rule" ? "" : "rule")}>
          + New rule
        </button>
        {tab === "sets" && decks.length > 0 && (
          <button
            className={`ghost ${picking ? "on" : ""}`}
            onClick={() => (picking ? stopPick() : setPicking(true))}
          >
            {picking ? "Done" : "Select"}
          </button>
        )}
        {picking && (
          <div className="toolbar-review">
            <button
              className="ghost"
              onClick={() => setSelected(selected.length === decks.length ? [] : decks.map((d) => d.id))}
            >
              {selected.length === decks.length ? "Clear" : "Select all"}
            </button>
            {selected.length > 0 && (
              <>
                <span className="meta">{selected.length} selected</span>
                <Link className="primary" to={reviewHref("cards")}>
                  Flashcards
                </Link>
                <Link className="ghost" to={reviewHref("learn")}>
                  Learn
                </Link>
                <Link className="ghost" to={reviewHref("test")}>
                  Test
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      {composer === "set" && (
        <section className="panel composer">
          <h2>New set</h2>
          <p className="lede">Give your words a home. After creating your set, type words or add photos and screenshots.</p>
          <div className="stack-form">
            <div>
              <label htmlFor="set-name">Set name</label>
              <input id="set-name" className="field" disabled={busy} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Everyday French" />
            </div>
            <div>
              <label>Share with usernames (optional)</label>
              <input className="field" value={shareWith} onChange={(e) => setShareWith(e.target.value)} placeholder="alex, maria" />
            </div>
            <details>
              <summary>Languages</summary>
              <div className="row" style={{ marginTop: 12 }}>
                <div className="grow">
                  <label>From</label>
                  <select className="field" value={sourceLang} onChange={(e) => setLangs(e.target.value, targetLang)}>
                    {LANGS.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grow">
                  <label>Into</label>
                  <select className="field" value={targetLang} onChange={(e) => setLangs(sourceLang, e.target.value)}>
                    {LANGS.filter((l) => l.code !== "auto").map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </details>
            <details>
              <summary>File, link, or paste (optional)</summary>
              <div style={{ marginTop: 12 }}>
                <ImportPanel
                  busy={busy}
                  deferFile
                  stagedLabel={staged?.label}
                  onStage={(payload, label) => setStaged({ payload, label })}
                  onClearStage={() => setStaged(null)}
                  onSubmit={onImportSubmit}
                />
              </div>
            </details>
            <button
              className="primary"
              type="button"
              disabled={busy || (!name.trim() && !staged)}
              onClick={() => void onCreate()}
            >
              {busy ? "Creating…" : staged ? "Create from file" : "Create"}
            </button>
          </div>
        </section>
      )}

      {composer === "rule" && (
        <section className="panel composer">
          <h2>New rule</h2>
          <p className="lede">Paste a grammar rule or drop a screenshot. AI turns it into a visual explanation plus checks.</p>
          <form className="stack-form" onSubmit={onCreateRule}>
            <div>
              <label>Title (optional)</label>
              <input className="field" value={ruleTitle} onChange={(e) => setRuleTitle(e.target.value)} placeholder="Past simple vs present perfect" />
            </div>
            <div>
              <label>Describe the rule</label>
              <textarea
                className="field"
                rows={4}
                value={rulePrompt}
                onChange={(e) => setRulePrompt(e.target.value)}
                placeholder="When do I use ser vs estar?"
              />
            </div>
            <label className={`drop ${ruleBusy ? "loading" : ""}`}>
              <input
                type="file"
                accept="image/*"
                disabled={ruleBusy}
                onChange={(e) => setRuleImage(e.target.files?.[0] || null)}
              />
              {ruleBusy ? (
                <div className="photo-loader">
                  <span className="spinner" aria-hidden />
                  <p>Writing the rule and checks…</p>
                </div>
              ) : (
                <>
                  Drop a screenshot of the rule, or click to choose one.
                  {ruleImage ? (
                    <p className="meta">
                      {ruleImage.name}{" "}
                      <button
                        type="button"
                        className="linkish"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setRuleImage(null);
                        }}
                      >
                        Remove
                      </button>
                    </p>
                  ) : null}
                </>
              )}
            </label>
            <button className="primary" disabled={ruleBusy || (!rulePrompt.trim() && !ruleImage)}>
              {ruleBusy ? "Generating…" : "Generate rule"}
            </button>
          </form>
        </section>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      {ruleError && <p className="error" role="alert">{ruleError}</p>}
      <div className="library-heading">
      <div className="tabs" aria-label="Library categories">
        <button className={`tab ${tab === "sets" ? "on" : ""}`} aria-pressed={tab === "sets"} onClick={() => setTab("sets")}>
          Sets ({decks.length})
        </button>
        <button
          className={`tab ${tab === "rules" ? "on" : ""}`}
          aria-pressed={tab === "rules"}
          onClick={() => {
            setTab("rules");
            stopPick();
          }}
        >
          Rules ({rules.length})
        </button>
      </div>
      <input type="search" className="field search-field" aria-label="Search your library" placeholder="Search your library…" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>

      {tab === "sets" && (
        <>
          <div className="terms-heading row-head">
            <h2>Your sets</h2>
            <div className="filter-group" aria-label="Filter sets">{([ ["all", "All sets"], ["mine", "Created by you"], ["shared", "Shared with you"] ] as const).map(([value, label]) => <button key={value} className={scope === value ? "on" : ""} aria-pressed={scope === value} onClick={() => setScope(value)}>{label}</button>)}</div>
          </div>
          {loading && <p className="working-status" role="status"><span className="spinner tiny" aria-hidden />Opening your library…</p>}
          {!loading && decks.length === 0 && <div className="empty-state"><span className="empty-icon" aria-hidden>✧</span><h3>Your vocabulary journey starts here.</h3><p>Create a set, add a few words, and find your rhythm.</p><button className="primary" onClick={() => setComposer("set")}>Create your first set</button></div>}
          {!loading && decks.length > 0 && visibleDecks.length === 0 && <div className="empty-state"><h3>No sets found</h3><p>Try a different search or filter.</p><button className="ghost" onClick={() => { setQuery(""); setScope("all"); }}>Show all sets</button></div>}
          <div className="grid">
            {visibleDecks.map((d) => {
              const owner = d.is_owner !== false && !d.shared;
              const meta = (
                <p className="meta">
                  {langLabel(d.source_lang)} → {langLabel(d.target_lang)} · {d.card_count ?? 0} term
                  {(d.card_count ?? 0) === 1 ? "" : "s"}
                  {d.shared ? ` · from ${d.owner_username}` : ""}
                </p>
              );
              return (
                <article
                  key={d.id}
                  className={`deck-card ${selectedSet.has(d.id) ? "picked" : ""} ${picking ? "picking" : ""}`}
                >
                  {renamingId === d.id ? (
                    <RenameName
                      autoEdit
                      name={d.name}
                      onSave={async (next) => {
                        const updated = await api.updateDeck(d.id, { userId: me.id, name: next });
                        setDecks((list) => list.map((item) => (item.id === d.id ? { ...item, name: updated.name } : item)));
                      }}
                      onClose={() => setRenamingId(null)}
                    />
                  ) : picking ? (
                    <button type="button" className="deck-card-hit" onClick={() => toggle(d.id)}>
                      <span className={`pick-mark ${selectedSet.has(d.id) ? "on" : ""}`} aria-hidden />
                      <h3>{d.name}</h3>
                      {meta}
                    </button>
                  ) : (
                    <Link className="deck-card-hit" to={`/decks/${d.id}`}>
                      <div className="deck-card-top"><span className="set-symbol" aria-hidden>Aa</span><span className="badge">{d.card_count || 0} word{d.card_count === 1 ? "" : "s"}</span></div>
                      <h3>{d.name}</h3>
                      {meta}
                    </Link>
                  )}
                  {!picking && renamingId !== d.id && (
                    <div className="card-actions">
                      {owner && <Link className="ghost add-words-link" to={`/decks/${d.id}?add=1`}>+ Add words</Link>}
                      <details className="card-menu"><summary aria-label={`Options for ${d.name}`}>•••</summary><div className="card-menu-items">
                      {owner && (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            setRenamingId(d.id);
                            setShareDeckId(null);
                          }}
                        >
                          Rename
                        </button>
                      )}
                      {owner && (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            setShareDeckId(shareDeckId === d.id ? null : d.id);
                            setShareNames("");
                          }}
                        >
                          Share
                        </button>
                      )}
                      {owner && (
                        <button type="button" className="danger" onClick={() => void removeDeck(d)}>
                          Delete
                        </button>
                      )}
                      {!owner && <span className="meta">Shared by {d.owner_username}</span>}
                      </div></details>
                    </div>
                  )}
                  {shareDeckId === d.id && !picking && (
                    <form className="row deck-card-extra" onSubmit={shareDeck}>
                      <input
                        className="field grow"
                        value={shareNames}
                        onChange={(e) => setShareNames(e.target.value)}
                        placeholder="alex, maria"
                      />
                      <button className="primary">Share</button>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}

      {tab === "rules" && (
        <div className="grid">
          {visibleRules.length === 0 && <div className="empty-state"><h3>{query ? "No matching rules" : "Make grammar click."}</h3><p>{query ? "Try another search." : "Turn a question or screenshot into a clear explanation and practice."}</p>{!query && <button className="primary" onClick={() => setComposer("rule")}>Create a rule</button>}</div>}
          {visibleRules.map((rule) => (
            <article key={rule.id} className="deck-card">
              <Link className="deck-card-hit" to={`/rules/${rule.id}`}>
                <h3>{rule.title}</h3>
                <p className="meta">{rule.check_count ?? 0} checks</p>
              </Link>
              <div className="card-actions">
                <button type="button" className="danger" onClick={() => void removeRule(rule)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
