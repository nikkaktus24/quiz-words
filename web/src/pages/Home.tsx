import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
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
      setError(err instanceof Error ? err.message : "Could not create deck");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <strong>Lumen</strong>
          <span>your decks</span>
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

      <section className="panel" style={{ marginBottom: 24 }}>
        <h2>New deck</h2>
        <p className="lede">Name the set, then choose the languages you are moving between.</p>
        <form className="row" onSubmit={onCreate}>
          <div className="grow">
            <label>Name</label>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Café Spanish" />
          </div>
          <div>
            <label>From</label>
            <select className="field" value={sourceLang} onChange={(e) => setSourceLang(e.target.value)}>
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Into</label>
            <select className="field" value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
              {LANGS.filter((l) => l.code !== "auto").map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <button className="primary" disabled={busy || !name.trim()}>
            Create
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <div className="grid">
        {decks.length === 0 && <p className="meta">No decks yet. Make one above.</p>}
        {decks.map((d) => (
          <Link key={d.id} className="deck-card" to={`/decks/${d.id}`}>
            <h3>{d.name}</h3>
            <p className="meta">
              {langLabel(d.source_lang)} → {langLabel(d.target_lang)} · {d.card_count ?? 0} cards
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
