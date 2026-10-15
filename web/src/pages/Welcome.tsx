import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { saveUser } from "../session";

export function Welcome() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = await api.profile(username);
      saveUser(user);
      nav("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="welcome">
      <form className="welcome-card" onSubmit={onSubmit}>
        <div className="brand" style={{ marginBottom: 30 }}><span className="brand-mark" aria-hidden>✳</span><strong>Lumen</strong></div>
        <div className="eyebrow">A little every day</div>
        <h1>Small words.<br />A world of possibility.</h1>
        <p className="lede">
          Turn your notes and screenshots into study sets. Find your rhythm with flashcards, learning, and practice tests.
        </p>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          className="field"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. nika"
          autoComplete="username"
          maxLength={32}
          disabled={busy}
          autoFocus
        />
        <p className="field-hint">Enter your username to open your library, or choose a new one to get started.</p>
        {error && <p className="error">{error}</p>}
        <div style={{ marginTop: 18 }}>
          <button className="primary" disabled={busy || username.trim().length < 2}>
            {busy ? "Opening…" : "Get started"}
          </button>
        </div>
      </form>
    </div>
  );
}
