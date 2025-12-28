import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = path.dirname(currentFilePath);
const projectRootPath = path.resolve(currentDirectoryPath, "../../..");
const dataDirectoryPath = path.join(projectRootPath, "data");
const databaseFilePath = path.join(dataDirectoryPath, "kotoba.sqlite");

export type ReviewResult = "success" | "partial" | "fail";

export type WordRow = {
  id: number;
  user_id: number | null;
  french: string;
  romaji: string | null;
  kana: string | null;
  kanji: string | null;
  note: string | null;
  created_at: string;
};

export type WordStatsRow = {
  word_id: number;
  success_count: number;
  partial_count: number;
  fail_count: number;
  score: number;
  last_reviewed_at: string | null;
};

export type WordWithStatsRow = WordRow & {
  success_count: number;
  partial_count: number;
  fail_count: number;
  score: number;
  last_reviewed_at: string | null;
};

export type TagRow = {
  id: number;
  user_id: number | null;
  name: string;
  created_at: string;
};

export function openDatabase() {
  fs.mkdirSync(dataDirectoryPath, { recursive: true });
  const database = new Database(databaseFilePath);
  database.pragma("journal_mode = WAL");
  ensureSchema(database);
  return database;
}

function ensureSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      french TEXT NOT NULL,
      romaji TEXT,
      kana TEXT,
      kanji TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS word_stats (
      word_id INTEGER PRIMARY KEY,
      success_count INTEGER NOT NULL DEFAULT 0,
      partial_count INTEGER NOT NULL DEFAULT 0,
      fail_count INTEGER NOT NULL DEFAULT 0,
      score INTEGER NOT NULL DEFAULT 0,
      last_reviewed_at TEXT,
      FOREIGN KEY(word_id) REFERENCES words(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS word_tags (
      word_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (word_id, tag_id),
      FOREIGN KEY(word_id) REFERENCES words(id) ON DELETE CASCADE,
      FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_word_tags_tag_id ON word_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_word_tags_word_id ON word_tags(word_id);
    CREATE INDEX IF NOT EXISTS idx_words_user_id ON words(user_id);
    CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_user_id_name ON tags(user_id, name);
  `);

  ensureColumnExists(database, "words", "user_id", "INTEGER");
  ensureColumnExists(database, "tags", "user_id", "INTEGER");
  rebuildTagsAndWordTagsIfNeeded(database);
}

function ensureColumnExists(
  database: Database.Database,
  tableName: string,
  columnName: string,
  columnType: string,
) {
  const columnRows = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;
  const hasColumn = columnRows.some((column) => column.name === columnName);
  if (hasColumn) return;
  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
}

function rebuildTagsAndWordTagsIfNeeded(database: Database.Database) {
  // We need tags uniqueness to be scoped by user_id (user_id, name), not globally by name.
  // If the existing `tags` table was created with a UNIQUE constraint on `name`, SQLite creates
  // an autoindex like `sqlite_autoindex_tags_1` which we cannot drop. In that case we rebuild.
  try {
    const indexList = database.prepare("PRAGMA index_list(tags)").all() as Array<{
      name: string;
      unique: number;
      origin: string;
    }>;

    const hasUniqueConstraintIndex = indexList.some(
      (indexRow) => indexRow.unique === 1 && indexRow.origin === "u",
    );
    if (!hasUniqueConstraintIndex) return;

    database.exec("PRAGMA foreign_keys = OFF;");
    const transaction = database.transaction(() => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS tags_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        INSERT INTO tags_new (id, user_id, name, created_at)
        SELECT id, user_id, name, created_at FROM tags;

        CREATE TABLE IF NOT EXISTS word_tags_new (
          word_id INTEGER NOT NULL,
          tag_id INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (word_id, tag_id),
          FOREIGN KEY(word_id) REFERENCES words(id) ON DELETE CASCADE,
          FOREIGN KEY(tag_id) REFERENCES tags_new(id) ON DELETE CASCADE
        );

        INSERT INTO word_tags_new (word_id, tag_id, created_at)
        SELECT word_id, tag_id, created_at FROM word_tags;

        DROP TABLE word_tags;
        DROP TABLE tags;

        ALTER TABLE tags_new RENAME TO tags;
        ALTER TABLE word_tags_new RENAME TO word_tags;

        CREATE INDEX IF NOT EXISTS idx_word_tags_tag_id ON word_tags(tag_id);
        CREATE INDEX IF NOT EXISTS idx_word_tags_word_id ON word_tags(word_id);
        CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_user_id_name ON tags(user_id, name);
      `);
    });

    transaction();
  } finally {
    database.exec("PRAGMA foreign_keys = ON;");
  }
}

export function computeScoreDelta(reviewResult: ReviewResult): number {
  if (reviewResult === "success") return 2;
  if (reviewResult === "partial") return 1;
  return -2;
}

export function applyReviewToStats(
  existingStats: WordStatsRow,
  reviewResult: ReviewResult,
): WordStatsRow {
  const scoreDelta = computeScoreDelta(reviewResult);
  const nowIso = new Date().toISOString();

  return {
    ...existingStats,
    success_count: existingStats.success_count + (reviewResult === "success" ? 1 : 0),
    partial_count: existingStats.partial_count + (reviewResult === "partial" ? 1 : 0),
    fail_count: existingStats.fail_count + (reviewResult === "fail" ? 1 : 0),
    score: existingStats.score + scoreDelta,
    last_reviewed_at: nowIso,
  };
}
