import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { getSavedUser } from "../session";
import { langLabel, type Card, type Deck } from "../types";

export function DeckPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const user = getSavedUser();
  const deckId = Number(id);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [tab, setTab] = useState<"words" | "photo">("words");
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      nav("/");
      return;
    }
    api
      .deck(deckId)
      .then((data) => {
        setDeck(data.deck);
        setCards(data.cards);
      })
      .catch((err) => setError(err.message));
  }, [deckId, nav, user?.id]);

  async function generate(e: FormEvent) {
    e.preventDefault();
    const words = raw
      .split(/[\n,;]+/)
      .map((w) => w.trim())
      .filter(Boolean);
    if (words.length === 0) return;
    setBusy("Writing translations and sentences…");
    setError("");
    try {
      const data = await api.generate(deckId, words);
      setCards(data.cards);
      setDeck(data.deck);
      setRaw("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setBusy("");
    }
  }

  async function onPhoto(file: File) {
    setPreview(URL.createObjectURL(file));
    setBusy("Reading words from the photo…");
    setError("");
    try {
      const data = await api.extractPhoto(file);
      setRaw(data.words.join("\n"));
      setTab("words");
      if (data.words.length === 0) setError("No words found in that photo. Try a clearer shot.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo extract failed");
    } finally {
      setBusy("");
    }
  }

  async function removeDeck() {
    if (!confirm("Delete this deck?")) return;
    await api.deleteDeck(deckId);
    nav("/home");
  }

  if (!deck) {
    return (
      <div className="shell">
        <p>{error || "Loading…"}</p>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <Link className="meta" to="/home">
            ← Decks
          </Link>
          <h1 style={{ marginTop: 6 }}>{deck.name}</h1>
          <p className="meta">
            {langLabel(deck.source_lang)} → {langLabel(deck.target_lang)}
          </p>
        </div>
        <div className="row">
          <Link className="ghost" to={`/decks/${deck.id}/study`}>
            Flip
          </Link>
          <Link className="pine" to={`/decks/${deck.id}/study?mode=write`}>
            Write
          </Link>
          <button className="danger" onClick={removeDeck}>
            Delete
          </button>
        </div>
      </header>

      <section className="panel">
        <div className="tabs">
          <button className={`tab ${tab === "words" ? "on" : ""}`} onClick={() => setTab("words")}>
            Words
          </button>
          <button className={`tab ${tab === "photo" ? "on" : ""}`} onClick={() => setTab("photo")}>
            Photo
          </button>
        </div>

        {tab === "words" ? (
          <form onSubmit={generate}>
            <label>One word or phrase per line (commas work too)</label>
            <textarea
              className="field"
              rows={7}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={"bonjour\nmerci\nà bientôt"}
            />
            <div style={{ marginTop: 12 }}>
              <button className="primary" disabled={!!busy || !raw.trim()}>
                {busy || "Make cards"}
              </button>
            </div>
          </form>
        ) : (
          <label className="drop">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onPhoto(file);
              }}
            />
            Drop a photo of notes, a textbook list, or a screenshot — or click to choose one.
            {preview && <img className="preview" src={preview} alt="Upload preview" />}
          </label>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <div className="card-list">
        {cards.map((c) => (
          <article className="panel study-card" key={c.id}>
            <div>
              <div className="word">{c.word}</div>
              <div className="translation">{c.translation}</div>
              <div className="sentence">{c.sentence}</div>
              <div className="sentence">{c.sentence_translation}</div>
              {c.notes && <div className="note">{c.notes}</div>}
            </div>
            <button
              className="ghost"
              onClick={async () => {
                await api.deleteCard(c.id);
                setCards((list) => list.filter((x) => x.id !== c.id));
              }}
            >
              Remove
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
