import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { AddWordsPanel } from "../components/AddWordsPanel";
import { wordKey } from "../lib/words";
import { ModeTiles } from "../components/ModeNav";
import { RenameName } from "../components/RenameName";
import { SpeakButton } from "../components/SpeakButton";
import { getSavedUser } from "../session";
import { langLabel, type Card, type Deck } from "../types";

export function DeckPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const user = getSavedUser();
  const deckId = Number(id);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [dedupeBusy, setDedupeBusy] = useState(false);
  const [shareNames, setShareNames] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [sharedWith, setSharedWith] = useState<{ id: number; username: string }[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (!user) {
      nav("/");
      return;
    }
    api
      .deck(deckId, user.id)
      .then((data) => {
        setDeck(data.deck);
        setCards(data.cards);
        setSharedWith(data.deck.shared_with || []);
        setAddOpen(data.cards.length === 0 || params.get("add") === "1");
      })
      .catch((err) => {
        console.error("[quiz-words] load deck failed", err);
        setError(err.message);
      });
  }, [deckId, nav, user?.id, params]);

  async function removeDuplicates() {
    const extra = duplicateCount(cards);
    if (extra === 0) {
      setInfo("No duplicate words in this set.");
      return;
    }
    if (!confirm(`Remove ${extra} duplicate card${extra === 1 ? "" : "s"}? The copy with the most study progress is kept.`)) {
      return;
    }
    setDedupeBusy(true);
    setError("");
    setInfo("");
    try {
      const data = await api.dedupe(deckId, user?.id);
      setCards(data.cards);
      setDeck((current) => current ? { ...current, ...data.deck } : data.deck);
      setInfo(
        data.removed === 0
          ? "No duplicate words in this set."
          : `Removed ${data.removed} duplicate card${data.removed === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      console.error("[quiz-words] dedupe failed", err);
      setError(err instanceof Error ? err.message : "Could not remove duplicates");
    } finally {
      setDedupeBusy(false);
    }
  }

  async function onShare(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    const names = shareNames
      .split(/[\n,;]+/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    setShareBusy(true);
    setError("");
    setInfo("");
    try {
      const data = await api.share(deckId, user.id, names);
      setSharedWith(data.shared_with);
      setShareNames("");
      const bits: string[] = [];
      if (data.added.length) bits.push(`Shared with ${data.added.join(", ")}`);
      if (data.missing.length) bits.push(`Not found: ${data.missing.join(", ")}`);
      if (data.skipped.length) bits.push(`Already shared: ${data.skipped.join(", ")}`);
      setInfo(bits.join(". ") || "Updated sharing.");
    } catch (err) {
      console.error("[quiz-words] share failed", err);
      setError(err instanceof Error ? err.message : "Could not share");
    } finally {
      setShareBusy(false);
    }
  }

  async function onUnshare(username: string) {
    if (!user) return;
    try {
      const data = await api.unshare(deckId, user.id, username);
      setSharedWith(data.shared_with);
      if (deck?.shared && username.toLowerCase() === user.username.toLowerCase()) {
        nav("/home");
      }
    } catch (err) {
      console.error("[quiz-words] unshare failed", err);
      setError(err instanceof Error ? err.message : "Could not update sharing");
    }
  }

  async function removeDeck() {
    if (!confirm("Delete this set?")) return;
    try {
      await api.deleteDeck(deckId, user?.id);
      nav("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete set");
    }
  }

  if (!user || !deck) {
    return (
      <div className="shell">
        <p>{error || "Loading…"}</p>
      </div>
    );
  }

  const owner = deck.is_owner !== false && !deck.shared;
  const visibleCards = cards.filter((card) => wordKey(`${card.word} ${card.translation}`).includes(wordKey(search)));
  const duplicates = duplicateCount(cards);

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <Link className="meta" to="/home">
            ← Your sets
          </Link>
          {owner ? (
            <div style={{ marginTop: 6 }}>
              <RenameName
                as="h1"
                name={deck.name}
                onSave={async (name) => {
                  const updated = await api.updateDeck(deck.id, { userId: user.id, name });
                  setDeck((current) => (current ? { ...current, name: updated.name } : current));
                }}
              />
            </div>
          ) : (
            <h1 style={{ marginTop: 6 }}>{deck.name}</h1>
          )}
          <p className="meta">
            {langLabel(deck.source_lang)} → {langLabel(deck.target_lang)} · {cards.length} term
            {cards.length === 1 ? "" : "s"}
            {deck.shared ? ` · from ${deck.owner_username}` : ""}
          </p>
        </div>
        <div className="row">
          {owner && (
            <button className="primary" aria-expanded={addOpen} onClick={() => setAddOpen((v) => !v)}>
              {addOpen ? "Close editor" : "+ Add words"}
            </button>
          )}
          {owner && (
            <button className={`ghost ${shareOpen ? "on" : ""}`} onClick={() => setShareOpen((v) => !v)}>
              Share
            </button>
          )}
          {deck.shared ? (
            <button className="danger" onClick={() => void onUnshare(user.username)}>
              Leave
            </button>
          ) : (
            <button className="danger" onClick={removeDeck}>
              Delete
            </button>
          )}
        </div>
      </header>

      <ModeTiles deckId={deck.id} count={cards.length} />

      {owner && shareOpen && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <h2>Share</h2>
          <p className="lede">Type usernames to share this set. They get Flashcards, Learn, and Test in their library.</p>
          <form className="row" onSubmit={onShare}>
            <div className="grow">
              <label htmlFor="share-names">Usernames</label>
              <input
                id="share-names"
                className="field"
                value={shareNames}
                onChange={(e) => setShareNames(e.target.value)}
                placeholder="alex, maria"
              />
            </div>
            <button className="primary" disabled={shareBusy || !shareNames.trim()}>
              {shareBusy ? "Sharing…" : "Share"}
            </button>
          </form>
          {sharedWith.length > 0 && (
            <div className="share-list">
              {sharedWith.map((person) => (
                <span className="share-chip" key={person.id}>
                  {person.username}
                  <button type="button" onClick={() => void onUnshare(person.username)} aria-label={`Stop sharing with ${person.username}`}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {info && <p className="notice success" role="status">{info}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {owner && <div hidden={!addOpen}>
        <AddWordsPanel key={deck.id} deck={deck} cards={cards} userId={user.id} onAdded={(data, message) => {
          setCards(data.cards);
          setDeck((current) => current ? { ...current, ...data.deck } : data.deck);
          setInfo(message);
          setError("");
        }} />
      </div>}

      {!owner && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <p className="meta">Shared by {deck.owner_username}. You can study this set.</p>
        </section>
      )}

      <div className="terms-heading row-head terms-toolbar">
        <h2>Your words <span className="count">{cards.length}</span></h2>
        <div className="row">
          {owner && duplicates > 0 && <button className="ghost" disabled={dedupeBusy} onClick={() => void removeDuplicates()}>{dedupeBusy ? "Removing…" : `Remove ${duplicates} duplicate${duplicates === 1 ? "" : "s"}`}</button>}
          {cards.length > 0 && <input type="search" className="field search-field" aria-label="Search words and translations" placeholder="Search words…" value={search} onChange={(event) => setSearch(event.target.value)} />}
        </div>
      </div>
      {cards.length === 0 && <div className="empty-state"><span className="empty-icon" aria-hidden>✧</span><h3>A little practice starts with a word.</h3><p>Type a list, import a file, or bring in a screenshot to build this set.</p>{owner && !addOpen && <button className="primary" onClick={() => setAddOpen(true)}>Add your first words</button>}</div>}
      {cards.length > 0 && visibleCards.length === 0 && <div className="empty-state"><h3>No matching words</h3><p>Try another word or translation.</p><button className="ghost" onClick={() => setSearch("")}>Clear search</button></div>}
      <div className="card-list">
        {visibleCards.map((c) => (
          <article className="panel study-card" key={c.id}>
            <div>
              <div className="word-row">
                <div className="word">{c.word}</div>
                <SpeakButton text={c.word} lang={deck.source_lang} />
              </div>
              <div className="translation">{c.translation}</div>
              {c.sentence ? <div className="sentence">{c.sentence}</div> : null}
              {c.sentence_translation ? <div className="sentence">{c.sentence_translation}</div> : null}
              {c.notes && <div className="note">{c.notes}</div>}
            </div>
            {owner && (
              <button
                className="ghost"
                disabled={deletingId === c.id}
                aria-label={`Remove ${c.word}`}
                onClick={async () => {
                  setDeletingId(c.id);
                  try {
                    await api.deleteCard(c.id);
                    setCards((list) => list.filter((x) => x.id !== c.id));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not remove word");
                  } finally { setDeletingId(null); }
                }}
              >
                Remove
              </button>
            )}
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
    const key = wordKey(card.word);
    if (seen.has(key)) extra += 1;
    else seen.add(key);
  }
  return extra;
}
