import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const dataDir = process.env.DATA_DIR || join(import.meta.dir, "..", "data");
const dbPath = join(dataDir, "quiz.db");
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS decks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    source_lang TEXT NOT NULL DEFAULT 'auto',
    target_lang TEXT NOT NULL DEFAULT 'en',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id INTEGER NOT NULL,
    word TEXT NOT NULL,
    translation TEXT NOT NULL,
    sentence TEXT NOT NULL,
    sentence_translation TEXT NOT NULL,
    notes TEXT DEFAULT '',
    known_count INTEGER NOT NULL DEFAULT 0,
    unknown_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
  );
`);

export type User = { id: number; username: string; created_at: string };
export type Deck = {
  id: number;
  user_id: number;
  name: string;
  source_lang: string;
  target_lang: string;
  created_at: string;
  card_count?: number;
};
export type Card = {
  id: number;
  deck_id: number;
  word: string;
  translation: string;
  sentence: string;
  sentence_translation: string;
  notes: string;
  known_count: number;
  unknown_count: number;
  created_at: string;
};
