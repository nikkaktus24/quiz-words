import { FormEvent, useState } from "react";
import { LANGS } from "../types";

export type ImportSubmit = { url?: string; json?: unknown; text?: string };

type Props = {
  busy: boolean;
  onSubmit: (payload: ImportSubmit) => Promise<void> | void;
  showLangs?: boolean;
  sourceLang?: string;
  targetLang?: string;
  onLangs?: (source: string, target: string) => void;
};

export function ImportPanel({ busy, onSubmit, showLangs, sourceLang = "auto", targetLang = "en", onLangs }: Props) {
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState("");
  const [fileName, setFileName] = useState("");

  async function sendUrl(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    await onSubmit({ url: url.trim() });
  }

  async function sendPaste(e: FormEvent) {
    e.preventDefault();
    if (!paste.trim()) return;
    await onSubmit(parseClientPayload(paste));
  }

  async function onFile(file: File) {
    setFileName(file.name);
    const text = await file.text();
    await onSubmit(parseClientPayload(text));
  }

  return (
    <div className="import-stack">
      {showLangs && onLangs && (
        <div className="row">
          <div>
            <label>From</label>
            <select className="field" value={sourceLang} onChange={(e) => onLangs(e.target.value, targetLang)}>
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Into</label>
            <select className="field" value={targetLang} onChange={(e) => onLangs(sourceLang, e.target.value)}>
              {LANGS.filter((l) => l.code !== "auto").map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <form className="row" onSubmit={sendUrl}>
        <div className="grow">
          <label htmlFor="quizlet-url">Quizlet link</label>
          <input
            id="quizlet-url"
            className="field"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://quizlet.com/123456789/my-set"
            disabled={busy}
          />
        </div>
        <button className="primary" disabled={busy || !url.trim()}>
          {busy ? "Importing…" : "Import"}
        </button>
      </form>

      <label className={`drop ${busy ? "loading" : ""}`}>
        <input
          type="file"
          accept=".json,.txt,.tsv,.csv,application/json,text/plain"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
        {busy ? (
          <div className="photo-loader">
            <span className="spinner" aria-hidden />
            <p>Importing cards…</p>
          </div>
        ) : (
          <>
            Drop a Quizlet JSON export, or a tab-separated terms file
            {fileName ? <p className="meta">{fileName}</p> : null}
          </>
        )}
      </label>

      <form onSubmit={sendPaste}>
        <label htmlFor="paste-cards">Or paste JSON / term + definition lines</label>
        <textarea
          id="paste-cards"
          className="field"
          rows={5}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={'hola\thello\n["term","definition"]\nor {"word":"hola","definition":"hello"}'}
          disabled={busy}
        />
        <div style={{ marginTop: 12 }}>
          <button className="ghost" disabled={busy || !paste.trim()}>
            {busy ? "Importing…" : "Import pasted cards"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function parseClientPayload(raw: string): ImportSubmit {
  const trimmed = raw.trim();
  try {
    return { json: JSON.parse(trimmed) };
  } catch {
    return { text: trimmed };
  }
}
