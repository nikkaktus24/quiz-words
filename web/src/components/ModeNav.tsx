import { Link } from "react-router-dom";

export type StudyMode = "cards" | "learn" | "test";

const modes: { id: StudyMode; label: string; hint: string }[] = [
  { id: "cards", label: "Flashcards", hint: "Flip" },
  { id: "learn", label: "Learn", hint: "Master" },
  { id: "test", label: "Test", hint: "Check" },
];

export function ModeNav({ deckId, active }: { deckId: number; active: StudyMode }) {
  return (
    <nav className="mode-nav">
      {modes.map((mode) => (
        <Link
          key={mode.id}
          className={`mode-link ${active === mode.id ? "on" : ""}`}
          to={`/decks/${deckId}/${mode.id}`}
        >
          <span>{mode.label}</span>
          <small>{mode.hint}</small>
        </Link>
      ))}
    </nav>
  );
}

export function ModeTiles({ deckId, count }: { deckId: number; count: number }) {
  const disabled = count === 0;
  return (
    <div className="mode-grid">
      <Link className={`mode-tile cards ${disabled ? "off" : ""}`} to={disabled ? "#" : `/decks/${deckId}/cards`}>
        <span className="mode-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="4" y="5" width="13" height="16" rx="2" />
            <path d="M8 5V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-1" />
          </svg>
        </span>
        <div>
          <strong>Flashcards</strong>
          <p>Flip term and definition, then mark still learning or know.</p>
        </div>
      </Link>
      <Link className={`mode-tile learn ${disabled ? "off" : ""}`} to={disabled ? "#" : `/decks/${deckId}/learn`}>
        <span className="mode-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 19a4 4 0 0 1 4-4h12" />
            <path d="M8 15V5a2 2 0 0 1 2-2h10v16H10a4 4 0 0 0-2 0" />
            <path d="M12 7h6M12 11h4" />
          </svg>
        </span>
        <div>
          <strong>Learn</strong>
          <p>Multiple choice, then type the term. Misses go back in the queue.</p>
        </div>
      </Link>
      <Link className={`mode-tile test ${disabled ? "off" : ""}`} to={disabled ? "#" : `/decks/${deckId}/test`}>
        <span className="mode-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M9 11l2 2 4-4" />
            <rect x="4" y="4" width="16" height="16" rx="3" />
          </svg>
        </span>
        <div>
          <strong>Test</strong>
          <p>Written, multiple choice, true/false, and matching — scored at the end.</p>
        </div>
      </Link>
    </div>
  );
}
