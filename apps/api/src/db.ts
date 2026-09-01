import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
import Database from "better-sqlite3";

import { type LevelProgress, XP_DAILY_GOAL, levelFromXp } from "./xp.js";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = path.dirname(currentFilePath);
const projectRootPath = path.resolve(currentDirectoryPath, "../../..");

// Resolved relative to the source/compiled file location (NOT process.cwd()) so that
// it always points to the persisted data volume regardless of the process working directory.
export const dataDirectoryPath = path.join(projectRootPath, "data");
export const avatarsDirectoryPath = path.join(dataDirectoryPath, "avatars");
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
  examples: string | null;
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
  ensureColumnExists(database, "words", "examples", "TEXT");
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
  ensureColumnExists(database, "users", "xp", "INTEGER DEFAULT 0");
  ensureColumnExists(database, "users", "daily_goal_xp_on", "TEXT");
  backfillUserXp(database);

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

  database.exec(`
    CREATE TABLE IF NOT EXISTS saved_phrases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      french TEXT NOT NULL,
      japanese TEXT NOT NULL,
      japanese_kana TEXT,
      explanation TEXT,
      source TEXT NOT NULL,
      word_ids TEXT,
      srs_step INTEGER DEFAULT 0,
      srs_interval INTEGER DEFAULT 0,
      srs_ease_factor REAL DEFAULT 2.5,
      srs_next_review_at TEXT,
      success_count INTEGER DEFAULT 0,
      fail_count INTEGER DEFAULT 0,
      last_reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      error_type TEXT NOT NULL,
      exercise_mode TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_error_logs_user_date ON error_logs(user_id, created_at);

    CREATE TABLE IF NOT EXISTS badge_definitions (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL,
      condition_type TEXT NOT NULL,
      condition_value INTEGER
    );

    CREATE TABLE IF NOT EXISTS user_badges (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_id TEXT NOT NULL REFERENCES badge_definitions(id),
      earned_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, badge_id)
    );

    CREATE TABLE IF NOT EXISTS grammar_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      topic TEXT NOT NULL,
      content TEXT NOT NULL,
      error_type TEXT,
      view_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, topic)
    );

    CREATE TABLE IF NOT EXISTS daily_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      challenge_date TEXT NOT NULL,
      challenge_type TEXT NOT NULL,
      challenge_data TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      is_correct INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, challenge_date)
    );
  `);

  seedBadgeDefinitions(database);
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

function backfillUserXp(database: Database.Database) {
  database.exec(`
    UPDATE users
    SET xp = (
      SELECT COALESCE(SUM(
        COALESCE(ws.success_count, 0) * 10
        + COALESCE(ws.partial_count, 0) * 4
        + COALESCE(ws.fail_count, 0) * 1
      ), 0)
      FROM word_stats ws
      INNER JOIN words w ON w.id = ws.word_id
      WHERE w.user_id = users.id
    )
    WHERE COALESCE(xp, 0) = 0
  `);
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

export function computeSrsSchedule(
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

export type BadgeDefinition = {
  id: string;
  category: string;
  title: string;
  description: string;
  icon: string;
  condition_type: string;
  condition_value: number | null;
};

export type UserBadge = BadgeDefinition & {
  earned_at: string | null;
};

const BADGE_SEEDS: Array<{
  id: string;
  category: string;
  title: string;
  description: string;
  icon: string;
  condition_type: string;
  condition_value: number | null;
}> = [
  {
    id: "first_word",
    category: "vocabulary",
    title: "Premier pas",
    description: "Ajouter son premier mot",
    icon: "📝",
    condition_type: "words_total",
    condition_value: 1,
  },
  {
    id: "words_10",
    category: "vocabulary",
    title: "Apprenti",
    description: "Avoir 10 mots dans son dictionnaire",
    icon: "📖",
    condition_type: "words_total",
    condition_value: 10,
  },
  {
    id: "words_50",
    category: "vocabulary",
    title: "Étudiant",
    description: "Avoir 50 mots dans son dictionnaire",
    icon: "📚",
    condition_type: "words_total",
    condition_value: 50,
  },
  {
    id: "words_100",
    category: "vocabulary",
    title: "Centurion",
    description: "Avoir 100 mots dans son dictionnaire",
    icon: "💯",
    condition_type: "words_total",
    condition_value: 100,
  },
  {
    id: "words_500",
    category: "vocabulary",
    title: "Érudit",
    description: "Avoir 500 mots dans son dictionnaire",
    icon: "🏛️",
    condition_type: "words_total",
    condition_value: 500,
  },
  {
    id: "first_mastered",
    category: "vocabulary",
    title: "Maîtrise",
    description: "Maîtriser son premier mot",
    icon: "⭐",
    condition_type: "mastered_total",
    condition_value: 1,
  },
  {
    id: "mastered_10",
    category: "vocabulary",
    title: "Expert",
    description: "Maîtriser 10 mots",
    icon: "🌟",
    condition_type: "mastered_total",
    condition_value: 10,
  },
  {
    id: "mastered_50",
    category: "vocabulary",
    title: "Maître",
    description: "Maîtriser 50 mots",
    icon: "🎓",
    condition_type: "mastered_total",
    condition_value: 50,
  },
  {
    id: "streak_3",
    category: "streak",
    title: "Régulier",
    description: "Maintenir une série de 3 jours",
    icon: "🔥",
    condition_type: "streak",
    condition_value: 3,
  },
  {
    id: "streak_7",
    category: "streak",
    title: "Semaine parfaite",
    description: "Maintenir une série de 7 jours",
    icon: "🔥",
    condition_type: "streak",
    condition_value: 7,
  },
  {
    id: "streak_30",
    category: "streak",
    title: "Mois de feu",
    description: "Maintenir une série de 30 jours",
    icon: "🔥",
    condition_type: "streak",
    condition_value: 30,
  },
  {
    id: "reviews_100",
    category: "practice",
    title: "Persévérant",
    description: "Faire 100 révisions au total",
    icon: "💪",
    condition_type: "reviews_total",
    condition_value: 100,
  },
  {
    id: "reviews_500",
    category: "practice",
    title: "Assidu",
    description: "Faire 500 révisions au total",
    icon: "🏋️",
    condition_type: "reviews_total",
    condition_value: 500,
  },
  {
    id: "reviews_1000",
    category: "practice",
    title: "Infatigable",
    description: "Faire 1000 révisions au total",
    icon: "🏆",
    condition_type: "reviews_total",
    condition_value: 1000,
  },
  {
    id: "first_phrase_saved",
    category: "practice",
    title: "Collectionneur",
    description: "Sauvegarder sa première phrase",
    icon: "📌",
    condition_type: "saved_phrases_total",
    condition_value: 1,
  },
  {
    id: "perfect_session",
    category: "milestone",
    title: "Sans faute",
    description: "Terminer une session sans aucune erreur",
    icon: "✨",
    condition_type: "event",
    condition_value: null,
  },
  {
    id: "first_dialogue",
    category: "milestone",
    title: "Conversation",
    description: "Compléter son premier dialogue",
    icon: "🗣️",
    condition_type: "event",
    condition_value: null,
  },
];

function seedBadgeDefinitions(database: Database.Database) {
  const insertStatement = database.prepare(
    `INSERT OR IGNORE INTO badge_definitions (id, category, title, description, icon, condition_type, condition_value)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const badge of BADGE_SEEDS) {
    insertStatement.run(
      badge.id,
      badge.category,
      badge.title,
      badge.description,
      badge.icon,
      badge.condition_type,
      badge.condition_value,
    );
  }
}

export function checkAndAwardBadges(
  database: Database.Database,
  userId: number,
): BadgeDefinition[] {
  const thresholdBadges = database
    .prepare(
      `SELECT bd.* FROM badge_definitions bd
       WHERE bd.condition_type != 'event'
         AND bd.id NOT IN (SELECT badge_id FROM user_badges WHERE user_id = ?)`,
    )
    .all(userId) as BadgeDefinition[];

  if (thresholdBadges.length === 0) return [];

  const wordsTotal = (
    database.prepare("SELECT COUNT(*) as count FROM words WHERE user_id = ?").get(userId) as {
      count: number;
    }
  ).count;

  const masteredTotal = (
    database
      .prepare(
        `SELECT COUNT(*) as count FROM word_stats ws
         INNER JOIN words w ON w.id = ws.word_id
         WHERE w.user_id = ? AND ws.consecutive_success_count >= 10`,
      )
      .get(userId) as { count: number }
  ).count;

  const reviewsTotal = (
    database
      .prepare(
        `SELECT COALESCE(SUM(ws.success_count + ws.partial_count + ws.fail_count), 0) as count
         FROM word_stats ws INNER JOIN words w ON w.id = ws.word_id WHERE w.user_id = ?`,
      )
      .get(userId) as { count: number }
  ).count;

  const savedPhrasesTotal = (
    database
      .prepare("SELECT COUNT(*) as count FROM saved_phrases WHERE user_id = ?")
      .get(userId) as { count: number }
  ).count;

  const dailyGoal = (
    database.prepare("SELECT daily_goal FROM users WHERE id = ?").get(userId) as {
      daily_goal: number;
    }
  ).daily_goal;

  let currentStreak = 0;
  const activityRows = database
    .prepare(
      `SELECT activity_date, reviews_count FROM daily_activity
       WHERE user_id = ? ORDER BY activity_date DESC LIMIT 365`,
    )
    .all(userId) as Array<{ activity_date: string; reviews_count: number }>;

  const activityMap = new Map<string, number>();
  for (const row of activityRows) {
    activityMap.set(row.activity_date, row.reviews_count);
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayReviews = activityMap.get(todayStr) ?? 0;
  const startDate = new Date();
  if (todayReviews < dailyGoal) {
    startDate.setDate(startDate.getDate() - 1);
  }
  for (let dayOffset = 0; dayOffset < 365; dayOffset++) {
    const dateStr = startDate.toISOString().slice(0, 10);
    const reviews = activityMap.get(dateStr) ?? 0;
    if (reviews >= dailyGoal) {
      currentStreak++;
      startDate.setDate(startDate.getDate() - 1);
    } else {
      break;
    }
  }
  if (todayReviews >= dailyGoal) {
    currentStreak = Math.max(currentStreak, 1);
  }

  const metricsMap: Record<string, number> = {
    words_total: wordsTotal,
    mastered_total: masteredTotal,
    reviews_total: reviewsTotal,
    saved_phrases_total: savedPhrasesTotal,
    streak: currentStreak,
  };

  const newlyEarned: BadgeDefinition[] = [];
  const insertBadge = database.prepare(
    "INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)",
  );

  for (const badge of thresholdBadges) {
    const currentValue = metricsMap[badge.condition_type];
    if (
      currentValue !== undefined &&
      badge.condition_value !== null &&
      currentValue >= badge.condition_value
    ) {
      insertBadge.run(userId, badge.id);
      newlyEarned.push(badge);
    }
  }

  return newlyEarned;
}

export function awardEventBadge(
  database: Database.Database,
  userId: number,
  badgeId: string,
): BadgeDefinition | null {
  const existing = database
    .prepare("SELECT 1 FROM user_badges WHERE user_id = ? AND badge_id = ?")
    .get(userId, badgeId);
  if (existing) return null;

  const badge = database.prepare("SELECT * FROM badge_definitions WHERE id = ?").get(badgeId) as
    | BadgeDefinition
    | undefined;
  if (!badge) return null;

  database
    .prepare("INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)")
    .run(userId, badgeId);
  return badge;
}

export type XpAward = LevelProgress & {
  xpGained: number;
  leveledUp: boolean;
};

export function grantXp(database: Database.Database, userId: number, amount: number): XpAward {
  const xpGained = Math.max(0, Math.trunc(amount));
  const currentRow = database
    .prepare("SELECT COALESCE(xp, 0) AS xp FROM users WHERE id = ?")
    .get(userId) as { xp: number } | undefined;
  const previousProgress = levelFromXp(currentRow?.xp ?? 0);
  const nextProgress = levelFromXp(previousProgress.totalXp + xpGained);
  database.prepare("UPDATE users SET xp = ? WHERE id = ?").run(nextProgress.totalXp, userId);
  return {
    ...nextProgress,
    xpGained,
    leveledUp: nextProgress.level > previousProgress.level,
  };
}

export function maybeAwardDailyGoalXp(database: Database.Database, userId: number): number {
  const today = new Date().toISOString().slice(0, 10);
  const userRow = database
    .prepare(
      "SELECT COALESCE(daily_goal, 20) AS daily_goal, daily_goal_xp_on FROM users WHERE id = ?",
    )
    .get(userId) as { daily_goal: number; daily_goal_xp_on: string | null } | undefined;
  if (!userRow) return 0;
  if (userRow.daily_goal_xp_on === today) return 0;

  const todayRow = database
    .prepare("SELECT reviews_count FROM daily_activity WHERE user_id = ? AND activity_date = ?")
    .get(userId, today) as { reviews_count: number } | undefined;
  const todayReviews = todayRow?.reviews_count ?? 0;
  if (todayReviews < userRow.daily_goal) return 0;

  database.prepare("UPDATE users SET daily_goal_xp_on = ? WHERE id = ?").run(today, userId);
  return XP_DAILY_GOAL;
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
