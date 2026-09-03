import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient, type InValue, type ResultSet, type Row } from "@libsql/client";

const dataDir = process.env.DATA_DIR || join(import.meta.dir, "..", "data");
mkdirSync(dataDir, { recursive: true });

const url = process.env.LIBSQL_URL || `file:${join(dataDir, "quiz.db")}`;
const authToken = process.env.LIBSQL_AUTH_TOKEN || undefined;

export const client = createClient({ url, authToken });

async function waitForDb() {
  let lastError: unknown;
  for (let i = 0; i < 40; i++) {
    try {
      await client.execute("SELECT 1");
      return;
    } catch (err) {
      lastError = err;
      await Bun.sleep(250);
    }
  }
  throw new Error(`Could not connect to libSQL at ${url}: ${lastError instanceof Error ? lastError.message : lastError}`);
}

const SCHEMA = `
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
`;

await waitForDb();
await client.execute("PRAGMA foreign_keys = ON");
for (const statement of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
  await client.execute(statement);
}

function mapRow<T>(rs: ResultSet, row: Row): T {
  const obj: Record<string, unknown> = {};
  for (const name of rs.columns) {
    const value = row[name];
    obj[name] = typeof value === "bigint" ? Number(value) : value;
  }
  return obj as T;
}

export async function get<T>(sql: string, args: InValue[] = []): Promise<T | null> {
  const rs = await client.execute({ sql, args });
  const row = rs.rows[0];
  return row ? mapRow<T>(rs, row) : null;
}

export async function all<T>(sql: string, args: InValue[] = []): Promise<T[]> {
  const rs = await client.execute({ sql, args });
  return rs.rows.map((row) => mapRow<T>(rs, row));
}

export async function run(sql: string, args: InValue[] = []): Promise<ResultSet> {
  return client.execute({ sql, args });
}

export async function insertId(sql: string, args: InValue[] = []): Promise<number> {
  const rs = await client.execute({ sql, args });
  return Number(rs.lastInsertRowid);
}

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
