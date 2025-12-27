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
    CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      french TEXT NOT NULL,
      romaji TEXT,
      kana TEXT,
      kanji TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  `);
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
