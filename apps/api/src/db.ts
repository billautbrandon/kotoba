import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
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
  consecutive_success_count: number;
  srs_interval: number;
  srs_ease_factor: number;
  srs_next_review_at: string | null;
  srs_step: number;
};

export type WordWithStatsRow = WordRow & {
  success_count: number;
  partial_count: number;
  fail_count: number;
  score: number;
  last_reviewed_at: string | null;
  consecutive_success_count: number;
  srs_interval: number;
  srs_ease_factor: number;
  srs_next_review_at: string | null;
  srs_step: number;
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

    CREATE TABLE IF NOT EXISTS gemini_usage (
      usage_date TEXT PRIMARY KEY,
      request_count INTEGER NOT NULL DEFAULT 0
    );
  `);

  ensureColumnExists(database, "words", "user_id", "INTEGER");
  ensureColumnExists(database, "tags", "user_id", "INTEGER");
  ensureColumnExists(database, "word_stats", "consecutive_success_count", "INTEGER DEFAULT 0");
  ensureColumnExists(database, "word_stats", "srs_interval", "INTEGER DEFAULT 0");
  ensureColumnExists(database, "word_stats", "srs_ease_factor", "REAL DEFAULT 2.5");
  ensureColumnExists(database, "word_stats", "srs_next_review_at", "TEXT");
  ensureColumnExists(database, "word_stats", "srs_step", "INTEGER DEFAULT 0");
  ensureColumnExists(database, "users", "email", "TEXT");
  ensureColumnExists(database, "users", "avatar_url", "TEXT");
  ensureColumnExists(database, "users", "display_name", "TEXT");
  ensureColumnExists(database, "users", "is_admin", "INTEGER DEFAULT 0");
  ensureColumnExists(database, "users", "daily_goal", "INTEGER DEFAULT 20");

  database.exec(`
    CREATE TABLE IF NOT EXISTS daily_activity (
      user_id INTEGER NOT NULL,
      activity_date TEXT NOT NULL,
      reviews_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, activity_date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_words_user_id ON words(user_id);
    CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_user_id_name ON tags(user_id, name);
  `);

  ensureRootUser(database);
  rebuildTagsAndWordTagsIfNeeded(database);
}

function ensureRootUser(database: Database.Database) {
  const existingRoot = database.prepare("SELECT id FROM users WHERE username = ?").get("root") as
    | { id: number }
    | undefined;
  if (existingRoot) {
    // Ensure existing root user has admin privileges
    database.prepare("UPDATE users SET is_admin = 1 WHERE username = ?").run("root");
    return;
  }

  // Use bcryptjs hashSync for synchronous hashing
  try {
    const rootPasswordHash = (
      bcrypt as unknown as { hashSync: (data: string, saltRounds: number) => string }
    ).hashSync("root", 12);
    database
      .prepare("INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)")
      .run("root", rootPasswordHash, 1);
  } catch (error) {
    console.error("[kotoba/db] Failed to create root user:", error);
  }
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

// --- Gemini usage tracking ---

const GEMINI_FREE_TIER_RPD = 250;

function getPacificDateString(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function getPacificMidnightUtc(): string {
  const pacificNow = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const [year, month, day] = pacificNow.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1, 8, 0, 0));
  return nextDay.toISOString();
}

export function incrementGeminiUsage(database: Database.Database): void {
  const today = getPacificDateString();
  database
    .prepare(
      `INSERT INTO gemini_usage (usage_date, request_count)
       VALUES (?, 1)
       ON CONFLICT(usage_date) DO UPDATE SET request_count = request_count + 1`,
    )
    .run(today);
}

export function getGeminiQuota(database: Database.Database): {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
} {
  const today = getPacificDateString();
  const row = database
    .prepare("SELECT request_count FROM gemini_usage WHERE usage_date = ?")
    .get(today) as { request_count: number } | undefined;

  const used = row?.request_count ?? 0;
  return {
    used,
    limit: GEMINI_FREE_TIER_RPD,
    remaining: Math.max(0, GEMINI_FREE_TIER_RPD - used),
    resetsAt: getPacificMidnightUtc(),
  };
}

export function computeScoreDelta(reviewResult: ReviewResult): number {
  if (reviewResult === "success") return 3;
  if (reviewResult === "partial") return -2;
  return -5;
}

const MAX_SRS_INTERVAL_DAYS = 3650;

function computeSrsSchedule(
  currentStep: number,
  currentInterval: number,
  currentEaseFactor: number,
  reviewResult: ReviewResult,
): { srs_step: number; srs_interval: number; srs_ease_factor: number; srs_next_review_at: string } {
  let step = Number.isFinite(currentStep) ? Math.trunc(currentStep) : 0;
  let interval = Number.isFinite(currentInterval) ? Math.trunc(currentInterval) : 0;
  let easeFactor =
    Number.isFinite(currentEaseFactor) && currentEaseFactor > 0 ? currentEaseFactor : 2.5;

  if (reviewResult === "success") {
    step += 1;
    if (step === 1) {
      interval = 1;
    } else if (step === 2) {
      interval = 3;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    easeFactor = Math.max(1.3, easeFactor + 0.1);
  } else if (reviewResult === "partial") {
    easeFactor = Math.max(1.3, easeFactor - 0.15);
    interval = Math.max(1, Math.round(interval * 0.5));
    step = Math.max(1, step);
  } else {
    easeFactor = Math.max(1.3, easeFactor - 0.2);
    interval = 1;
    step = 0;
  }

  if (!Number.isFinite(interval) || interval < 0) interval = 1;
  if (interval > MAX_SRS_INTERVAL_DAYS) interval = MAX_SRS_INTERVAL_DAYS;

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + interval);
  const srsNextReviewAt = Number.isNaN(nextReviewDate.getTime())
    ? new Date().toISOString()
    : nextReviewDate.toISOString();

  return {
    srs_step: step,
    srs_interval: interval,
    srs_ease_factor: easeFactor,
    srs_next_review_at: srsNextReviewAt,
  };
}

function toSafeInteger(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.trunc(value);
}

function toSafeFloat(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value;
}

export function applyReviewToStats(
  existingStats: WordStatsRow,
  reviewResult: ReviewResult,
): WordStatsRow {
  const scoreDelta = computeScoreDelta(reviewResult);
  const nowIso = new Date().toISOString();

  const safeExistingStats: WordStatsRow = {
    ...existingStats,
    success_count: toSafeInteger(existingStats.success_count),
    partial_count: toSafeInteger(existingStats.partial_count),
    fail_count: toSafeInteger(existingStats.fail_count),
    score: toSafeInteger(existingStats.score),
    consecutive_success_count: toSafeInteger(existingStats.consecutive_success_count),
    srs_interval: toSafeInteger(existingStats.srs_interval),
    srs_ease_factor: toSafeFloat(existingStats.srs_ease_factor, 2.5),
    srs_step: toSafeInteger(existingStats.srs_step),
  };

  const srsResult = computeSrsSchedule(
    safeExistingStats.srs_step,
    safeExistingStats.srs_interval,
    safeExistingStats.srs_ease_factor,
    reviewResult,
  );

  return {
    ...safeExistingStats,
    success_count: safeExistingStats.success_count + (reviewResult === "success" ? 1 : 0),
    partial_count: safeExistingStats.partial_count + (reviewResult === "partial" ? 1 : 0),
    fail_count: safeExistingStats.fail_count + (reviewResult === "fail" ? 1 : 0),
    score: safeExistingStats.score + scoreDelta,
    last_reviewed_at: nowIso,
    consecutive_success_count:
      reviewResult === "success" ? safeExistingStats.consecutive_success_count + 1 : 0,
    ...srsResult,
  };
}
