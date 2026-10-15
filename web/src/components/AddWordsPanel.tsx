import { useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { reviewWords } from "../lib/words";
import { langLabel, type Card, type Deck } from "../types";
import { ImportPanel, type ImportSubmit } from "./ImportPanel";

type Props = {
  deck: Deck;
  cards: Card[];
  userId: number;
  onAdded: (data: { deck: Deck; cards: Card[] }, message: string) => void;
};

export function AddWordsPanel({ deck, cards, userId, onAdded }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"words" | "photos" | "import">("words");
  const [raw, setRaw] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [dragging, setDragging] = useState(false);
  const review = useMemo(() => reviewWords(raw, cards.map((card) => card.word)), [raw, cards]);

  function attach(incoming: File[]) {
    if (busy) return;
    const valid: File[] = [];
    const invalid: string[] = [];
    for (const file of incoming) {
      if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
        invalid.push(`${file.name}: use PNG, JPEG, WebP, or GIF.`);
      } else if (!file.size || file.size > 8 * 1024 * 1024) {
        invalid.push(`${file.name}: choose an image under 8 MB.`);
      } else valid.push(file);
    }
    setError(invalid.join(" "));
    setFiles((current) => {
      const all = [...current];
      for (const file of valid) {
        if (!all.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) all.push(file);
      }
      return all;
    });
    if (valid.length) setTab("photos");
  }

  async function readPhotos() {
    setError("");
    setInfo("");
    const extracted: string[] = [];
    const failures: string[] = [];
    const succeeded: File[] = [];
    try {
      for (const [index, file] of files.entries()) {
        setBusy(`Reading image ${index + 1} of ${files.length}…`);
        try {
          const data = await api.extractPhoto(deck.id, file, userId);
          extracted.push(...data.words);
          succeeded.push(file);
        } catch (err) {
          failures.push(`${file.name}: ${err instanceof Error ? err.message : "Could not read image."}`);
        }
      }
      if (extracted.length) {
        // Keep typed words and combine every screenshot before reviewing duplicates.
        setRaw((current) => [current.trim(), ...extracted].filter(Boolean).join("\n"));
        setTab("words");
        const novel = reviewWords(extracted.join("\n"), cards.map((card) => card.word)).words.length;
        setInfo(novel
          ? `Found ${extracted.length} words, including ${novel} new to this set. Review the list below before adding.`
          : "All words found in these images already exist in this set. No new cards are needed.");
      } else if (succeeded.length) {
        setInfo(`No vocabulary found. Try a clearer image${deck.source_lang === "auto" ? "." : ` with ${langLabel(deck.source_lang)} words.`}`);
      }
      setFiles((current) => current.filter((file) => !succeeded.includes(file)));
      setError(failures.join(" "));
    } finally {
      setBusy("");
    }
  }

  async function saveWords() {
    if (!review.words.length || review.words.length > 500 || busy) return;
    setBusy("Creating translations and examples…");
    setError("");
    setInfo("");
    let added = 0;
    let skipped = review.skipped;
    try {
      let remaining = review.words;
      // Keep each AI request small, without silently truncating longer screenshot lists.
      for (let offset = 0; offset < review.words.length; offset += 40) {
        setBusy(`Creating cards ${offset + 1}–${Math.min(offset + 40, review.words.length)} of ${review.words.length}…`);
        const data = await api.generate(deck.id, review.words.slice(offset, offset + 40), userId);
        added += data.added;
        skipped += data.skipped;
        // Keep missing and unprocessed words available if a later batch fails.
        remaining = reviewWords(review.words.join("\n"), data.cards.map((card) => card.word)).words;
        setRaw(remaining.join("\n"));
        onAdded(data, `${added} word${added === 1 ? "" : "s"} added to this set.${skipped ? ` ${skipped} duplicate${skipped === 1 ? "" : "s"} skipped.` : ""}`);
      }
      if (remaining.length) setInfo(`${remaining.length} words still need cards. You can retry them below.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add words. Your list is saved here; try again.");
    } finally {
      setBusy("");
    }
  }

  async function importCards(payload: ImportSubmit) {
    setBusy("Importing words…");
    setError("");
    setInfo("");
    try {
      const data = await api.importIntoDeck(deck.id, { userId, ...payload });
      onAdded(data, `${data.added} word${data.added === 1 ? "" : "s"} imported.${data.skipped ? ` ${data.skipped} already in this set skipped.` : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import words.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="panel word-composer" aria-labelledby={`${id}-title`} aria-busy={!!busy}
      onPaste={(event) => {
        const images = [...event.clipboardData.files].filter((file) => file.type.startsWith("image/"));
        if (images.length) { event.preventDefault(); attach(images); }
      }}>
      <div className="composer-heading">
        <div><div className="eyebrow">Grow your vocabulary</div><h2 id={`${id}-title`}>Add words to this set</h2></div>
        <span className="badge">Duplicates skipped automatically</span>
      </div>
      <div className="tabs" aria-label="Choose how to add words">
        {([ ["words", "Type words"], ["photos", "Photos & screenshots"], ["import", "Import"] ] as const).map(([value, label]) => (
          <button key={value} type="button" className={`tab ${tab === value ? "on" : ""}`} aria-pressed={tab === value} disabled={!!busy} onClick={() => setTab(value)}>{label}{value === "photos" && files.length ? ` (${files.length})` : ""}</button>
        ))}
      </div>

      {tab === "words" && <form onSubmit={(event) => { event.preventDefault(); void saveWords(); }}>
        <label htmlFor={`${id}-words`}>Words or phrases</label>
        <p className="field-hint" id={`${id}-hint`}>One per line, or separated by commas. We’ll add {langLabel(deck.target_lang)} translations and example sentences.</p>
        <textarea id={`${id}-words`} className="field words-input" rows={6} value={raw} disabled={!!busy} aria-describedby={`${id}-hint`} onChange={(event) => { setRaw(event.target.value); setInfo(""); }} placeholder={"bonjour\nmerci\nà bientôt"} />
        <div className="review-summary" aria-live="polite">
          <span><strong>{review.words.length}</strong> new word{review.words.length === 1 ? "" : "s"}{review.words.length > 500 ? " · maximum 500 at a time" : " ready to add"}</span>
          {review.skipped > 0 && <><span className="meta">{review.inSet > 0 ? `${review.inSet} already in this set` : ""}{review.inSet && review.repeated ? " · " : ""}{review.repeated > 0 ? `${review.repeated} repeated` : ""}</span><button type="button" className="linkish" disabled={!!busy} onClick={() => setRaw(review.words.join("\n"))}>Clean up list</button></>}
        </div>
        <div className="composer-footer"><span className="meta">Review first. Your existing words and progress are kept.</span><button className="primary" disabled={!!busy || !review.words.length || review.words.length > 500}>{busy || `Add ${review.words.length || ""} word${review.words.length === 1 ? "" : "s"}`}</button></div>
      </form>}

      {tab === "photos" && <>
        <div className={`photo-drop ${dragging ? "dragging" : ""}`} tabIndex={0} role="button" aria-label="Upload photos or screenshots, or paste an image" aria-disabled={!!busy}
          onClick={() => { if (!busy) input.current?.click(); }}
          onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !busy) { event.preventDefault(); input.current?.click(); } }}
          onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
          onDrop={(event) => { event.preventDefault(); setDragging(false); attach([...event.dataTransfer.files]); }}>
          <span className="upload-icon" aria-hidden>↥</span>
          <strong>Bring your words into focus</strong>
          <p>Drop photos or screenshots here, or click to browse.</p>
          <span className="meta">You can also paste a screenshot · PNG, JPG, WebP, GIF · Up to 8 MB each</span>
        </div>
        <input ref={input} className="visually-hidden" type="file" tabIndex={-1} multiple accept="image/png,image/jpeg,image/webp,image/gif" disabled={!!busy} aria-label="Choose vocabulary images" onChange={(event) => { attach([...event.target.files || []]); event.target.value = ""; }} />
        {files.length > 0 && <div className="photo-queue">{files.map((file, index) => <div className="photo-item" key={`${file.name}-${file.size}-${file.lastModified}`}><PhotoThumbnail file={file} /><span>{file.name}<small>{(file.size / 1024 / 1024).toFixed(1)} MB</small></span><button type="button" className="ghost" disabled={!!busy} aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}>×</button></div>)}</div>}
        <div className="composer-footer"><span className="meta">Read images → review words → add to your set</span><button className="primary" type="button" disabled={!!busy || !files.length} onClick={() => void readPhotos()}>{busy || `Read ${files.length || ""} image${files.length === 1 ? "" : "s"}`}</button></div>
      </>}
      {tab === "import" && <ImportPanel busy={!!busy} onSubmit={importCards} />}
      {busy && <p className="working-status" role="status"><span className="spinner tiny" aria-hidden />{busy} This can take a moment.</p>}
      {info && <p className="notice" role="status">{info}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

function PhotoThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url ? <img src={url} alt={`Preview of ${file.name}`} /> : null;
}
