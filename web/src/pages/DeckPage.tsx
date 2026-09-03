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
  const [photoBusy, setPhotoBusy] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [dedupeBusy, setDedupeBusy] = useState(false);

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
      .catch((err) => {
        console.error("[quiz-words] load deck failed", err);
        setError(err.message);
      });
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
    setInfo("");
    try {
      const data = await api.generate(deckId, words);
      setCards(data.cards);
      setDeck(data.deck);
      setRaw("");
      if (data.added === 0 && data.skipped > 0) {
        setInfo(`All ${data.skipped} already exist in this deck.`);
      } else if (data.skipped > 0) {
        setInfo(`Added ${data.added}. Skipped ${data.skipped} already in this deck.`);
      }
    } catch (err) {
      console.error("[quiz-words] generate failed", err);
      setError(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setBusy("");
    }
  }

  async function onPhoto(file: File) {
    setPreview(URL.createObjectURL(file));
    setPhotoBusy(true);
    setBusy("");
    setError("");
    setInfo("");
    try {
      const data = await api.extractPhoto(deckId, file);
      setRaw(data.words.join("\n"));
      setTab("words");
      if (data.words.length === 0) {
        setError(
          `No ${langLabel(deck?.source_lang || "auto")} words found. Other languages in the photo are ignored.`,
        );
      }
    } catch (err) {
      console.error("[quiz-words] photo extract failed", err);
      setError(err instanceof Error ? err.message : "Photo extract failed");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removeDuplicates() {
    const extra = duplicateCount(cards);
    if (extra === 0) {
      setInfo("No duplicate words in this deck.");
      return;
    }
    if (!confirm(`Remove ${extra} duplicate card${extra === 1 ? "" : "s"}? The first copy of each word is kept.`)) {
      return;
    }
    setDedupeBusy(true);
    setError("");
    setInfo("");
    try {
      const data = await api.dedupe(deckId);
      setCards(data.cards);
      setDeck(data.deck);
      setInfo(
        data.removed === 0
          ? "No duplicate words in this deck."
          : `Removed ${data.removed} duplicate card${data.removed === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      console.error("[quiz-words] dedupe failed", err);
      setError(err instanceof Error ? err.message : "Could not remove duplicates");
    } finally {
      setDedupeBusy(false);
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
          <button className="ghost" disabled={dedupeBusy} onClick={() => void removeDuplicates()}>
            {dedupeBusy ? "Checking…" : "Remove duplicates"}
          </button>
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
          <button className={`tab ${tab === "photo" ? "on" : ""}`} disabled={photoBusy} onClick={() => setTab("photo")}>
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
              <button className="primary" disabled={!!busy || photoBusy || !raw.trim()}>
                {busy || "Make cards"}
              </button>
            </div>
          </form>
        ) : (
          <label className={`drop ${photoBusy ? "loading" : ""}`}>
            <input
              type="file"
              accept="image/*"
              disabled={photoBusy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onPhoto(file);
              }}
            />
            {photoBusy ? (
              <div className="photo-loader">
                <span className="spinner" aria-hidden />
                <p>Reading {langLabel(deck.source_lang)} words from the photo…</p>
                <p className="meta">Other languages are ignored.</p>
              </div>
            ) : (
              <>
                Drop a photo of notes, a textbook list, or a screenshot — or click to choose one.
                {preview && <img className="preview" src={preview} alt="Upload preview" />}
              </>
            )}
          </label>
        )}
        {info && <p className="ok">{info}</p>}
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

function duplicateCount(cards: Card[]) {
  const seen = new Set<string>();
  let extra = 0;
  for (const card of cards) {
    const key = card.word.trim().toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) extra += 1;
    else seen.add(key);
  }
  return extra;
}
