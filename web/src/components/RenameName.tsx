import { FormEvent, useEffect, useState } from "react";

export function RenameName({
  name,
  onSave,
  as: Tag = "h3",
}: {
  name: string;
  onSave: (next: string) => Promise<void>;
  as?: "h1" | "h3";
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setValue(name);
  }, [name]);

  function cancel() {
    setEditing(false);
    setValue(name);
    setError("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = value.trim();
    if (!next) {
      setError("Name required");
      return;
    }
    if (next === name) {
      cancel();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(next);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="rename-title">
        <Tag>{name}</Tag>
        <button
          type="button"
          className="ghost"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setValue(name);
            setEditing(true);
          }}
        >
          Rename
        </button>
      </div>
    );
  }

  return (
    <form className="rename-form" onSubmit={(e) => void submit(e)} onClick={(e) => e.stopPropagation()}>
      <input
        className="field"
        value={value}
        autoFocus
        aria-label="Set name"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
        }}
      />
      <button className="primary" disabled={busy || !value.trim()}>
        {busy ? "Saving…" : "Save"}
      </button>
      <button type="button" className="ghost" onClick={cancel}>
        Cancel
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
