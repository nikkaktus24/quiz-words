import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { ImportPanel, type ImportSubmit } from "../components/ImportPanel";
import { clearUser, getSavedUser } from "../session";
import { LANGS, langLabel, type Deck } from "../types";

export function Home() {
  const nav = useNavigate();
  const user = getSavedUser();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [name, setName] = useState("");
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");

  useEffect(() => {
    if (!user) {
      nav("/");
      return;
    }
    api
      .userDecks(user.id)
      .then((data) => setDecks(data.decks))
      .catch((err) => setError(err.message));
  }, [nav, user?.id]);

  if (!user) return null;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      const deck = await api.createDeck({ userId: user.id, name, sourceLang, targetLang });
      nav(`/decks/${deck.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create set");
    } finally {
      setBusy(false);
    }
  }

  async function onImport(payload: ImportSubmit) {
    if (!user) return;
    setImportBusy(true);
    setImportError("");
    try {
      const data = await api.importSet({
        userId: user.id,
        sourceLang,
        targetLang,
        name: name.trim() || undefined,
        ...payload,
      });
      nav(`/decks/${data.deck.id}`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <strong>Lumen</strong>
          <span>your sets</span>
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

      <div className="home-split">
        <section className="panel">
          <h2>Create a set</h2>
          <p className="lede">Name it, pick languages, then add words, a photo, or import from a file or link.</p>
          <form className="stack-form" onSubmit={onCreate}>
            <div>
              <label>Name</label>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Café Spanish" />
            </div>
            <div className="row">
              <div className="grow">
                <label>From</label>
                <select className="field" value={sourceLang} onChange={(e) => setSourceLang(e.target.value)}>
                  {LANGS.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grow">
                <label>Into</label>
                <select className="field" value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
                  {LANGS.filter((l) => l.code !== "auto").map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button className="primary" disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create"}
            </button>
          </form>
          {error && <p className="error">{error}</p>}
        </section>

        <section className="panel">
          <h2>Import a set</h2>
          <p className="lede">Paste a set link, upload JSON, or drop tab-separated terms. Then share it with usernames.</p>
          <ImportPanel busy={importBusy} onSubmit={onImport} />
          {importError && <p className="error">{importError}</p>}
        </section>
      </div>

      <h2 className="terms-heading">Library</h2>
      <div className="grid">
        {decks.length === 0 && <p className="meta">No sets yet. Create one or import cards from a file or link.</p>}
        {decks.map((d) => (
          <Link key={d.id} className="deck-card" to={`/decks/${d.id}`}>
            <h3>{d.name}</h3>
            <p className="meta">
              {langLabel(d.source_lang)} → {langLabel(d.target_lang)} · {d.card_count ?? 0} terms
              {d.shared ? ` · from ${d.owner_username}` : ""}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
