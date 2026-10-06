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
        <div className="eyebrow">Study sets</div>
        <h1>Flashcards, Learn, and Test — like Quizlet, for your words.</h1>
        <p className="lede">
          Type words, photograph a list, or import a Quizlet set. Then share it by username.
        </p>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          className="field"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. nika"
          autoFocus
        />
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
