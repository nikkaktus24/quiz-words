import { useState } from "react";
import { speak } from "../lib/speak";

export function SpeakButton({
  text,
  lang = "auto",
  label = "Listen",
}: {
  text: string;
  lang?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!text.trim()) return null;

  return (
    <button
      type="button"
      className={`icon-btn ${busy ? "busy" : ""}`}
      aria-label={label}
      title={failed ? "Could not play audio" : label}
      disabled={busy}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setBusy(true);
        setFailed(false);
        void speak(text, lang)
          .catch(() => setFailed(true))
          .finally(() => setBusy(false));
      }}
    >
      {busy ? (
        <span className="spinner tiny" aria-hidden />
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 9v6h4l5 4V5L8 9H4z" />
          <path d="M16 9a4 4 0 0 1 0 6" />
          <path d="M18.5 7a7 7 0 0 1 0 10" />
        </svg>
      )}
    </button>
  );
}
