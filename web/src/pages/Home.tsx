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

  useEffect(() => {
    if (!user) {
      nav("/");
      return;
    }
    api
      .userDecks(user.id)
      .then((data) => setDecks(data.decks))
      .catch((err) => setError(err.message));
    api
      .userRules(user.id)
      .then((data) => setRules(data.rules))
      .catch(() => undefined);
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
    await api.deleteDeck(deck.id, me.id);
    setDecks((list) => list.filter((d) => d.id !== deck.id));
    setSelected((list) => list.filter((id) => id !== deck.id));
  }

  async function removeRule(rule: Rule) {
    if (!confirm(`Delete “${rule.title}”?`)) return;
    await api.deleteRule(rule.id, me.id);
    setRules((list) => list.filter((r) => r.id !== rule.id));
  }

  async function shareDeck(e: FormEvent) {
    e.preventDefault();
    if (!shareDeckId) return;
    const names = shareNames.split(/[\n,;]+/).map((n) => n.trim()).filter(Boolean);
    if (!names.length) return;
    await api.share(shareDeckId, me.id, names);
    setShareDeckId(null);
    setShareNames("");
  }

  const reviewHref = (mode: string) => `/review/${mode}?ids=${selected.join(",")}`;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <strong>Lumen</strong>
          <span>your library</span>
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

      <div className="toolbar">
        <button className={`ghost ${composer === "set" ? "on" : ""}`} onClick={() => setComposer(composer === "set" ? "" : "set")}>
          New set
        </button>
        <button className={`ghost ${composer === "rule" ? "on" : ""}`} onClick={() => setComposer(composer === "rule" ? "" : "rule")}>
          New rule
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
          <p className="lede">Name it, optionally attach a file or link, share, then create. Languages are remembered.</p>
          <div className="stack-form">
            <div>
              <label>Name</label>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Café Spanish" />
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
          {error && <p className="error">{error}</p>}
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
          {ruleError && <p className="error">{ruleError}</p>}
        </section>
      )}

      <div className="tabs" style={{ marginTop: 8 }}>
        <button className={`tab ${tab === "sets" ? "on" : ""}`} onClick={() => setTab("sets")}>
          Sets ({decks.length})
        </button>
        <button
          className={`tab ${tab === "rules" ? "on" : ""}`}
          onClick={() => {
            setTab("rules");
            stopPick();
          }}
        >
          Rules ({rules.length})
        </button>
      </div>

      {tab === "sets" && (
        <>
          <div className="terms-heading row-head">
            <h2>Library</h2>
          </div>
          <div className="grid">
            {decks.length === 0 && <p className="meta">No sets yet. Create one when you need it.</p>}
            {decks.map((d) => {
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
                      <h3>{d.name}</h3>
                      {meta}
                    </Link>
                  )}
                  {!picking && renamingId !== d.id && (
                    <div className="card-actions">
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
          {rules.length === 0 && <p className="meta">No rules yet. Generate one from a prompt or screenshot.</p>}
          {rules.map((rule) => (
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
