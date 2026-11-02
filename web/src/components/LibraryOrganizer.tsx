import { Link } from "react-router-dom";
import { useState } from "react";
import { api, type Group, type OrganizationPreview } from "../api";
import type { Deck } from "../types";
import { langLabel } from "../types";

type Props = {
  decks: Deck[]; groups: Group[]; userId: number; groupId: number | null;
  onGroup: (id: number | null) => void; onGroups: (groups: Group[]) => void;
  onRefresh: () => Promise<void>;
};
export function LibraryOrganizer({ decks, groups, userId, groupId, onGroup, onGroups, onRefresh }: Props) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [mergeName, setMergeName] = useState("Merged set");
  const [preview, setPreview] = useState<OrganizationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const group = groups.find((item) => item.id === groupId);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : "Could not save changes. Try again."); }
    finally { setBusy(false); }
  }
  async function propose(mode: "merge" | "ai") {
    await run(async () => { setPreview(await api.organizationPreview(userId, selected, mode, mergeName)); });
  }
  return <section className="library-organizer" aria-label="Organize library" aria-busy={busy}>
    <div className="row-head"><h2>Groups</h2><div className="row">
      <button className="ghost" disabled={busy} aria-expanded={editing} onClick={() => setEditing(!editing)}>{editing ? "Close group editor" : "Manage groups"}</button>
      <button className="primary" disabled={busy} aria-expanded={organizing} onClick={() => { setOrganizing(!organizing); if (!organizing && !preview) setSelected(group ? group.deck_ids.filter((id) => decks.some((deck) => deck.id === id)) : []); }}>Merge / AI organize</button>
    </div></div>
    <div className="group-list" aria-label="Filter by group">
      <button className={`ghost ${groupId === null ? "on" : ""}`} aria-pressed={groupId === null} onClick={() => onGroup(null)}>All sets</button>
      {groups.map((item) => <button key={item.id} className={`ghost ${item.id === groupId ? "on" : ""}`} aria-pressed={item.id === groupId} onClick={() => onGroup(item.id)}>{item.name} <span className="count">{item.deck_ids.filter((id) => decks.some((deck) => deck.id === id)).length}</span></button>)}
    </div>
    {group && group.deck_ids.some((id) => decks.some((deck) => deck.id === id)) && <div className="group-actions"><Link className="ghost" to={`/review/cards?ids=${group.deck_ids.filter((id) => decks.some((deck) => deck.id === id)).join(",")}`}>Study group</Link></div>}
    {editing && <div className="organizer-editor">
      <form className="row" onSubmit={(event) => { event.preventDefault(); void run(async () => { const created = await api.createGroup(userId, name.trim()); onGroups([...groups, created]); onGroup(created.id); setName(""); }); }}>
        <div className="grow"><label htmlFor="new-group-name">New group</label><input id="new-group-name" className="field" placeholder="e.g. Spanish homework" maxLength={80} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></div>
        <button className="ghost" disabled={busy || !name.trim()}>Create group</button>
      </form>
      {group ? <GroupEditor key={`${group.id}-${group.deck_ids.join(",")}-${group.name}`} group={group} decks={decks} busy={busy} onSave={(name, deckIds) => void run(async () => { const updated = await api.updateGroup(group.id, userId, { name, deckIds }); onGroups(groups.map((item) => item.id === updated.id ? updated : item)); setNotice("Group saved."); })} onDelete={() => void run(async () => { if (!confirm(`Delete “${group.name}”? The sets stay in your library.`)) return; await api.deleteGroup(group.id, userId); onGroups(groups.filter((item) => item.id !== group.id)); onGroup(null); })} /> : <p className="meta">Choose a group above to rename it or change its sets.</p>}
    </div>}
    {organizing && <div className="organizer-editor">
      <h3>Choose sets to organize</h3><p className="meta">Merge them into one set, or let AI suggest a useful split by topic. You review the words before approving. Originals stay in your library; study progress is copied.</p>
      {!preview && <button className="ghost" disabled={busy} onClick={() => setSelected(selected.length === decks.length ? [] : decks.map((deck) => deck.id))}>{selected.length === decks.length ? "Clear selection" : "Select all sets"}</button>}
      <fieldset disabled={busy || !!preview} className="set-picker"><legend>Sets with the same language pair · up to 400 unique words</legend>
        {decks.map((deck) => <label key={deck.id}><input type="checkbox" checked={selected.includes(deck.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, deck.id] : current.filter((id) => id !== deck.id))} /><span>{deck.name}<small>{langLabel(deck.source_lang)} → {langLabel(deck.target_lang)} · {deck.card_count || 0} words</small></span></label>)}
        {!decks.length && <p>Create a set to get started.</p>}
      </fieldset>
      {!preview && <><label htmlFor="merge-name">Merged set name</label><input id="merge-name" className="field" maxLength={80} value={mergeName} onChange={(event) => setMergeName(event.target.value)} disabled={busy} /><div className="group-actions">
        <button className="ghost" disabled={busy || selected.length < 2 || !mergeName.trim()} onClick={() => void propose("merge")}>Preview merge</button>
        <button className="primary" disabled={busy || !selected.length} onClick={() => void propose("ai")}>AI · Suggest organization</button>
      </div></>}
      {preview && <div className="proposal"><h3>Review proposed sets</h3><p className="meta">{preview.sets.length} new sets · {preview.duplicates} duplicate words removed. For duplicates, the copy with the most study activity is used.</p>
        {preview.sets.map((set, index) => <details key={index} open><summary>{set.name} · {set.words.length} words</summary><p className="meta">{set.reason}</p><p className="proposal-words">{set.words.join(" · ")}</p></details>)}
        <div className="group-actions"><button className="primary" disabled={busy} onClick={() => void run(async () => { const data = await api.organizationDecision(preview.id, userId, "approve"); setPreview(null); setSelected([]); setOrganizing(false); setNotice(`Created ${data.deckIds.length} sets. Your originals are kept.`); await onRefresh(); })}>Approve changes</button><button className="ghost" disabled={busy} onClick={() => void run(async () => { await api.organizationDecision(preview.id, userId, "reject"); setPreview(null); setNotice("Proposal rejected. Your library is unchanged."); })}>Reject proposal</button></div>
      </div>}
    </div>}
    {busy && <p role="status" className="working-status"><span className="spinner tiny" aria-hidden />Preparing changes…</p>}
    {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status" className="notice success">{notice}</p>}
  </section>;
}
function GroupEditor({ group, decks, busy, onSave, onDelete }: { group: Group; decks: Deck[]; busy: boolean; onSave: (name: string, ids: number[]) => void; onDelete: () => void }) {
  const [name, setName] = useState(group.name);
  const [ids, setIds] = useState(group.deck_ids.filter((id) => decks.some((deck) => deck.id === id)));
  return <form onSubmit={(event) => { event.preventDefault(); onSave(name.trim(), ids); }}>
    <label htmlFor="edit-group-name">Group name</label><input id="edit-group-name" className="field" value={name} maxLength={80} disabled={busy} onChange={(event) => setName(event.target.value)} />
    <fieldset className="set-picker" disabled={busy}><legend>Sets in this group · {ids.length} selected</legend>{decks.map((deck) => <label key={deck.id}><input type="checkbox" checked={ids.includes(deck.id)} onChange={(event) => setIds((current) => event.target.checked ? [...current, deck.id] : current.filter((id) => id !== deck.id))} /><span>{deck.name}</span></label>)}</fieldset>
    <div className="group-actions"><button className="primary" disabled={busy || !name.trim()}>Save group</button><button className="danger" type="button" disabled={busy} onClick={onDelete}>Delete group</button></div>
  </form>;
}
