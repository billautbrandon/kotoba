import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { EdgeTTS } from "edge-tts-universal";
import multer from "multer";
import { z } from "zod";

import type { Request } from "express";

import { SchemaType } from "@google/generative-ai";
import { type PublicUser, hashPassword, verifyPassword } from "./auth.js";
import {
  type BadgeDefinition,
  type ReviewResult,
  type WordStatsRow,
  applyReviewToStats,
  avatarsDirectoryPath,
  awardEventBadge,
  checkAndAwardBadges,
  computeSrsSchedule,
  getGeminiQuota,
  incrementGeminiUsage,
} from "./db.js";
import {
  GeminiApiError,
  type GeminiJsonOptions,
  GeminiQuotaError,
  callGeminiJson,
  isGeminiConfigured,
} from "./gemini.js";
import { downloadKanjiSvgsFromText, downloadMissingKanjiSvgs } from "./kanji-downloader.js";

export function registerApiRoutes(app: import("express").Express, database: Database.Database) {
  const wrapAsync =
    (
      handler: (
        req: import("express").Request,
        res: import("express").Response,
        next: import("express").NextFunction,
      ) => Promise<void>,
    ) =>
    (
      req: import("express").Request,
      res: import("express").Response,
      next: import("express").NextFunction,
    ) => {
      handler(req, res, next).catch(next);
    };

  function requireAdmin(req: Request): void {
    const userId = getRequiredUserId(req);
    const userRow = database
      .prepare("SELECT COALESCE(is_admin, 0) as is_admin FROM users WHERE id = ?")
      .get(userId) as { is_admin: number } | undefined;
    if (!userRow || userRow.is_admin !== 1) {
      throw new Error("Forbidden: Admin access required");
    }
  }

  function trackDailyActivity(db: Database.Database, userId: number, count: number) {
    const today = new Date().toISOString().slice(0, 10);
    db.prepare(
      `INSERT INTO daily_activity (user_id, activity_date, reviews_count)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, activity_date) DO UPDATE SET reviews_count = reviews_count + ?`,
    ).run(userId, today, count, count);
  }

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/auth/me", (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const userRow = database
      .prepare(
        "SELECT id, username, email, avatar_url, display_name, COALESCE(is_admin, 0) as is_admin, created_at FROM users WHERE id = ?",
      )
      .get(userId) as PublicUser | undefined;

    if (!userRow) {
      req.session.destroy(() => undefined);
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    res.json({ user: userRow });
  });

  app.post(
    "/api/auth/register",
    wrapAsync(async (req, res) => {
      const bodySchema = z.object({
        username: z.string().min(3).max(48),
        password: z.string().min(8).max(200),
      });
      const body = bodySchema.parse(req.body);

      const username = body.username.trim().toLowerCase();
      if (!username) {
        res.status(400).json({ error: "Username is required" });
        return;
      }

      const existingUser = database
        .prepare("SELECT id FROM users WHERE username = ?")
        .get(username) as { id: number } | undefined;
      if (existingUser) {
        res.status(409).json({ error: "Username already exists" });
        return;
      }

      const usersCountRow = database.prepare("SELECT COUNT(*) AS count FROM users").get() as {
        count: number;
      };
      const isFirstUser = usersCountRow.count === 0;

      const passwordHash = await hashPassword(body.password);
      const insertResult = database
        .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
        .run(username, passwordHash);
      const insertedUserId = Number(insertResult.lastInsertRowid);

      // If the app existed before user support, we may have orphan data with NULL user_id.
      // We auto-claim it for the first user to avoid "data disappearance" after upgrade.
      if (isFirstUser) {
        database.prepare("UPDATE words SET user_id = ? WHERE user_id IS NULL").run(insertedUserId);
        database.prepare("UPDATE tags SET user_id = ? WHERE user_id IS NULL").run(insertedUserId);
      }

      req.session.userId = insertedUserId;

      // Force session save to ensure cookie is set
      req.session.save((err) => {
        if (err) {
          console.error("[kotoba/api] Session save error:", err);
          res.status(500).json({ error: "Failed to create session" });
          return;
        }
        const createdUser = database
          .prepare(
            "SELECT id, username, email, avatar_url, display_name, COALESCE(is_admin, 0) as is_admin, created_at FROM users WHERE id = ?",
          )
          .get(insertedUserId) as PublicUser;

        res.status(201).json({ user: createdUser });
      });
    }),
  );

  app.post(
    "/api/auth/login",
    wrapAsync(async (req, res) => {
      const bodySchema = z.object({
        username: z.string().min(1),
        password: z.string().min(1),
        rememberMe: z.boolean().optional(),
      });
      const body = bodySchema.parse(req.body);
      const username = body.username.trim().toLowerCase();

      const userRow = database
        .prepare(
          "SELECT id, username, password_hash, email, avatar_url, display_name, COALESCE(is_admin, 0) as is_admin, created_at FROM users WHERE username = ?",
        )
        .get(username) as (PublicUser & { password_hash: string }) | undefined;

      if (!userRow) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      const isValid = await verifyPassword(body.password, userRow.password_hash);
      if (!isValid) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      if (body.rememberMe) {
        req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30;
      } else {
        req.session.cookie.maxAge = 1000 * 60 * 60 * 24;
      }

      req.session.userId = userRow.id;

      // Force session save to ensure cookie is set
      req.session.save((err) => {
        if (err) {
          console.error("[kotoba/api] Session save error:", err);
          res.status(500).json({ error: "Failed to create session" });
          return;
        }
        const { password_hash, ...publicUser } = userRow;
        res.json({ user: publicUser });
      });
    }),
  );

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.status(204).send();
    });
  });

  app.post(
    "/api/auth/change-password",
    wrapAsync(async (req, res) => {
      const userId = getRequiredUserId(req);
      const bodySchema = z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8).max(200),
      });
      const body = bodySchema.parse(req.body);

      const userRow = database
        .prepare("SELECT id, password_hash FROM users WHERE id = ?")
        .get(userId) as { id: number; password_hash: string } | undefined;

      if (!userRow) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const isValid = await verifyPassword(body.currentPassword, userRow.password_hash);
      if (!isValid) {
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }

      const newPasswordHash = await hashPassword(body.newPassword);
      database
        .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
        .run(newPasswordHash, userId);

      res.status(200).json({ success: true });
    }),
  );

  app.put(
    "/api/auth/profile",
    wrapAsync(async (req, res) => {
      const userId = getRequiredUserId(req);
      const bodySchema = z.object({
        email: z.string().email().optional().nullable(),
        display_name: z.string().min(1).max(100).optional().nullable(),
      });
      const body = bodySchema.parse(req.body);

      database
        .prepare("UPDATE users SET email = ?, display_name = ? WHERE id = ?")
        .run(body.email ?? null, body.display_name ?? null, userId);

      const updatedUser = database
        .prepare(
          "SELECT id, username, email, avatar_url, display_name, COALESCE(is_admin, 0) as is_admin, created_at FROM users WHERE id = ?",
        )
        .get(userId) as PublicUser;

      res.json({ user: updatedUser });
    }),
  );

  app.post(
    "/api/auth/avatar",
    wrapAsync(async (req, res) => {
      const userId = getRequiredUserId(req);

      const avatarsDir = avatarsDirectoryPath;
      fs.mkdirSync(avatarsDir, { recursive: true });

      const storage = multer.diskStorage({
        destination: (
          _req: import("express").Request,
          _file: Express.Multer.File,
          callback: (error: Error | null, destination: string) => void,
        ) => {
          callback(null, avatarsDir);
        },
        filename: (
          _req: import("express").Request,
          file: Express.Multer.File,
          callback: (error: Error | null, filename: string) => void,
        ) => {
          const ext = path.extname(file.originalname);
          const filename = `${userId}-${Date.now()}${ext}`;
          callback(null, filename);
        },
      });

      const upload = multer({
        storage,
        limits: { fileSize: 5 * 1024 * 1024 },
        fileFilter: (
          _req: import("express").Request,
          file: Express.Multer.File,
          callback: multer.FileFilterCallback,
        ) => {
          const allowedMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
          if (allowedMimes.includes(file.mimetype)) {
            callback(null, true);
          } else {
            callback(new Error("Invalid file type. Only images are allowed."));
          }
        },
      });

      upload.single("avatar")(req, res, (err: unknown) => {
        if (err) {
          res.status(400).json({ error: err instanceof Error ? err.message : "Upload failed" });
          return;
        }
        const file = (req as unknown as { file?: { filename: string } }).file;
        if (!file) {
          res.status(400).json({ error: "No file uploaded" });
          return;
        }

        const avatarUrl = `/avatars/${file.filename}`;
        database.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").run(avatarUrl, userId);

        const updatedUser = database
          .prepare(
            "SELECT id, username, email, avatar_url, display_name, COALESCE(is_admin, 0) as is_admin, created_at FROM users WHERE id = ?",
          )
          .get(userId) as PublicUser;

        res.json({ user: updatedUser });
      });
    }),
  );

  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth") || req.path.startsWith("/health")) {
      next();
      return;
    }
    const userId = getSessionUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    next();
  });

  app.get("/api/tags", (_req, res) => {
    const userId = getRequiredUserId(_req);
    const rows = database
      .prepare("SELECT id, name, created_at FROM tags WHERE user_id = ? ORDER BY name ASC")
      .all(userId);
    res.json({ tags: rows });
  });

  app.post("/api/tags", (req, res) => {
    const userId = getRequiredUserId(req);
    const bodySchema = z.object({
      name: z.string().min(1),
    });
    const body = bodySchema.parse(req.body);

    const trimmedName = body.name.trim();
    if (!trimmedName) {
      res.status(400).json({ error: "Tag name is required" });
      return;
    }

    database
      .prepare("INSERT OR IGNORE INTO tags (user_id, name) VALUES (?, ?)")
      .run(userId, trimmedName);
    const createdOrExistingTag = database
      .prepare("SELECT id, name, created_at FROM tags WHERE user_id = ? AND name = ?")
      .get(userId, trimmedName);

    res.status(201).json({ tag: createdOrExistingTag });
  });

  app.delete("/api/tags/:id", (req, res) => {
    const userId = getRequiredUserId(req);
    const tagId = Number(req.params.id);
    if (!Number.isFinite(tagId)) {
      res.status(400).json({ error: "Invalid tag id" });
      return;
    }
    database.prepare("DELETE FROM tags WHERE id = ? AND user_id = ?").run(tagId, userId);
    res.status(204).send();
  });

  app.get("/api/words", (req, res) => {
    const userId = getRequiredUserId(req);
    const includeStats = req.query.includeStats === "1" || req.query.includeStats === "true";
    const includeTags = req.query.includeTags === "1" || req.query.includeTags === "true";

    const baseSelect = `
      SELECT
        w.id,
        w.french,
        w.romaji,
        w.kana,
        w.kanji,
        w.note,
        w.examples,
        w.created_at
      FROM words w
      WHERE w.user_id = ?
    `;

    if (!includeStats && !includeTags) {
      const rows = database.prepare(`${baseSelect} ORDER BY w.id DESC`).all(userId) as Array<
        Record<string, unknown> & { examples: string | null }
      >;
      const words = rows.map((row) => ({ ...row, examples: parseExamples(row.examples) }));
      res.json({ words });
      return;
    }

    type TagInfo = { id: number; name: string };
    type WordJoinedRow = {
      id: number;
      french: string;
      romaji: string | null;
      kana: string | null;
      kanji: string | null;
      note: string | null;
      examples: string | null;
      created_at: string;
      success_count: number;
      partial_count: number;
      fail_count: number;
      score: number;
      last_reviewed_at: string | null;
      tags_concat: string | null;
    };

    type WordWithStatsColumns = Omit<WordJoinedRow, "tags_concat" | "examples"> & {
      examples: WordExample[];
    };
    type WordWithStatsAndTags = WordWithStatsColumns & { tags: TagInfo[] };

    const rows = database
      .prepare(
        `
        SELECT
          w.id,
          w.french,
          w.romaji,
          w.kana,
          w.kanji,
          w.note,
          w.examples,
          w.created_at,
          COALESCE(s.success_count, 0) AS success_count,
          COALESCE(s.partial_count, 0) AS partial_count,
          COALESCE(s.fail_count, 0) AS fail_count,
          COALESCE(s.score, 0) AS score,
          s.last_reviewed_at AS last_reviewed_at,
          GROUP_CONCAT(t.id || ':' || t.name, '||') AS tags_concat
        FROM words w
        LEFT JOIN word_stats s ON s.word_id = w.id
        LEFT JOIN word_tags wt ON wt.word_id = w.id
        LEFT JOIN tags t ON t.id = wt.tag_id AND t.user_id = ?
        WHERE w.user_id = ?
        GROUP BY w.id
        ORDER BY w.id DESC
      `,
      )
      .all(userId, userId) as WordJoinedRow[];

    const wordsWithOptionalTags = rows.map((row): WordWithStatsColumns | WordWithStatsAndTags => {
      const parsedTags = parseTagsConcat(row.tags_concat);
      const { tags_concat, ...restRow } = row satisfies WordJoinedRow;
      const rowWithExamples = { ...restRow, examples: parseExamples(restRow.examples) };
      if (!includeTags) {
        return rowWithExamples;
      }
      return { ...rowWithExamples, tags: parsedTags };
    });

    if (includeStats && includeTags) {
      res.json({ words: wordsWithOptionalTags });
      return;
    }

    if (!includeStats && includeTags) {
      const strippedStats = wordsWithOptionalTags.map((word) => {
        const wordWithStatsAndTags = word as WordWithStatsAndTags;
        const { success_count, partial_count, fail_count, score, last_reviewed_at, ...restWord } =
          wordWithStatsAndTags;
        return restWord;
      });
      res.json({ words: strippedStats });
      return;
    }

    if (includeStats && !includeTags) {
      const strippedTags = wordsWithOptionalTags.map((word) => {
        const { tags, ...restWord } = word as WordWithStatsAndTags;
        return restWord;
      });
      res.json({ words: strippedTags });
      return;
    }

    res.json({ words: wordsWithOptionalTags });
  });

  app.post("/api/words", (req, res) => {
    const userId = getRequiredUserId(req);
    const bodySchema = z.object({
      french: z.string().min(1),
      romaji: z.string().optional().nullable(),
      kana: z.string().optional().nullable(),
      kanji: z.string().optional().nullable(),
      note: z.string().optional().nullable(),
      examples: z
        .array(
          z.object({
            jp: z.string().optional(),
            kana: z.string().optional(),
            fr: z.string().optional(),
          }),
        )
        .max(3)
        .optional(),
      tagIds: z.array(z.number().int().positive()).optional(),
    });
    const body = bodySchema.parse(req.body);

    const insertWordStatement = database.prepare(
      "INSERT INTO words (user_id, french, romaji, kana, kanji, note, examples) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    const insertResult = insertWordStatement.run(
      userId,
      body.french,
      body.romaji ?? null,
      body.kana ?? null,
      body.kanji ?? null,
      body.note ?? null,
      serializeExamples(body.examples),
    );

    const wordId = Number(insertResult.lastInsertRowid);
    database.prepare("INSERT OR IGNORE INTO word_stats (word_id) VALUES (?)").run(wordId);

    if (body.tagIds && body.tagIds.length > 0) {
      const insertWordTagStatement = database.prepare(
        "INSERT OR IGNORE INTO word_tags (word_id, tag_id) VALUES (?, ?)",
      );
      const tagBelongsToUserStatement = database.prepare(
        "SELECT 1 FROM tags WHERE id = ? AND user_id = ?",
      );
      for (const tagId of body.tagIds) {
        const canUseTag = tagBelongsToUserStatement.get(tagId, userId) as
          | Record<string, unknown>
          | undefined;
        if (!canUseTag) continue;
        insertWordTagStatement.run(wordId, tagId);
      }
    }

    const createdWordRow = database
      .prepare(
        "SELECT id, french, romaji, kana, kanji, note, examples, created_at FROM words WHERE id = ? AND user_id = ?",
      )
      .get(wordId, userId) as (Record<string, unknown> & { examples: string | null }) | undefined;
    const createdWord = createdWordRow
      ? { ...createdWordRow, examples: parseExamples(createdWordRow.examples) }
      : createdWordRow;

    // Télécharger automatiquement les SVG des kanji (de manière asynchrone, sans bloquer)
    downloadKanjiSvgsFromText(body.kanji).catch((error) => {
      console.error("Error downloading kanji SVGs for new word:", error);
    });

    res.status(201).json({ word: createdWord });
  });

  app.put("/api/words/:id", (req, res) => {
    const userId = getRequiredUserId(req);
    const wordId = Number(req.params.id);
    if (!Number.isFinite(wordId)) {
      res.status(400).json({ error: "Invalid word id" });
      return;
    }

    const bodySchema = z.object({
      french: z.string().min(1),
      romaji: z.string().optional().nullable(),
      kana: z.string().optional().nullable(),
      kanji: z.string().optional().nullable(),
      note: z.string().optional().nullable(),
      examples: z
        .array(
          z.object({
            jp: z.string().optional(),
            kana: z.string().optional(),
            fr: z.string().optional(),
          }),
        )
        .max(3)
        .optional(),
      tagIds: z.array(z.number().int().positive()).optional(),
    });
    const body = bodySchema.parse(req.body);

    // Récupérer l'ancien kanji pour comparer
    const oldWord = database
      .prepare("SELECT kanji FROM words WHERE id = ? AND user_id = ?")
      .get(wordId, userId) as { kanji: string | null } | undefined;

    const updateResult = database
      .prepare(
        "UPDATE words SET french = ?, romaji = ?, kana = ?, kanji = ?, note = ?, examples = ? WHERE id = ? AND user_id = ?",
      )
      .run(
        body.french,
        body.romaji ?? null,
        body.kana ?? null,
        body.kanji ?? null,
        body.note ?? null,
        serializeExamples(body.examples),
        wordId,
        userId,
      );
    if (updateResult.changes === 0) {
      res.status(404).json({ error: "Word not found" });
      return;
    }

    // Télécharger automatiquement les SVG des kanji si le kanji a changé (de manière asynchrone, sans bloquer)
    if (body.kanji !== oldWord?.kanji) {
      downloadKanjiSvgsFromText(body.kanji).catch((error) => {
        console.error("Error downloading kanji SVGs for updated word:", error);
      });
    }

    const updatedWordRow = database
      .prepare(
        "SELECT id, french, romaji, kana, kanji, note, examples, created_at FROM words WHERE id = ? AND user_id = ?",
      )
      .get(wordId, userId) as (Record<string, unknown> & { examples: string | null }) | undefined;
    const updatedWord = updatedWordRow
      ? { ...updatedWordRow, examples: parseExamples(updatedWordRow.examples) }
      : updatedWordRow;

    if (body.tagIds) {
      database.prepare("DELETE FROM word_tags WHERE word_id = ?").run(wordId);
      const insertWordTagStatement = database.prepare(
        "INSERT OR IGNORE INTO word_tags (word_id, tag_id) VALUES (?, ?)",
      );
      const tagBelongsToUserStatement = database.prepare(
        "SELECT 1 FROM tags WHERE id = ? AND user_id = ?",
      );
      for (const tagId of body.tagIds) {
        const canUseTag = tagBelongsToUserStatement.get(tagId, userId) as
          | Record<string, unknown>
          | undefined;
        if (!canUseTag) continue;
        insertWordTagStatement.run(wordId, tagId);
      }
    }

    res.json({ word: updatedWord });
  });

  app.delete("/api/words/:id", (req, res) => {
    const userId = getRequiredUserId(req);
    const wordId = Number(req.params.id);
    if (!Number.isFinite(wordId)) {
      res.status(400).json({ error: "Invalid word id" });
      return;
    }

    const deleteResult = database
      .prepare("DELETE FROM words WHERE id = ? AND user_id = ?")
      .run(wordId, userId);
    if (deleteResult.changes === 0) {
      res.status(404).json({ error: "Word not found" });
      return;
    }
    res.status(204).send();
  });

  app.post("/api/words/reset-scores", (req, res) => {
    const userId = getRequiredUserId(req);
    const transaction = database.transaction(() => {
      database
        .prepare(
          `
        UPDATE word_stats
        SET success_count = 0,
            partial_count = 0,
            fail_count = 0,
            score = 0,
            consecutive_success_count = 0
        WHERE word_id IN (SELECT id FROM words WHERE user_id = ?)
      `,
        )
        .run(userId);
    });
    transaction();
    res.status(200).json({ success: true });
  });

  app.post("/api/reviews", (req, res) => {
    const userId = getRequiredUserId(req);
    const bodySchema = z.object({
      wordId: z.number().int().positive(),
      result: z.enum(["success", "partial", "fail"]),
    });
    const body = bodySchema.parse(req.body);

    const wordRow = database
      .prepare("SELECT id FROM words WHERE id = ? AND user_id = ?")
      .get(body.wordId, userId) as { id: number } | undefined;
    if (!wordRow) {
      res.status(404).json({ error: "Word not found" });
      return;
    }

    database.prepare("INSERT OR IGNORE INTO word_stats (word_id) VALUES (?)").run(body.wordId);

    const existingStats = database
      .prepare(
        "SELECT word_id, success_count, partial_count, fail_count, score, last_reviewed_at, COALESCE(consecutive_success_count, 0) AS consecutive_success_count, COALESCE(srs_interval, 0) AS srs_interval, COALESCE(srs_ease_factor, 2.5) AS srs_ease_factor, srs_next_review_at, COALESCE(srs_step, 0) AS srs_step FROM word_stats WHERE word_id = ?",
      )
      .get(body.wordId) as WordStatsRow | undefined;

    if (!existingStats) {
      res.status(404).json({ error: "Stats not found" });
      return;
    }

    const updatedStats = applyReviewToStats(existingStats, body.result as ReviewResult);
    database
      .prepare(
        `UPDATE word_stats
         SET success_count = ?, partial_count = ?, fail_count = ?, score = ?, last_reviewed_at = ?,
             consecutive_success_count = ?, srs_interval = ?, srs_ease_factor = ?, srs_next_review_at = ?, srs_step = ?
         WHERE word_id = ?`,
      )
      .run(
        updatedStats.success_count,
        updatedStats.partial_count,
        updatedStats.fail_count,
        updatedStats.score,
        updatedStats.last_reviewed_at,
        updatedStats.consecutive_success_count,
        updatedStats.srs_interval,
        updatedStats.srs_ease_factor,
        updatedStats.srs_next_review_at,
        updatedStats.srs_step,
        updatedStats.word_id,
      );

    trackDailyActivity(database, userId, 1);

    const newBadges = checkAndAwardBadges(database, userId);
    res.json({ stats: updatedStats, newBadges });
  });

  app.post("/api/reviews/bulk", (req, res) => {
    let userId: number;
    try {
      userId = getRequiredUserId(req);
    } catch {
      res.status(401).json({ error: "Session expirée. Reconnectez-vous." });
      return;
    }

    const bodySchema = z.object({
      reviews: z.array(
        z.object({
          wordId: z.number().int().positive(),
          result: z.enum(["success", "partial", "fail"]),
        }),
      ),
    });

    let body: z.infer<typeof bodySchema>;
    try {
      body = bodySchema.parse(req.body);
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : "Invalid payload";
      res.status(400).json({ error: `Données invalides : ${message}` });
      return;
    }

    if (body.reviews.length === 0) {
      res.status(201).json({ appliedCount: 0 });
      return;
    }

    const wordBelongsToUserStatement = database.prepare(
      "SELECT 1 FROM words WHERE id = ? AND user_id = ?",
    );
    const selectStatsStatement = database.prepare(
      "SELECT word_id, COALESCE(success_count, 0) AS success_count, COALESCE(partial_count, 0) AS partial_count, COALESCE(fail_count, 0) AS fail_count, COALESCE(score, 0) AS score, last_reviewed_at, COALESCE(consecutive_success_count, 0) AS consecutive_success_count, COALESCE(srs_interval, 0) AS srs_interval, COALESCE(srs_ease_factor, 2.5) AS srs_ease_factor, srs_next_review_at, COALESCE(srs_step, 0) AS srs_step FROM word_stats WHERE word_id = ?",
    );
    const upsertStatsStatement = database.prepare(
      "INSERT OR IGNORE INTO word_stats (word_id) VALUES (?)",
    );
    const updateStatsStatement = database.prepare(
      `UPDATE word_stats
       SET success_count = ?, partial_count = ?, fail_count = ?, score = ?, last_reviewed_at = ?,
           consecutive_success_count = ?, srs_interval = ?, srs_ease_factor = ?, srs_next_review_at = ?, srs_step = ?
       WHERE word_id = ?`,
    );

    let appliedCount = 0;
    const nowIso = new Date().toISOString();

    const transaction = database.transaction(() => {
      for (const review of body.reviews) {
        const canReviewWord = wordBelongsToUserStatement.get(review.wordId, userId) as
          | Record<string, unknown>
          | undefined;
        if (!canReviewWord) continue;
        upsertStatsStatement.run(review.wordId);
        const existingStats = selectStatsStatement.get(review.wordId) as WordStatsRow | undefined;
        if (!existingStats) continue;
        const updatedStats = applyReviewToStats(
          { ...existingStats, last_reviewed_at: existingStats.last_reviewed_at ?? nowIso },
          review.result as ReviewResult,
        );

        updateStatsStatement.run(
          updatedStats.success_count,
          updatedStats.partial_count,
          updatedStats.fail_count,
          updatedStats.score,
          updatedStats.last_reviewed_at,
          updatedStats.consecutive_success_count,
          updatedStats.srs_interval,
          updatedStats.srs_ease_factor,
          updatedStats.srs_next_review_at,
          updatedStats.srs_step,
          updatedStats.word_id,
        );
        appliedCount += 1;
      }
    });

    try {
      transaction();
      trackDailyActivity(database, userId, appliedCount);
    } catch (transactionError) {
      const message =
        transactionError instanceof Error ? transactionError.message : String(transactionError);
      console.error(
        "[kotoba/api] Bulk reviews transaction failed (userId=%d, count=%d): %s",
        userId,
        body.reviews.length,
        message,
      );
      res.status(500).json({
        error: "Erreur lors de l'enregistrement des révisions. Réessayez dans un instant.",
        detail: message,
      });
      return;
    }

    const newBadges = checkAndAwardBadges(database, userId);
    res.status(201).json({ appliedCount, newBadges });
  });

  app.get("/api/series", (_req, res) => {
    const userId = getRequiredUserId(_req);
    type SeriesRow = {
      tag_id: number;
      tag_name: string;
      words_count: number;
      total_score: number;
      last_reviewed_at: string | null;
    };

    const seriesRows = database
      .prepare(
        `
        SELECT
          t.id AS tag_id,
          t.name AS tag_name,
          COUNT(DISTINCT w.id) AS words_count,
          COALESCE(SUM(s.score), 0) AS total_score,
          MAX(s.last_reviewed_at) AS last_reviewed_at
        FROM tags t
        LEFT JOIN word_tags wt ON wt.tag_id = t.id
        LEFT JOIN words w ON w.id = wt.word_id AND w.user_id = ?
        LEFT JOIN word_stats s ON s.word_id = w.id
        WHERE t.user_id = ?
        GROUP BY t.id
        HAVING COUNT(DISTINCT w.id) > 0
        ORDER BY last_reviewed_at DESC NULLS LAST, t.name ASC
      `,
      )
      .all(userId, userId) as SeriesRow[];

    res.json({
      series: seriesRows.map((row) => ({
        tagId: row.tag_id,
        tagName: row.tag_name,
        wordsCount: row.words_count,
        totalScore: row.total_score,
        lastReviewedAt: row.last_reviewed_at,
      })),
    });
  });

  app.get("/api/series/:tagId/words", (req, res) => {
    const userId = getRequiredUserId(req);
    const tagId = Number(req.params.tagId);
    if (!Number.isFinite(tagId)) {
      res.status(400).json({ error: "Invalid tag id" });
      return;
    }

    const rows = database
      .prepare(
        `
        SELECT
          w.id,
          w.french,
          w.romaji,
          w.kana,
          w.kanji,
          w.note,
          w.examples,
          w.created_at,
          COALESCE(s.success_count, 0) AS success_count,
          COALESCE(s.partial_count, 0) AS partial_count,
          COALESCE(s.fail_count, 0) AS fail_count,
          COALESCE(s.score, 0) AS score,
          s.last_reviewed_at AS last_reviewed_at
        FROM words w
        INNER JOIN word_tags wt ON wt.word_id = w.id
        INNER JOIN tags t ON t.id = wt.tag_id
        LEFT JOIN word_stats s ON s.word_id = w.id
        WHERE wt.tag_id = ? AND w.user_id = ? AND t.user_id = ?
        ORDER BY w.id DESC
      `,
      )
      .all(tagId, userId, userId) as Array<Record<string, unknown> & { examples: string | null }>;

    const words = rows.map((row) => ({ ...row, examples: parseExamples(row.examples) }));
    res.json({ words });
  });

  app.get("/api/words/difficult", (req, res) => {
    const userId = getRequiredUserId(req);
    const scoreThreshold = Number(req.query.scoreThreshold ?? -5);
    const failRateThreshold = Number(req.query.failRateThreshold ?? 0.4);
    const minAttempts = Number(req.query.minAttempts ?? 5);

    const rows = database
      .prepare(
        `
        SELECT
          w.id,
          w.french,
          w.romaji,
          w.kana,
          w.kanji,
          w.note,
          w.examples,
          w.created_at,
          COALESCE(s.success_count, 0) AS success_count,
          COALESCE(s.partial_count, 0) AS partial_count,
          COALESCE(s.fail_count, 0) AS fail_count,
          COALESCE(s.score, 0) AS score,
          s.last_reviewed_at AS last_reviewed_at
        FROM words w
        LEFT JOIN word_stats s ON s.word_id = w.id
        WHERE
          w.user_id = ?
          AND (
            COALESCE(s.score, 0) <= ?
          OR (
            (COALESCE(s.success_count, 0) + COALESCE(s.partial_count, 0) + COALESCE(s.fail_count, 0)) >= ?
            AND (
              (CAST(COALESCE(s.fail_count, 0) AS REAL) / NULLIF((COALESCE(s.success_count, 0) + COALESCE(s.partial_count, 0) + COALESCE(s.fail_count, 0)), 0))
            ) > ?
          )
          )
        ORDER BY COALESCE(s.score, 0) ASC, w.id DESC
      `,
      )
      .all(userId, scoreThreshold, minAttempts, failRateThreshold) as Array<
      Record<string, unknown> & { examples: string | null }
    >;

    const words = rows.map((row) => ({ ...row, examples: parseExamples(row.examples) }));
    res.json({ words, params: { scoreThreshold, failRateThreshold, minAttempts } });
  });

  const srsWordSelect = `
    SELECT
      w.id,
      w.french,
      w.romaji,
      w.kana,
      w.kanji,
      w.note,
      w.examples,
      w.created_at,
      COALESCE(s.success_count, 0) AS success_count,
      COALESCE(s.partial_count, 0) AS partial_count,
      COALESCE(s.fail_count, 0) AS fail_count,
      COALESCE(s.score, 0) AS score,
      s.last_reviewed_at AS last_reviewed_at,
      COALESCE(s.consecutive_success_count, 0) AS consecutive_success_count
    FROM words w
    LEFT JOIN word_stats s ON s.word_id = w.id
  `;

  app.get("/api/srs/words", (req, res) => {
    const userId = getRequiredUserId(req);

    const masteredRows = database
      .prepare(
        `
        ${srsWordSelect}
        WHERE w.user_id = ?
        AND COALESCE(s.consecutive_success_count, 0) >= 10
        ORDER BY COALESCE(s.score, 0) DESC, w.id DESC
      `,
      )
      .all(userId);

    const masteredWordIds = new Set((masteredRows as Array<{ id: number }>).map((row) => row.id));

    /* success_rate = success_count / total_attempts
       Hard: success_rate < 0.65  (below 65% success)
       Medium: success_rate >= 0.65 AND < 0.80
       Easy: success_rate >= 0.80
       Mastered: 10 consecutive successes (handled above) */

    const hardRows = database
      .prepare(
        `
        ${srsWordSelect}
        WHERE w.user_id = ?
        AND (COALESCE(s.success_count, 0) + COALESCE(s.partial_count, 0) + COALESCE(s.fail_count, 0)) > 0
        AND (
          CAST(COALESCE(s.success_count, 0) AS REAL)
          / NULLIF((COALESCE(s.success_count, 0) + COALESCE(s.partial_count, 0) + COALESCE(s.fail_count, 0)), 0)
        ) < 0.65
        AND COALESCE(s.consecutive_success_count, 0) < 10
        ORDER BY COALESCE(s.score, 0) ASC, w.id DESC
      `,
      )
      .all(userId);

    const easyRows = database
      .prepare(
        `
        ${srsWordSelect}
        WHERE w.user_id = ?
        AND (COALESCE(s.success_count, 0) + COALESCE(s.partial_count, 0) + COALESCE(s.fail_count, 0)) > 0
        AND (
          CAST(COALESCE(s.success_count, 0) AS REAL)
          / NULLIF((COALESCE(s.success_count, 0) + COALESCE(s.partial_count, 0) + COALESCE(s.fail_count, 0)), 0)
        ) >= 0.80
        AND COALESCE(s.consecutive_success_count, 0) < 10
        ORDER BY COALESCE(s.score, 0) DESC, w.id DESC
      `,
      )
      .all(userId);

    const mediumRows = database
      .prepare(
        `
        ${srsWordSelect}
        WHERE w.user_id = ?
        AND (COALESCE(s.success_count, 0) + COALESCE(s.partial_count, 0) + COALESCE(s.fail_count, 0)) > 0
        AND (
          CAST(COALESCE(s.success_count, 0) AS REAL)
          / NULLIF((COALESCE(s.success_count, 0) + COALESCE(s.partial_count, 0) + COALESCE(s.fail_count, 0)), 0)
        ) >= 0.65
        AND (
          CAST(COALESCE(s.success_count, 0) AS REAL)
          / NULLIF((COALESCE(s.success_count, 0) + COALESCE(s.partial_count, 0) + COALESCE(s.fail_count, 0)), 0)
        ) < 0.80
        AND COALESCE(s.consecutive_success_count, 0) < 10
        ORDER BY COALESCE(s.score, 0) ASC, w.id DESC
      `,
      )
      .all(userId);

    const hardRowsFiltered = (hardRows as Array<{ id: number }>).filter(
      (row) => !masteredWordIds.has(row.id),
    );

    const mapExamples = (rows: unknown[]) =>
      (rows as Array<Record<string, unknown> & { examples: string | null }>).map((row) => ({
        ...row,
        examples: parseExamples(row.examples),
      }));

    res.json({
      hard: mapExamples(hardRowsFiltered),
      medium: mapExamples(mediumRows as unknown[]),
      easy: mapExamples(easyRows as unknown[]),
      mastered: mapExamples(masteredRows as unknown[]),
    });
  });

  app.get("/api/srs/due", (req, res) => {
    const userId = getRequiredUserId(req);
    const nowIso = new Date().toISOString();

    const dueWords = database
      .prepare(
        `${srsWordSelect}
           WHERE w.user_id = ?
             AND s.srs_next_review_at IS NOT NULL
             AND s.srs_next_review_at <= ?
           ORDER BY s.srs_next_review_at ASC
           LIMIT 100`,
      )
      .all(userId, nowIso);

    const newWords = database
      .prepare(
        `${srsWordSelect}
           WHERE w.user_id = ?
             AND (s.word_id IS NULL OR (COALESCE(s.srs_step, 0) = 0 AND s.srs_next_review_at IS NULL))
           ORDER BY w.id ASC
           LIMIT 20`,
      )
      .all(userId);

    const allDueWords = [...dueWords, ...newWords].map((row) => {
      const wordRow = row as Record<string, unknown> & { examples: string | null };
      return { ...wordRow, examples: parseExamples(wordRow.examples) };
    });
    res.json({ words: allDueWords, dueCount: allDueWords.length });
  });

  app.get("/api/srs/summary", (req, res) => {
    const userId = getRequiredUserId(req);
    const nowIso = new Date().toISOString();

    const dueRow = database
      .prepare(
        `SELECT COUNT(*) AS count FROM words w
           LEFT JOIN word_stats s ON s.word_id = w.id
           WHERE w.user_id = ?
             AND s.srs_next_review_at IS NOT NULL
             AND s.srs_next_review_at <= ?`,
      )
      .get(userId, nowIso) as { count: number };

    const newRow = database
      .prepare(
        `SELECT COUNT(*) AS count FROM words w
           LEFT JOIN word_stats s ON s.word_id = w.id
           WHERE w.user_id = ?
             AND (s.word_id IS NULL OR (COALESCE(s.srs_step, 0) = 0 AND s.srs_next_review_at IS NULL))`,
      )
      .get(userId) as { count: number };

    const learningRow = database
      .prepare(
        `SELECT COUNT(*) AS count FROM words w
           INNER JOIN word_stats s ON s.word_id = w.id
           WHERE w.user_id = ? AND s.srs_step >= 1 AND s.srs_step < 3 AND COALESCE(s.consecutive_success_count, 0) < 10`,
      )
      .get(userId) as { count: number };

    const graduatedRow = database
      .prepare(
        `SELECT COUNT(*) AS count FROM words w
           INNER JOIN word_stats s ON s.word_id = w.id
           WHERE w.user_id = ? AND s.srs_step >= 3 AND COALESCE(s.consecutive_success_count, 0) < 10`,
      )
      .get(userId) as { count: number };

    const masteredRow = database
      .prepare(
        `SELECT COUNT(*) AS count FROM words w
           INNER JOIN word_stats s ON s.word_id = w.id
           WHERE w.user_id = ? AND COALESCE(s.consecutive_success_count, 0) >= 10`,
      )
      .get(userId) as { count: number };

    res.json({
      dueCount: dueRow.count + newRow.count,
      newCount: newRow.count,
      learningCount: learningRow.count,
      graduatedCount: graduatedRow.count,
      masteredCount: masteredRow.count,
    });
  });

  app.get("/api/stats/streak", (req, res) => {
    const userId = getRequiredUserId(req);
    const today = new Date().toISOString().slice(0, 10);

    const userRow = database
      .prepare("SELECT COALESCE(daily_goal, 20) AS daily_goal FROM users WHERE id = ?")
      .get(userId) as { daily_goal: number } | undefined;
    const dailyGoal = userRow?.daily_goal ?? 20;

    const todayRow = database
      .prepare("SELECT reviews_count FROM daily_activity WHERE user_id = ? AND activity_date = ?")
      .get(userId, today) as { reviews_count: number } | undefined;
    const todayReviews = todayRow?.reviews_count ?? 0;

    const activityRows = database
      .prepare(
        "SELECT activity_date, reviews_count FROM daily_activity WHERE user_id = ? ORDER BY activity_date DESC LIMIT 365",
      )
      .all(userId) as { activity_date: string; reviews_count: number }[];

    let currentStreak = 0;
    const checkDate = new Date();
    if (todayReviews < dailyGoal) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    const activityByDate = new Map(
      activityRows.map((row) => [row.activity_date, row.reviews_count]),
    );

    for (let i = 0; i < 365; i++) {
      const dateStr = checkDate.toISOString().slice(0, 10);
      const reviews = activityByDate.get(dateStr) ?? 0;
      if (reviews >= dailyGoal) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    if (todayReviews >= dailyGoal) {
      currentStreak = Math.max(currentStreak, 1);
    }

    res.json({ currentStreak, todayReviews, dailyGoal });
  });

  app.put("/api/settings/daily-goal", (req, res) => {
    const userId = getRequiredUserId(req);
    const bodySchema = z.object({ dailyGoal: z.number().int().min(1).max(200) });
    const body = bodySchema.parse(req.body);
    database.prepare("UPDATE users SET daily_goal = ? WHERE id = ?").run(body.dailyGoal, userId);
    res.json({ dailyGoal: body.dailyGoal });
  });

  app.get("/api/stats/overview", (req, res) => {
    const userId = getRequiredUserId(req);

    const totalRow = database
      .prepare("SELECT COUNT(*) AS count FROM words WHERE user_id = ?")
      .get(userId) as { count: number };

    const masteredRow = database
      .prepare(
        `SELECT COUNT(*) AS count FROM words w
           INNER JOIN word_stats s ON s.word_id = w.id
           WHERE w.user_id = ? AND COALESCE(s.consecutive_success_count, 0) >= 10`,
      )
      .get(userId) as { count: number };

    const reviewedRow = database
      .prepare(
        `SELECT
            COALESCE(SUM(s.success_count + s.partial_count + s.fail_count), 0) AS total_reviews,
            CASE WHEN COUNT(CASE WHEN (s.success_count + s.partial_count + s.fail_count) > 0 THEN 1 END) > 0
              THEN ROUND(CAST(SUM(s.success_count) AS REAL) / SUM(s.success_count + s.partial_count + s.fail_count) * 100, 1)
              ELSE 0
            END AS avg_success_rate
          FROM words w
          INNER JOIN word_stats s ON s.word_id = w.id
          WHERE w.user_id = ?`,
      )
      .get(userId) as { total_reviews: number; avg_success_rate: number };

    const activeSinceRow = database
      .prepare("SELECT MIN(activity_date) AS first_date FROM daily_activity WHERE user_id = ?")
      .get(userId) as { first_date: string | null };

    res.json({
      totalWords: totalRow.count,
      masteredCount: masteredRow.count,
      totalReviews: reviewedRow.total_reviews,
      avgSuccessRate: reviewedRow.avg_success_rate,
      activeSince: activeSinceRow.first_date,
    });
  });

  app.get("/api/stats/activity", (req, res) => {
    const userId = getRequiredUserId(req);
    const rows = database
      .prepare(
        "SELECT activity_date, reviews_count FROM daily_activity WHERE user_id = ? ORDER BY activity_date DESC LIMIT 365",
      )
      .all(userId) as { activity_date: string; reviews_count: number }[];
    res.json({ activity: rows });
  });

  app.get("/api/export", (_req, res) => {
    const userId = getRequiredUserId(_req);
    const tags = database
      .prepare("SELECT id, name, created_at FROM tags WHERE user_id = ? ORDER BY name ASC")
      .all(userId);
    type ExportWordRow = {
      id: number;
      french: string;
      romaji: string | null;
      kana: string | null;
      kanji: string | null;
      note: string | null;
      examples: string | null;
      created_at: string;
      success_count: number;
      partial_count: number;
      fail_count: number;
      score: number;
      last_reviewed_at: string | null;
      tag_names_concat: string | null;
    };

    const wordRows = database
      .prepare(
        `
        SELECT
          w.id,
          w.french,
          w.romaji,
          w.kana,
          w.kanji,
          w.note,
          w.examples,
          w.created_at,
          COALESCE(s.success_count, 0) AS success_count,
          COALESCE(s.partial_count, 0) AS partial_count,
          COALESCE(s.fail_count, 0) AS fail_count,
          COALESCE(s.score, 0) AS score,
          s.last_reviewed_at AS last_reviewed_at,
          GROUP_CONCAT(t.name, '||') AS tag_names_concat
        FROM words w
        LEFT JOIN word_stats s ON s.word_id = w.id
        LEFT JOIN word_tags wt ON wt.word_id = w.id
        LEFT JOIN tags t ON t.id = wt.tag_id AND t.user_id = ?
        WHERE w.user_id = ?
        GROUP BY w.id
        ORDER BY w.id ASC
      `,
      )
      .all(userId, userId) as ExportWordRow[];

    const words = wordRows.map((row) => {
      const tagNames = parseTagNamesConcat(row.tag_names_concat);
      const { tag_names_concat, ...restRow } = row;
      return { ...restRow, examples: parseExamples(restRow.examples), tags: tagNames };
    });

    res.json({ version: 1, exportedAt: new Date().toISOString(), tags, words });
  });

  app.post("/api/import", (req, res) => {
    const userId = getRequiredUserId(req);
    const bodySchema = z.object({
      words: z.array(
        z.object({
          french: z.string().min(1),
          romaji: z.string().optional().nullable(),
          kana: z.string().optional().nullable(),
          kanji: z.string().optional().nullable(),
          note: z.string().optional().nullable(),
          examples: z
            .array(
              z.object({
                jp: z.string().optional(),
                kana: z.string().optional(),
                fr: z.string().optional(),
              }),
            )
            .optional(),
          tags: z.array(z.string()).optional(),
        }),
      ),
    });
    const body = bodySchema.parse(req.body);

    const createTagStatement = database.prepare(
      "INSERT OR IGNORE INTO tags (user_id, name) VALUES (?, ?)",
    );
    const selectTagIdByNameStatement = database.prepare(
      "SELECT id FROM tags WHERE user_id = ? AND name = ?",
    );
    const insertWordStatement = database.prepare(
      "INSERT INTO words (user_id, french, romaji, kana, kanji, note, examples) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    const insertWordStatsStatement = database.prepare(
      "INSERT OR IGNORE INTO word_stats (word_id) VALUES (?)",
    );
    const insertWordTagStatement = database.prepare(
      "INSERT OR IGNORE INTO word_tags (word_id, tag_id) VALUES (?, ?)",
    );

    let importedWordsCount = 0;
    let importedTagsCount = 0;

    const transaction = database.transaction(() => {
      for (const word of body.words) {
        const insertResult = insertWordStatement.run(
          userId,
          word.french.trim(),
          word.romaji ?? null,
          word.kana ?? null,
          word.kanji ?? null,
          word.note ?? null,
          serializeExamples(word.examples),
        );

        const insertedWordId = Number(insertResult.lastInsertRowid);
        insertWordStatsStatement.run(insertedWordId);
        importedWordsCount += 1;

        const tagNames = (word.tags ?? []).map((tagName) => tagName.trim()).filter(Boolean);
        for (const tagName of tagNames) {
          const createTagResult = createTagStatement.run(userId, tagName);
          if (createTagResult.changes > 0) {
            importedTagsCount += 1;
          }
          const tagRow = selectTagIdByNameStatement.get(userId, tagName) as
            | { id: number }
            | undefined;
          if (tagRow) {
            insertWordTagStatement.run(insertedWordId, tagRow.id);
          }
        }
      }
    });

    transaction();

    res.status(201).json({ importedWordsCount, importedTagsCount });
  });

  app.post(
    "/api/kanji/download-missing",
    wrapAsync(async (_req, res) => {
      const userId = getRequiredUserId(_req);

      // Vérifier que l'utilisateur est authentifié (déjà fait par getRequiredUserId)
      // Télécharger les kanji manquants
      const result = await downloadMissingKanjiSvgs(database);

      res.json({
        success: true,
        total: result.total,
        downloaded: result.downloaded,
        failed: result.failed,
        missingCount: result.missing.length,
      });
    }),
  );

  app.get(
    "/api/admin/users",
    wrapAsync(async (req, res) => {
      requireAdmin(req);
      const users = database
        .prepare(
          "SELECT id, username, email, display_name, COALESCE(is_admin, 0) as is_admin, created_at FROM users ORDER BY id ASC",
        )
        .all() as PublicUser[];
      res.json({ users });
    }),
  );

  app.delete(
    "/api/admin/users/:id",
    wrapAsync(async (req, res) => {
      requireAdmin(req);
      const targetUserId = Number(req.params.id);
      if (!Number.isFinite(targetUserId)) {
        res.status(400).json({ error: "Invalid user id" });
        return;
      }

      const currentUserId = getRequiredUserId(req);
      if (targetUserId === currentUserId) {
        res.status(400).json({ error: "Cannot delete your own account" });
        return;
      }

      const deleteResult = database.prepare("DELETE FROM users WHERE id = ?").run(targetUserId);
      if (deleteResult.changes === 0) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      res.status(204).send();
    }),
  );

  // --- Phrases AI endpoints ---

  app.get("/api/phrases/quota", (_req, res) => {
    getRequiredUserId(_req);
    const quota = getGeminiQuota(database);
    res.json(quota);
  });

  app.post(
    "/api/phrases/generate",
    wrapAsync(async (req, res) => {
      const userId = getRequiredUserId(req);

      if (!isGeminiConfigured()) {
        res
          .status(503)
          .json({ error: "Le service IA n'est pas configuré (clé API Gemini manquante)." });
        return;
      }

      const bodySchema = z.object({
        tagIds: z.array(z.number().int().positive()).min(1),
        particles: z.array(z.string()).min(1),
        tense: z.enum(["present", "past", "te-form"]),
        polarity: z.enum(["affirmative", "negative"]),
        politeness: z.enum(["casual", "polite"]),
        count: z.number().int().min(1).max(10),
        customContext: z.string().max(500).optional(),
        direction: z.enum(["fr-to-jp", "jp-to-fr"]).optional().default("fr-to-jp"),
        contentType: z.enum(["phrases", "paragraph"]).optional().default("phrases"),
        withKanji: z.boolean().optional().default(true),
        sentenceLength: z.enum(["short", "medium", "long"]).optional().default("medium"),
        vocabSampleSize: z.number().int().min(10).max(500).optional().default(80),
      });
      const body = bodySchema.parse(req.body);

      type VocabRow = { id: number; french: string; kana: string | null; kanji: string | null };
      const placeholders = body.tagIds.map(() => "?").join(",");
      const vocabularyRows = database
        .prepare(
          `
          SELECT DISTINCT w.id, w.french, w.kana, w.kanji
          FROM words w
          INNER JOIN word_tags wt ON wt.word_id = w.id
          WHERE wt.tag_id IN (${placeholders})
            AND w.user_id = ?
          ORDER BY RANDOM()
          LIMIT ?
          `,
        )
        .all(...body.tagIds, userId, body.vocabSampleSize) as VocabRow[];

      if (vocabularyRows.length === 0) {
        res.status(400).json({ error: "Aucun mot trouvé pour les tags sélectionnés." });
        return;
      }

      const vocabularyPool = vocabularyRows.map((row) => ({
        id: row.id,
        fr: row.french,
        jp: row.kanji ?? row.kana ?? "",
        kana: row.kana ?? "",
      }));

      const tenseLabels: Record<string, string> = {
        present: "Présent",
        past: "Passé",
        "te-form": "Forme en -te",
      };
      const polarityLabels: Record<string, string> = {
        affirmative: "Affirmatif",
        negative: "Négatif",
      };
      const politenessLabels: Record<string, string> = {
        casual: "Courant/Neutre (forme courte)",
        polite: "Poli/Desu-Masu",
      };

      const isParagraph = body.contentType === "paragraph";
      const sentenceLengthWordsLabels: Record<string, string> = {
        short: "5-7 mots",
        medium: "8-12 mots",
        long: "13-20 mots avec des subordonnées",
      };

      const contentInstruction = isParagraph
        ? `génère UNE mini-histoire cohérente de exactement ${body.count} phrases.`
        : `génère exactement ${body.count} phrases uniques et indépendantes.`;

      const lengthInstruction = isParagraph
        ? `- Chaque phrase de l'histoire doit faire environ ${sentenceLengthWordsLabels[body.sentenceLength]}.`
        : `- Chaque phrase doit faire environ ${sentenceLengthWordsLabels[body.sentenceLength]}.`;

      const storyInstruction = isParagraph
        ? `\n- Mode histoire : les phrases doivent former une mini-histoire cohérente avec un début, un milieu et une fin.\n- Les mêmes personnages, objets et lieux doivent être réutilisés à travers l'histoire.\n- Utilise des connecteurs logiques (それから、でも、だから、そして、しかし、次に、最後に) pour lier les phrases.\n- L'histoire doit avoir du sens et ne pas être une simple juxtaposition de phrases isolées.`
        : "";

      const kanjiInstruction =
        isParagraph && !body.withKanji
          ? "\n- IMPORTANT : Le champ jp_kanji doit être écrit ENTIÈREMENT en hiragana/katakana (PAS de kanji). Ajoute un espace après chaque particule (は、が、を、に、で、へ、と、も、から、まで) pour simuler les séparations de mots."
          : "";

      const directionInstruction =
        body.direction === "jp-to-fr"
          ? "\n- L'exercice est en direction Japonais → Français : l'élève verra la phrase japonaise et devra traduire en français."
          : "";

      const outputUnit = isParagraph ? "phrase de l'histoire" : "phrase";

      const prompt = `Tu es un professeur de japonais. En utilisant UNIQUEMENT le vocabulaire fourni ci-dessous (et des verbes de base courants si nécessaire comme ある、いる、する、行く、食べる、見る、飲む), ${contentInstruction}

Vocabulaire disponible (utilise au maximum ces mots) :
${JSON.stringify(
  vocabularyPool.map((v) => ({ fr: v.fr, jp: v.jp, kana: v.kana })),
  null,
  2,
)}

Contraintes strictes :
- Particules autorisées : UNIQUEMENT ${body.particles.join(", ")}. Tu ne dois utiliser AUCUNE autre particule que celles listées ici.
- Temps : ${tenseLabels[body.tense] ?? body.tense}
- Polarité : ${polarityLabels[body.polarity] ?? body.polarity}
- Style de politesse : ${politenessLabels[body.politeness] ?? body.politeness}
${lengthInstruction}
- Utilise un japonais naturel, pas de phrases de manuels scolaires rigides.
- Chaque phrase doit utiliser au moins un mot du vocabulaire fourni.
- Chaque phrase doit utiliser au moins une des particules autorisées.
- L'élève apprend les kanji, donc écrire en kana est acceptable.${storyInstruction}${kanjiInstruction}${directionInstruction}
${body.customContext ? `\nContexte additionnel de l'élève : ${body.customContext}\n` : ""}
Réponds UNIQUEMENT au format JSON, un tableau d'objets (un objet par ${outputUnit}) avec cette structure exacte :
[{"fr": "La phrase en français", "jp_kanji": "La phrase en japonais avec kanji", "jp_kana": "La phrase en japonais tout en hiragana/katakana", "explanation": "Brève explication grammaticale", "used_words_fr": ["mot1_fr", "mot2_fr"]}]

${isParagraph ? `Le tableau doit contenir exactement ${body.count} objets représentant chacun une phrase de la mini-histoire, dans l'ordre narratif.` : ""}
Le champ used_words_fr doit contenir les mots français du vocabulaire fourni qui ont été utilisés.`;

      const geminiPhraseSchema = z.object({
        fr: z.string(),
        jp_kanji: z.string(),
        jp_kana: z.string(),
        explanation: z.string(),
        used_words_fr: z.array(z.string()).optional(),
      });
      type GeminiPhrase = z.infer<typeof geminiPhraseSchema>;

      const phraseOptions: GeminiJsonOptions<GeminiPhrase[]> = {
        responseSchema: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              fr: { type: SchemaType.STRING },
              jp_kanji: { type: SchemaType.STRING },
              jp_kana: { type: SchemaType.STRING },
              explanation: { type: SchemaType.STRING },
              used_words_fr: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
            },
            required: ["fr", "jp_kanji", "jp_kana", "explanation"],
          },
        },
        zodSchema: z.array(geminiPhraseSchema),
      };

      let generatedPhrases: GeminiPhrase[];
      try {
        generatedPhrases = await callGeminiJson<GeminiPhrase[]>(prompt, phraseOptions);
        incrementGeminiUsage(database);
      } catch (error) {
        if (error instanceof GeminiQuotaError) {
          res.status(503).json({ error: "Quota API Gemini atteint. Réessayez plus tard." });
          return;
        }
        const message = error instanceof Error ? error.message : "Erreur inconnue";
        console.error("[kotoba/api] Phrase generation failed:", message);
        res.status(502).json({ error: `Erreur de génération IA : ${message}` });
        return;
      }

      if (!Array.isArray(generatedPhrases) || generatedPhrases.length === 0) {
        res.status(502).json({ error: "L'IA n'a pas retourné de phrases valides." });
        return;
      }

      const vocabByFrench = new Map<string, number>();
      for (const vocab of vocabularyPool) {
        vocabByFrench.set(vocab.fr.toLowerCase(), vocab.id);
      }

      const phrases = generatedPhrases.map((phrase) => {
        const wordIds: number[] = [];
        const usedWordsFr = phrase.used_words_fr ?? [];
        for (const frWord of usedWordsFr) {
          const wordId = vocabByFrench.get(frWord.toLowerCase());
          if (wordId !== undefined) {
            wordIds.push(wordId);
          }
        }
        return {
          fr: phrase.fr ?? "",
          jp_kanji: phrase.jp_kanji ?? "",
          jp_kana: phrase.jp_kana ?? "",
          explanation: phrase.explanation ?? "",
          wordIds,
        };
      });

      res.json({ phrases });
    }),
  );

  app.post(
    "/api/phrases/evaluate",
    wrapAsync(async (req, res) => {
      const userId = getRequiredUserId(req);

      if (!isGeminiConfigured()) {
        res
          .status(503)
          .json({ error: "Le service IA n'est pas configuré (clé API Gemini manquante)." });
        return;
      }

      const bodySchema = z.object({
        userAnswer: z.string().min(1),
        expectedAnswer: z.string().min(1),
        frenchSentence: z.string().min(1),
        direction: z.enum(["fr-to-jp", "jp-to-fr"]).optional().default("fr-to-jp"),
      });
      const body = bodySchema.parse(req.body);

      const normalizedUser = body.userAnswer.trim().normalize("NFKC");
      const normalizedExpected = body.expectedAnswer.trim().normalize("NFKC");

      if (normalizedUser === normalizedExpected) {
        res.json({ isCorrect: true, feedback: null, errorType: null });
        return;
      }

      const isJpToFr = body.direction === "jp-to-fr";
      const userAnswerLooksLikeRomaji =
        !isJpToFr && !/[\u3040-\u30ff\u4e00-\u9fff]/.test(normalizedUser);
      const romajiNote = userAnswerLooksLikeRomaji
        ? "\nNote importante : la réponse de l'élève est saisie en romaji (lettres latines). Accepte-la comme si elle était écrite en kana/kanji, du moment que la transcription phonétique correspond à la réponse attendue. Exemples : \"watashi wa gakusei desu\" est équivalent à 「私は学生です」, \"konnichiwa\" à 「こんにちは」. Ignore les majuscules, l'usage de tirets, d'apostrophes ou de macrons (ō, ū) et les espaces ; seul le rendu phonétique compte. Ne traite PAS l'absence de kanji ou de kana comme une erreur dans ce cas."
        : "";

      const pedagogicalRules = `Règles de feedback :
- Si la réponse est correcte ou acceptable (même formulée différemment ou avec des synonymes), mets isCorrect à true, errorType à null et feedback à une phrase brève qui valide la réponse et précise éventuellement une nuance ou une variante utile.
- Si la réponse est incorrecte, le feedback doit suivre cet ordre, sans titres ni emojis ni symboles décoratifs :
  1. Une phrase qui identifie précisément l'erreur (par exemple "L'erreur porte sur la particule : tu as écrit は au lieu de が.").
  2. Une phrase qui explique la règle grammaticale ou lexicale qui s'applique ici, en termes clairs.
  3. Une phrase facultative donnant un exemple court qui illustre la règle.
- Style attendu : ton de professeur en classe — clair, direct, posé, professionnel. Pas de flagornerie ni d'enthousiasme excessif.
- Interdictions strictes : aucun emoji, aucun smiley, aucun symbole décoratif (pas de 💚, 🎯, 📝, ✓, ✗, ✅, ❌, etc.). Pas de "Bravo !", "Super !", "Génial !".
- Maximum 4 phrases au total. Sois concis et précis.`;

      const prompt = isJpToFr
        ? `Tu es un professeur de japonais expérimenté qui corrige le devoir d'un élève. Un élève devait traduire cette phrase japonaise en français :

Phrase japonaise : "${body.frenchSentence}"
Réponse attendue (français) : "${body.expectedAnswer}"
Réponse de l'élève : "${body.userAnswer}"

Analyse la réponse de l'élève et réponds UNIQUEMENT au format JSON avec cette structure exacte :
{"isCorrect": false, "errorType": "vocabulary|grammar|meaning|other", "feedback": "Ton conseil pédagogique ici"}

Règles de classification :
- Si la réponse est correcte ou acceptable (même formulée différemment ou avec des synonymes), mets isCorrect à true et errorType à null.
- Sois tolérant sur les formulations françaises différentes si le sens est correct.
- errorType doit être "vocabulary" si l'erreur porte sur un mot mal traduit, "grammar" si c'est une erreur de structure, "meaning" si le sens global est différent, "other" sinon.

${pedagogicalRules}`
        : `Tu es un professeur de japonais expérimenté qui corrige le devoir d'un élève. Un élève devait traduire cette phrase française en japonais :

Phrase française : "${body.frenchSentence}"
Réponse attendue : "${body.expectedAnswer}"
Réponse de l'élève : "${body.userAnswer}"

Analyse la réponse de l'élève et réponds UNIQUEMENT au format JSON avec cette structure exacte :
{"isCorrect": false, "errorType": "particle|conjugation|kanji|other", "feedback": "Ton conseil pédagogique ici"}

Règles de classification :
- Si la réponse est correcte ou acceptable (même formulée différemment), mets isCorrect à true et errorType à null.
- L'élève apprend les kanji. Si la réponse est écrite en kana au lieu des kanji mais est autrement correcte, considère-la comme correcte.
- L'élève peut aussi écrire en romaji (lettres latines) plutôt qu'en kana/kanji. Si la transcription romaji correspond phonétiquement à la réponse attendue, considère-la comme correcte. Ne signale jamais l'usage du romaji comme une erreur.
- errorType doit être "particle" si l'erreur porte sur une particule, "conjugation" si c'est une erreur de conjugaison/temps, "kanji" si c'est uniquement un problème de kanji, "other" sinon.${romajiNote}

${pedagogicalRules}`;

      const phraseEvalSchema = z.object({
        isCorrect: z.boolean(),
        errorType: z.string().nullable().optional(),
        feedback: z.string().nullable().optional(),
      });
      type EvalResult = z.infer<typeof phraseEvalSchema>;

      const evalOptions: GeminiJsonOptions<EvalResult> = {
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            isCorrect: { type: SchemaType.BOOLEAN },
            errorType: { type: SchemaType.STRING, nullable: true },
            feedback: { type: SchemaType.STRING, nullable: true },
          },
          required: ["isCorrect"],
        },
        zodSchema: phraseEvalSchema,
      };

      try {
        const evaluation = await callGeminiJson<EvalResult>(prompt, evalOptions);
        incrementGeminiUsage(database);

        if (!(evaluation.isCorrect ?? false) && evaluation.errorType) {
          database
            .prepare("INSERT INTO error_logs (user_id, error_type, exercise_mode) VALUES (?, ?, ?)")
            .run(userId, evaluation.errorType, "phrases");
        }

        res.json({
          isCorrect: evaluation.isCorrect ?? false,
          feedback: evaluation.feedback ?? null,
          errorType: evaluation.errorType ?? null,
        });
      } catch (error) {
        if (error instanceof GeminiQuotaError) {
          res.status(503).json({ error: "Quota API Gemini atteint. Réessayez plus tard." });
          return;
        }
        const message = error instanceof Error ? error.message : "Erreur inconnue";
        console.error("[kotoba/api] Phrase evaluation failed:", message);
        res.status(502).json({ error: `Erreur d'évaluation IA : ${message}` });
      }
    }),
  );

  // --- Construction (sentence builder) AI endpoint ---

  app.post(
    "/api/construction/generate",
    wrapAsync(async (req, res) => {
      const userId = getRequiredUserId(req);

      if (!isGeminiConfigured()) {
        res
          .status(503)
          .json({ error: "Le service IA n'est pas configuré (clé API Gemini manquante)." });
        return;
      }

      const bodySchema = z.object({
        tagIds: z.array(z.number().int().positive()).min(1),
        particles: z.array(z.string()).min(1),
        tense: z.enum(["present", "past", "te-form"]),
        polarity: z.enum(["affirmative", "negative"]),
        politeness: z.enum(["casual", "polite"]),
        count: z.number().int().min(1).max(10),
        customContext: z.string().max(500).optional(),
        direction: z.enum(["fr-to-jp", "jp-to-fr"]).optional().default("fr-to-jp"),
        sentenceLength: z.enum(["short", "medium", "long"]).optional().default("medium"),
        vocabSampleSize: z.number().int().min(10).max(500).optional().default(80),
      });
      const body = bodySchema.parse(req.body);

      type VocabRow = { id: number; french: string; kana: string | null; kanji: string | null };
      const placeholders = body.tagIds.map(() => "?").join(",");
      const vocabularyRows = database
        .prepare(
          `
          SELECT DISTINCT w.id, w.french, w.kana, w.kanji
          FROM words w
          INNER JOIN word_tags wt ON wt.word_id = w.id
          WHERE wt.tag_id IN (${placeholders})
            AND w.user_id = ?
          ORDER BY RANDOM()
          LIMIT ?
          `,
        )
        .all(...body.tagIds, userId, body.vocabSampleSize) as VocabRow[];

      if (vocabularyRows.length === 0) {
        res.status(400).json({ error: "Aucun mot trouvé pour les tags sélectionnés." });
        return;
      }

      const vocabularyPool = vocabularyRows.map((row) => ({
        id: row.id,
        fr: row.french,
        jp: row.kanji ?? row.kana ?? "",
        kana: row.kana ?? "",
      }));

      const tenseLabels: Record<string, string> = {
        present: "Présent",
        past: "Passé",
        "te-form": "Forme en -te",
      };
      const polarityLabels: Record<string, string> = {
        affirmative: "Affirmatif",
        negative: "Négatif",
      };
      const politenessLabels: Record<string, string> = {
        casual: "Courant/Neutre (forme courte)",
        polite: "Poli/Desu-Masu",
      };
      const sentenceLengthWordsLabels: Record<string, string> = {
        short: "5-7 mots",
        medium: "8-12 mots",
        long: "13-20 mots avec des subordonnées",
      };

      const prompt = `Tu es un professeur de japonais. En utilisant UNIQUEMENT le vocabulaire fourni ci-dessous (et des verbes de base courants si nécessaire comme ある、いる、する、行く、食べる、見る、飲む), génère exactement ${body.count} phrases japonaises uniques et indépendantes pour un exercice de reconstruction par blocs.

Vocabulaire disponible (utilise au maximum ces mots) :
${JSON.stringify(
  vocabularyPool.map((vocab) => ({ fr: vocab.fr, jp: vocab.jp, kana: vocab.kana })),
  null,
  2,
)}

Contraintes strictes :
- Particules autorisées : UNIQUEMENT ${body.particles.join(", ")}. N'utilise AUCUNE autre particule.
- Temps : ${tenseLabels[body.tense] ?? body.tense}
- Polarité : ${polarityLabels[body.polarity] ?? body.polarity}
- Style de politesse : ${politenessLabels[body.politeness] ?? body.politeness}
- Chaque phrase doit faire environ ${sentenceLengthWordsLabels[body.sentenceLength]}.
- Utilise un japonais naturel, et écris les kanji usuels (l'élève s'aide des furigana).
- Chaque phrase doit utiliser au moins un mot du vocabulaire fourni et au moins une particule autorisée.

Pour chaque phrase, tu dois aussi fournir :
- blocks_jp : la phrase japonaise SEGMENTÉE en blocs morphologiques. Règles de segmentation :
  * Chaque particule (は, が, を, に, で, へ, と, も, から, まで, etc.) DOIT être un bloc séparé.
  * Chaque mot de contenu (nom, verbe, adjectif) est un bloc indépendant, terminaisons et conjugaisons INCLUSES dans le même bloc (ex : "食べました" est un seul bloc).
  * La copule です/だ est un bloc à part.
  * Les conjonctions (それから, でも, だから, etc.) sont chacune un bloc.
  * Toute ponctuation japonaise présente dans jp_kanji DOIT apparaître comme un bloc séparé, sans furigana :
    - le point japonais 。 (un bloc 。 par phrase ; s'il y a plusieurs phrases enchaînées, mets autant de blocs 。 que de phrases) ;
    - la virgule japonaise 、 ;
    - les points d'interrogation et d'exclamation pleine chasse ？ et ！ ;
    - les guillemets de citation 「 et 」 (et 『 』 pour citer une œuvre, un livre, un titre) — chaque crochet ouvrant et chaque crochet fermant est un bloc à part ;
    - le point médian ・ et les autres signes typographiques japonais (… ／ etc.) le cas échéant.
    N'utilise PAS la ponctuation occidentale (. , ? ! " ' « ») dans jp_kanji ni dans blocks_jp : seule la ponctuation japonaise pleine chasse est admise.
  * Pour chaque bloc contenant au moins UN kanji, ajoute "furigana" avec la lecture COMPLÈTE du bloc en hiragana (couvre TOUTE la chaîne du bloc, kanji + okurigana). N'inclus PAS de furigana pour les blocs purement en kana ni pour les blocs de ponctuation.
  * Concaténer tous les "text" des blocs dans l'ordre, sans espace, doit reproduire EXACTEMENT jp_kanji (ponctuation incluse).
- blocks_fr : la phrase française tokenisée en mots ; chaque ponctuation (virgule, point, point d'exclamation/interrogation, guillemets) est un bloc séparé.

Réponds UNIQUEMENT au format JSON, un tableau d'objets avec cette structure exacte :
[{"fr": "La phrase en français.", "jp_kanji": "私は「ノルウェイの森」を読みました。", "jp_kana": "わたしは「のるうぇいのもり」をよみました。", "blocks_jp": [{"text": "私", "furigana": "わたし"}, {"text": "は"}, {"text": "「"}, {"text": "ノルウェイの森", "furigana": "ノルウェイのもり"}, {"text": "」"}, {"text": "を"}, {"text": "読みました", "furigana": "よみました"}, {"text": "。"}], "blocks_fr": ["J'", "ai", "lu", "«", "La", "Ballade", "de", "l'impossible", "»", "."], "explanation": "Brève explication grammaticale", "used_words_fr": ["mot1_fr"]}]

${body.customContext ? `Contexte additionnel de l'élève : ${body.customContext}\n` : ""}Le champ used_words_fr doit contenir les mots français du vocabulaire fourni qui ont été utilisés.`;

      type GeminiBlock = { text?: string; furigana?: string };
      type GeminiConstructionPhrase = {
        fr?: string;
        jp_kanji?: string;
        jp_kana?: string;
        blocks_jp?: GeminiBlock[];
        blocks_fr?: string[];
        explanation?: string;
        used_words_fr?: string[];
      };

      let generatedPhrases: GeminiConstructionPhrase[];
      try {
        generatedPhrases = await callGeminiJson<GeminiConstructionPhrase[]>(prompt);
        incrementGeminiUsage(database);
      } catch (error) {
        if (error instanceof GeminiQuotaError) {
          res.status(503).json({ error: "Quota API Gemini atteint. Réessayez plus tard." });
          return;
        }
        const message = error instanceof Error ? error.message : "Erreur inconnue";
        console.error("[kotoba/api] Construction generation failed:", message);
        res.status(502).json({ error: `Erreur de génération IA : ${message}` });
        return;
      }

      if (!Array.isArray(generatedPhrases) || generatedPhrases.length === 0) {
        res.status(502).json({ error: "L'IA n'a pas retourné de phrases valides." });
        return;
      }

      const vocabByFrench = new Map<string, number>();
      for (const vocab of vocabularyPool) {
        vocabByFrench.set(vocab.fr.toLowerCase(), vocab.id);
      }

      const phrases = generatedPhrases
        .map((phrase) => {
          const wordIds: number[] = [];
          const usedWordsFr = phrase.used_words_fr ?? [];
          for (const frWord of usedWordsFr) {
            const wordId = vocabByFrench.get(frWord.toLowerCase());
            if (wordId !== undefined) {
              wordIds.push(wordId);
            }
          }
          const blocksJp = (phrase.blocks_jp ?? [])
            .map((block) => ({
              text: typeof block.text === "string" ? block.text : "",
              furigana:
                typeof block.furigana === "string" && block.furigana.trim().length > 0
                  ? block.furigana
                  : undefined,
            }))
            .filter((block) => block.text.length > 0);

          const rawJpKanji = phrase.jp_kanji ?? "";
          const concatenatedFromBlocks = blocksJp.map((block) => block.text).join("");

          // If the AI listed Japanese punctuation only in jp_kanji but forgot the matching blocks,
          // try to recover those trailing punctuation marks so the learner can reconstruct
          // the expected answer exactly.
          if (rawJpKanji.length > 0 && concatenatedFromBlocks !== rawJpKanji) {
            const japanesePunctuationCharacters = new Set([
              "。",
              "、",
              "？",
              "！",
              "「",
              "」",
              "『",
              "』",
              "・",
              "…",
            ]);
            if (rawJpKanji.startsWith(concatenatedFromBlocks)) {
              const missingSuffix = rawJpKanji.slice(concatenatedFromBlocks.length);
              const onlyPunctuationMissing = Array.from(missingSuffix).every((character) =>
                japanesePunctuationCharacters.has(character),
              );
              if (onlyPunctuationMissing) {
                for (const character of missingSuffix) {
                  blocksJp.push({ text: character, furigana: undefined });
                }
              }
            }
          }

          const finalJpKanji = blocksJp.map((block) => block.text).join("") || rawJpKanji;

          const blocksFr = (phrase.blocks_fr ?? []).filter(
            (token): token is string => typeof token === "string" && token.length > 0,
          );

          return {
            fr: phrase.fr ?? "",
            jp_kanji: finalJpKanji,
            jp_kana: phrase.jp_kana ?? "",
            blocks_jp: blocksJp,
            blocks_fr: blocksFr,
            explanation: phrase.explanation ?? "",
            wordIds,
          };
        })
        .filter((phrase) => {
          const hasJpBlocks = phrase.blocks_jp.length > 0;
          const hasFrBlocks = phrase.blocks_fr.length > 0;
          const needsJp = body.direction === "fr-to-jp";
          return needsJp ? hasJpBlocks : hasFrBlocks;
        });

      if (phrases.length === 0) {
        res.status(502).json({ error: "L'IA n'a pas retourné de blocs exploitables." });
        return;
      }

      res.json({ phrases });
    }),
  );

  // --- Practice "ask the teacher" endpoint (used across all training tabs) ---

  app.post(
    "/api/practice/ask",
    wrapAsync(async (req, res) => {
      getRequiredUserId(req);

      if (!isGeminiConfigured()) {
        res
          .status(503)
          .json({ error: "Le service IA n'est pas configuré (clé API Gemini manquante)." });
        return;
      }

      const bodySchema = z.object({
        question: z.string().min(1).max(800),
        prompt: z.string().min(1),
        expectedAnswer: z.string().min(1),
        userAnswer: z.string().max(2000).optional().default(""),
        direction: z.enum(["fr-to-jp", "jp-to-fr"]).optional(),
        mode: z.enum(["phrases", "construction", "jlpt", "conjugaison", "dialogue"]).optional(),
        history: z
          .array(
            z.object({
              question: z.string().max(800),
              answer: z.string().max(2000),
            }),
          )
          .max(10)
          .optional()
          .default([]),
      });
      const body = bodySchema.parse(req.body);

      const directionLabel =
        body.direction === "jp-to-fr"
          ? "Japonais → Français"
          : body.direction === "fr-to-jp"
            ? "Français → Japonais"
            : null;

      const historyBlock =
        body.history.length > 0
          ? `\nÉchanges précédents avec cet élève sur le même exercice :\n${body.history
              .map(
                (turn, index) =>
                  `(${index + 1}) Élève : "${turn.question}"\n    Toi : "${turn.answer}"`,
              )
              .join("\n")}\n`
          : "";

      const askPrompt = `Tu es un professeur de japonais expérimenté qui répond à la question d'un élève portant sur un exercice en cours.

Énoncé de l'exercice : "${body.prompt}"
Réponse correcte : "${body.expectedAnswer}"${
        body.userAnswer.trim().length > 0
          ? `\nRéponse en cours de l'élève : "${body.userAnswer}"`
          : ""
      }${directionLabel ? `\nDirection : ${directionLabel}` : ""}
${historyBlock}
Question de l'élève : "${body.question}"

Règles de réponse :
- Adresse-toi à l'élève comme un professeur en classe : ton clair, direct, posé, professionnel.
- N'écris pas de salutation ni de formule d'introduction. Va à l'essentiel.
- Réponds en français à la question posée. Explique précisément la règle, la nuance ou le sens demandé, puis donne un ou deux exemples concrets si c'est pertinent.
- Si la question est ambiguë, demande une précision en une phrase.
- Ne dévoile pas la réponse complète à l'élève sauf si la question le demande explicitement (par exemple "comment dit-on cette phrase ?"). Préfère guider l'élève vers la solution.
- Interdictions strictes : aucun emoji, aucun smiley, aucun symbole décoratif (pas de 💚, 🎯, 📝, ✓, ✗, ✅, ❌, etc.). Pas de "Bravo !", "Super !", "Excellente question !".
- Maximum 6 phrases. Sois concis : 2 ou 3 phrases si la question est simple.

Réponds UNIQUEMENT au format JSON avec cette structure exacte :
{"answer": "Ta réponse pédagogique ici"}`;

      const askResultSchema = z.object({
        answer: z.string().optional(),
      });
      type AskResult = z.infer<typeof askResultSchema>;

      const askOptions: GeminiJsonOptions<AskResult> = {
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            answer: { type: SchemaType.STRING },
          },
          required: ["answer"],
        },
        zodSchema: askResultSchema,
      };

      try {
        const result = await callGeminiJson<AskResult>(askPrompt, askOptions);
        incrementGeminiUsage(database);
        const answer = (result.answer ?? "").trim();
        if (answer.length === 0) {
          res.status(502).json({ error: "L'IA n'a pas fourni de réponse." });
          return;
        }
        res.json({ answer });
      } catch (error) {
        if (error instanceof GeminiQuotaError) {
          res.status(503).json({ error: "Quota API Gemini atteint. Réessayez plus tard." });
          return;
        }
        const message = error instanceof Error ? error.message : "Erreur inconnue";
        console.error("[kotoba/api] Practice ask failed:", message);
        res.status(502).json({ error: `Erreur de l'IA : ${message}` });
      }
    }),
  );

  // --- Dialogue AI endpoints ---

  app.post(
    "/api/dialogue/generate",
    wrapAsync(async (req, res) => {
      const userId = getRequiredUserId(req);

      if (!isGeminiConfigured()) {
        res
          .status(503)
          .json({ error: "Le service IA n'est pas configuré (clé API Gemini manquante)." });
        return;
      }

      const bodySchema = z.object({
        tagIds: z.array(z.number().int().positive()).min(1),
        scenario: z.enum(["restaurant", "voyage", "famille", "travail", "ecole", "libre"]),
        difficulty: z.enum(["debutant", "intermediaire"]),
        count: z.number().int().min(2).max(10),
        customContext: z.string().max(500).optional(),
      });
      const body = bodySchema.parse(req.body);

      type VocabRow = { id: number; french: string; kana: string | null; kanji: string | null };
      const placeholders = body.tagIds.map(() => "?").join(",");
      const vocabularyRows = database
        .prepare(
          `
          SELECT DISTINCT w.id, w.french, w.kana, w.kanji
          FROM words w
          INNER JOIN word_tags wt ON wt.word_id = w.id
          WHERE wt.tag_id IN (${placeholders})
            AND w.user_id = ?
          ORDER BY RANDOM()
          `,
        )
        .all(...body.tagIds, userId) as VocabRow[];

      if (vocabularyRows.length === 0) {
        res.status(400).json({ error: "Aucun mot trouvé pour les tags sélectionnés." });
        return;
      }

      const vocabularyPool = vocabularyRows.map((row) => ({
        id: row.id,
        fr: row.french,
        jp: row.kanji ?? row.kana ?? "",
        kana: row.kana ?? "",
      }));

      const scenarioLabels: Record<string, string> = {
        restaurant: "au restaurant (commander, demander l'addition, parler au serveur)",
        voyage: "en voyage (demander son chemin, acheter un billet, réserver un hôtel)",
        famille: "en famille (conversations du quotidien à la maison)",
        travail: "au travail (collègues, réunions, tâches simples)",
        ecole: "à l'école (entre élèves, avec le professeur, en classe)",
        libre: "conversation libre du quotidien",
      };

      const difficultyLabels: Record<string, string> = {
        debutant: "débutant (JLPT N5/N4, phrases courtes et simples, politesse en -masu)",
        intermediaire: "intermédiaire (JLPT N4/N3, phrases un peu plus élaborées)",
      };

      const prompt = `Tu es un professeur de japonais qui crée un dialogue d'entraînement oral.

Scénario : ${scenarioLabels[body.scenario]}
Niveau : ${difficultyLabels[body.difficulty]}
Vocabulaire cible à privilégier (mais tu peux aussi utiliser du vocabulaire de base courant) :
${JSON.stringify(
  vocabularyPool.slice(0, 30).map((v) => ({ fr: v.fr, jp: v.jp, kana: v.kana })),
  null,
  2,
)}

Génère un dialogue cohérent de ${body.count} échanges dans lequel l'ÉLÈVE doit parler. Chaque élément du tableau représente UN tour de parole de l'élève :
- "context" : décrit brièvement en français la situation ou ce que l'interlocuteur vient de dire (1-2 phrases).
- "fr" : ce que l'élève doit dire, formulé en français clair et naturel (c'est l'intention à exprimer).
- "expected_jp" : la traduction japonaise attendue (en kanji+kana quand c'est naturel), correcte et naturelle pour un natif.
- "expected_kana" : la même phrase entièrement en hiragana/katakana (pour la prononciation).

Le dialogue doit avoir une progression logique : chaque élément s'enchaîne avec le précédent pour former une vraie scène cohérente.
${body.customContext ? `\nContexte supplémentaire de l'élève : ${body.customContext}\n` : ""}
Réponds UNIQUEMENT au format JSON, un tableau de ${body.count} objets avec cette structure exacte :
[{"context": "...", "fr": "...", "expected_jp": "...", "expected_kana": "...", "used_words_fr": ["mot1_fr"]}]

Le champ used_words_fr contient les mots français du vocabulaire cible utilisés dans expected_jp.`;

      const dialogueTurnSchema = z.object({
        context: z.string(),
        fr: z.string(),
        expected_jp: z.string(),
        expected_kana: z.string(),
        used_words_fr: z.array(z.string()).optional(),
      });
      type GeminiDialogueTurn = z.infer<typeof dialogueTurnSchema>;

      const dialogueOptions: GeminiJsonOptions<GeminiDialogueTurn[]> = {
        responseSchema: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              context: { type: SchemaType.STRING },
              fr: { type: SchemaType.STRING },
              expected_jp: { type: SchemaType.STRING },
              expected_kana: { type: SchemaType.STRING },
              used_words_fr: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
            },
            required: ["context", "fr", "expected_jp", "expected_kana"],
          },
        },
        zodSchema: z.array(dialogueTurnSchema),
      };

      let generatedTurns: GeminiDialogueTurn[];
      try {
        generatedTurns = await callGeminiJson<GeminiDialogueTurn[]>(prompt, dialogueOptions);
        incrementGeminiUsage(database);
      } catch (error) {
        if (error instanceof GeminiQuotaError) {
          res.status(503).json({ error: "Quota API Gemini atteint. Réessayez plus tard." });
          return;
        }
        const message = error instanceof Error ? error.message : "Erreur inconnue";
        console.error("[kotoba/api] Dialogue generation failed:", message);
        res.status(502).json({ error: `Erreur de génération IA : ${message}` });
        return;
      }

      if (!Array.isArray(generatedTurns) || generatedTurns.length === 0) {
        res.status(502).json({ error: "L'IA n'a pas retourné de dialogue valide." });
        return;
      }

      const vocabByFrench = new Map<string, number>();
      for (const vocab of vocabularyPool) {
        vocabByFrench.set(vocab.fr.toLowerCase(), vocab.id);
      }

      const turns = generatedTurns.map((turn) => {
        const wordIds: number[] = [];
        for (const usedFrench of turn.used_words_fr ?? []) {
          const wordId = vocabByFrench.get(usedFrench.toLowerCase());
          if (wordId !== undefined && !wordIds.includes(wordId)) {
            wordIds.push(wordId);
          }
        }
        return {
          context: turn.context ?? "",
          fr: turn.fr ?? "",
          expected_jp: turn.expected_jp ?? "",
          expected_kana: turn.expected_kana ?? "",
          wordIds,
        };
      });

      res.json({ turns });
    }),
  );

  app.post(
    "/api/dialogue/evaluate",
    wrapAsync(async (req, res) => {
      const userId = getRequiredUserId(req);

      if (!isGeminiConfigured()) {
        res
          .status(503)
          .json({ error: "Le service IA n'est pas configuré (clé API Gemini manquante)." });
        return;
      }

      const bodySchema = z.object({
        userTranscript: z.string().min(1),
        expectedJp: z.string().min(1),
        frenchPrompt: z.string().min(1),
        context: z.string().optional(),
      });
      const body = bodySchema.parse(req.body);

      const normalizedUser = body.userTranscript.trim().normalize("NFKC");
      const normalizedExpected = body.expectedJp.trim().normalize("NFKC");
      if (normalizedUser === normalizedExpected) {
        res.json({ isCorrect: true, feedback: null, errorType: null });
        return;
      }

      const pedagogicalRules = `Règles de feedback :
- Si la réponse est correcte ou acceptable (même formulée différemment, avec des synonymes ou une légère variation de politesse), mets isCorrect à true, errorType à null et feedback à une phrase brève qui valide la réponse.
- Si la réponse est incorrecte, le feedback doit suivre cet ordre, sans titres ni emojis ni symboles décoratifs :
  1. Une phrase qui identifie précisément l'erreur.
  2. Une phrase qui explique la règle grammaticale ou lexicale concernée, en termes clairs.
  3. Une phrase facultative donnant un exemple court qui illustre la règle.
- Style attendu : ton de professeur en classe — clair, direct, posé, professionnel. Pas de flagornerie.
- Interdictions strictes : aucun emoji, aucun smiley, aucun symbole décoratif (pas de 💚, 🎯, 📝, ✓, ✗, etc.). Pas de "Bravo !" ni d'exclamations enthousiastes.
- Sois particulièrement tolérant aux petites erreurs de transcription vocale (un caractère absent ou proche phonétiquement) si le sens est clair : ne les signale pas comme des erreurs.
- Maximum 4 phrases au total.`;

      const prompt = `Tu es un professeur de japonais expérimenté qui corrige une production orale. L'élève a dicté sa réponse via la reconnaissance vocale du navigateur, donc de petites imperfections de transcription peuvent apparaître.

${body.context ? `Contexte de la scène : "${body.context}"\n` : ""}Ce que l'élève devait dire (en français) : "${body.frenchPrompt}"
Réponse japonaise attendue : "${body.expectedJp}"
Transcription de ce que l'élève a dit : "${body.userTranscript}"

Analyse la réponse de l'élève et réponds UNIQUEMENT au format JSON avec cette structure exacte :
{"isCorrect": false, "errorType": "particle|conjugation|vocabulary|pronunciation|other", "feedback": "Ton conseil pédagogique ici"}

Règles de classification :
- Si la réponse transmet le bon sens (même formulée différemment), mets isCorrect à true.
- errorType "pronunciation" si l'erreur principale semble être un problème de transcription/phonétique, "particle" pour une particule incorrecte, "conjugation" pour une conjugaison, "vocabulary" pour un mot inapproprié, "other" sinon.

${pedagogicalRules}`;

      const dialogueEvalSchema = z.object({
        isCorrect: z.boolean(),
        errorType: z.string().nullable().optional(),
        feedback: z.string().nullable().optional(),
      });
      type EvalResult = z.infer<typeof dialogueEvalSchema>;

      const dialogueEvalOptions: GeminiJsonOptions<EvalResult> = {
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            isCorrect: { type: SchemaType.BOOLEAN },
            errorType: { type: SchemaType.STRING, nullable: true },
            feedback: { type: SchemaType.STRING, nullable: true },
          },
          required: ["isCorrect"],
        },
        zodSchema: dialogueEvalSchema,
      };

      try {
        const evaluation = await callGeminiJson<EvalResult>(prompt, dialogueEvalOptions);
        incrementGeminiUsage(database);

        if (!(evaluation.isCorrect ?? false) && evaluation.errorType) {
          database
            .prepare("INSERT INTO error_logs (user_id, error_type, exercise_mode) VALUES (?, ?, ?)")
            .run(userId, evaluation.errorType, "dialogue");
        }

        res.json({
          isCorrect: evaluation.isCorrect ?? false,
          feedback: evaluation.feedback ?? null,
          errorType: evaluation.errorType ?? null,
        });
      } catch (error) {
        if (error instanceof GeminiQuotaError) {
          res.status(503).json({ error: "Quota API Gemini atteint. Réessayez plus tard." });
          return;
        }
        const message = error instanceof Error ? error.message : "Erreur inconnue";
        console.error("[kotoba/api] Dialogue evaluation failed:", message);
        res.status(502).json({ error: `Erreur d'évaluation IA : ${message}` });
      }
    }),
  );

  // --- JLPT AI endpoints ---

  app.post(
    "/api/jlpt/generate",
    wrapAsync(async (req, res) => {
      getRequiredUserId(req);

      if (!isGeminiConfigured()) {
        res
          .status(503)
          .json({ error: "Le service IA n'est pas configuré (clé API Gemini manquante)." });
        return;
      }

      const bodySchema = z.object({
        exerciseType: z.enum(["words", "phrases", "paragraph"]),
        direction: z.enum(["fr-to-jp", "jp-to-fr"]),
        withKanji: z.boolean(),
        count: z.number().int().min(1).max(15),
        paragraphLength: z.enum(["short", "medium", "long"]).optional().default("medium"),
        customContext: z.string().max(500).optional(),
      });
      const body = bodySchema.parse(req.body);

      const isFrToJp = body.direction === "fr-to-jp";
      const paragraphSentences: Record<string, string> = {
        short: "2-3",
        medium: "4-5",
        long: "6-8",
      };

      const kanjiRule = body.withKanji
        ? "Utilise les kanji courants du JLPT N5."
        : "Écris TOUT en hiragana/katakana (aucun kanji). Ajoute un espace après chaque particule (は、が、を、に、で、へ、と、も、から、まで) pour aider à la lecture.";

      let contentInstruction: string;
      if (body.exerciseType === "words") {
        contentInstruction = `génère exactement ${body.count} mots de vocabulaire JLPT N5. Chaque élément doit être un mot simple (pas une phrase).`;
      } else if (body.exerciseType === "phrases") {
        contentInstruction = `génère exactement ${body.count} phrases simples de niveau JLPT N5.`;
      } else {
        contentInstruction = `génère UN paragraphe cohérent de ${paragraphSentences[body.paragraphLength]} phrases de niveau JLPT N5 qui forme une petite histoire ou description du quotidien.`;
      }

      const directionExplanation = isFrToJp
        ? "L'élève verra le champ 'prompt' (en français) et devra traduire en japonais. Le champ 'answer' doit être en japonais."
        : "L'élève verra le champ 'prompt' (en japonais) et devra traduire en français. Le champ 'answer' doit être en français.";

      const prompt = `Tu es un professeur de japonais spécialisé JLPT N5. ${contentInstruction}

Règles :
- Niveau JLPT N5 strictement (grammaire et vocabulaire de base).
- ${kanjiRule}
- ${directionExplanation}
- Varie les thèmes : quotidien, famille, nourriture, temps, lieux, transports, etc.
- Utilise un japonais naturel et simple.

Réponds UNIQUEMENT au format JSON, un tableau d'objets :
[{"prompt": "${isFrToJp ? "Le texte en français" : "Le texte en japonais"}", "answer": "${isFrToJp ? "La traduction en japonais" : "La traduction en français"}", "answer_alt": "${isFrToJp ? "Version alternative en kana si applicable" : ""}", "explanation": "Brève explication grammaticale ou de vocabulaire"}]

${isFrToJp ? 'Le champ answer_alt doit contenir la version tout en kana (si le answer contient des kanji), sinon une chaîne vide "".' : 'Le champ answer_alt peut contenir une traduction alternative acceptable, sinon une chaîne vide "".'}${body.customContext ? `\n\nContexte additionnel de l'élève : ${body.customContext}` : ""}`;

      type GeminiExercise = {
        prompt: string;
        answer: string;
        answer_alt?: string;
        explanation: string;
      };

      let exercises: GeminiExercise[];
      try {
        exercises = await callGeminiJson<GeminiExercise[]>(prompt);
        incrementGeminiUsage(database);
      } catch (error) {
        if (error instanceof GeminiQuotaError) {
          res.status(503).json({ error: "Quota API Gemini atteint. Réessayez plus tard." });
          return;
        }
        const message = error instanceof Error ? error.message : "Erreur inconnue";
        console.error("[kotoba/api] JLPT generation failed:", message);
        res.status(502).json({ error: `Erreur de génération IA : ${message}` });
        return;
      }

      if (!Array.isArray(exercises) || exercises.length === 0) {
        res.status(502).json({ error: "L'IA n'a pas retourné d'exercices valides." });
        return;
      }

      const result = exercises.map((exercise) => ({
        prompt: exercise.prompt ?? "",
        answer: exercise.answer ?? "",
        answerAlt: exercise.answer_alt ?? "",
        explanation: exercise.explanation ?? "",
      }));

      res.json({ exercises: result });
    }),
  );

  app.post(
    "/api/jlpt/evaluate",
    wrapAsync(async (req, res) => {
      const userId = getRequiredUserId(req);

      if (!isGeminiConfigured()) {
        res
          .status(503)
          .json({ error: "Le service IA n'est pas configuré (clé API Gemini manquante)." });
        return;
      }

      const bodySchema = z.object({
        userAnswer: z.string().min(1),
        expectedAnswer: z.string().min(1),
        prompt: z.string().min(1),
        direction: z.enum(["fr-to-jp", "jp-to-fr"]),
      });
      const body = bodySchema.parse(req.body);

      const normalizedUser = body.userAnswer.trim().normalize("NFKC");
      const normalizedExpected = body.expectedAnswer.trim().normalize("NFKC");

      if (normalizedUser === normalizedExpected) {
        res.json({ isCorrect: true, feedback: null, errorType: null });
        return;
      }

      const isJpToFr = body.direction === "jp-to-fr";
      const userAnswerLooksLikeRomaji =
        !isJpToFr && !/[\u3040-\u30ff\u4e00-\u9fff]/.test(normalizedUser);
      const jlptRomajiNote = userAnswerLooksLikeRomaji
        ? "\nNote importante : la réponse de l'élève est saisie en romaji (lettres latines). Accepte-la comme si elle était écrite en kana/kanji, du moment que la transcription phonétique correspond à la réponse attendue. Ignore les majuscules, tirets, apostrophes, macrons et espaces. Ne signale jamais l'usage du romaji comme une erreur."
        : "";

      const jlptPedagogicalRules = `Règles de feedback :
- Si la réponse est correcte ou acceptable, mets isCorrect à true et feedback à une phrase brève qui valide la réponse.
- Si la réponse est incorrecte, le feedback doit suivre cet ordre, sans titres ni emojis ni symboles décoratifs : (1) une phrase qui identifie précisément l'erreur, (2) une phrase qui explique la règle grammaticale ou lexicale concernée, (3) une phrase facultative avec un exemple court.
- Style attendu : ton de professeur en classe — clair, direct, posé, professionnel. Pas de flagornerie, pas d'exclamations.
- Interdictions strictes : aucun emoji, aucun smiley, aucun symbole décoratif (💚, 🎯, 📝, ✓, ✗, etc.).
- Maximum 4 phrases. Le feedback est en français.`;

      const evalPrompt = isJpToFr
        ? `Tu es un professeur de japonais expérimenté (niveau JLPT N5) qui corrige le devoir d'un élève. Un élève devait traduire du japonais vers le français :

Texte japonais : "${body.prompt}"
Réponse attendue (français) : "${body.expectedAnswer}"
Réponse de l'élève : "${body.userAnswer}"

Réponds UNIQUEMENT au format JSON :
{"isCorrect": false, "errorType": "vocabulary|grammar|meaning|other", "feedback": "Conseil pédagogique"}

Sois tolérant sur les formulations françaises si le sens est correct.

${jlptPedagogicalRules}`
        : `Tu es un professeur de japonais expérimenté (niveau JLPT N5) qui corrige le devoir d'un élève. Un élève devait traduire du français vers le japonais :

Texte français : "${body.prompt}"
Réponse attendue (japonais) : "${body.expectedAnswer}"
Réponse de l'élève : "${body.userAnswer}"

Réponds UNIQUEMENT au format JSON :
{"isCorrect": false, "errorType": "particle|conjugation|kanji|other", "feedback": "Conseil pédagogique"}

Si la réponse est en kana au lieu de kanji mais correcte, accepte-la.
L'élève peut aussi écrire en romaji ; si la transcription phonétique correspond à la réponse attendue, considère-la comme correcte.${jlptRomajiNote}

${jlptPedagogicalRules}`;

      type EvalResult = {
        isCorrect: boolean;
        errorType: string | null;
        feedback: string | null;
      };

      try {
        const evaluation = await callGeminiJson<EvalResult>(evalPrompt);
        incrementGeminiUsage(database);

        if (!(evaluation.isCorrect ?? false) && evaluation.errorType) {
          database
            .prepare("INSERT INTO error_logs (user_id, error_type, exercise_mode) VALUES (?, ?, ?)")
            .run(userId, evaluation.errorType, "jlpt");
        }

        res.json({
          isCorrect: evaluation.isCorrect ?? false,
          feedback: evaluation.feedback ?? null,
          errorType: evaluation.errorType ?? null,
        });
      } catch (error) {
        if (error instanceof GeminiQuotaError) {
          res.status(503).json({ error: "Quota API Gemini atteint. Réessayez plus tard." });
          return;
        }
        const message = error instanceof Error ? error.message : "Erreur inconnue";
        console.error("[kotoba/api] JLPT evaluation failed:", message);
        res.status(502).json({ error: `Erreur d'évaluation IA : ${message}` });
      }
    }),
  );

  // --- Keyboard mode batch correction ---

  app.post(
    "/api/series/keyboard/correct",
    wrapAsync(async (req, res) => {
      getRequiredUserId(req);

      if (!isGeminiConfigured()) {
        res
          .status(503)
          .json({ error: "Le service IA n'est pas configuré (clé API Gemini manquante)." });
        return;
      }

      const answerSchema = z.object({
        wordId: z.number().int().positive(),
        french: z.string(),
        kanji: z.string().nullable(),
        kana: z.string().nullable(),
        userInput1: z.string(),
        userInput2: z.string(),
        direction: z.enum(["fr", "jpn"]),
        promptField: z.enum(["french", "kana", "kanji"]),
      });
      const bodySchema = z.object({
        answers: z.array(answerSchema).min(1).max(200),
      });
      const body = bodySchema.parse(req.body);

      const wordLines = body.answers.map((answer, index) => {
        if (answer.direction === "fr") {
          return `Mot ${index + 1} (wordId: ${answer.wordId}):
  Français affiché : "${answer.french}"
  Kanji attendu : "${answer.kanji ?? "(aucun)"}"
  Kana attendu : "${answer.kana ?? "(aucun)"}"
  Réponse Kanji de l'élève : "${answer.userInput1}"
  Réponse Kana de l'élève : "${answer.userInput2}"`;
        }
        const shownField = answer.promptField === "kanji" ? "Kanji" : "Kana";
        const shownValue = answer.promptField === "kanji" ? answer.kanji : answer.kana;
        const otherJpField = answer.promptField === "kanji" ? "Kana" : "Kanji";
        const otherJpExpected = answer.promptField === "kanji" ? answer.kana : answer.kanji;
        return `Mot ${index + 1} (wordId: ${answer.wordId}):
  ${shownField} affiché : "${shownValue ?? ""}"
  Français attendu : "${answer.french}"
  ${otherJpField} attendu : "${otherJpExpected ?? "(aucun)"}"
  Réponse Français de l'élève : "${answer.userInput1}"
  Réponse ${otherJpField} de l'élève : "${answer.userInput2}"`;
      });

      const prompt = `Tu es un professeur de japonais strict mais juste. Un élève a passé un test de vocabulaire. Pour chaque mot, évalue ses réponses.

${wordLines.join("\n\n")}

Pour chaque mot, attribue une note :
- 1 = Correct (toutes les réponses sont justes ou acceptables, petites variations d'écriture tolérées)
- 2 = Partiellement correct (une des réponses est bonne, ou il y a de petites erreurs)
- 3 = Incorrect (les réponses sont fausses ou vides)

Réponds UNIQUEMENT avec un tableau JSON de cette forme exacte :
[{"wordId": <id>, "rating": <1|2|3>, "correction": "<explication courte en français>"}]

Règles :
- Retourne exactement ${body.answers.length} éléments, un par mot, dans le même ordre.
- La correction doit être courte (1-2 phrases), en français, expliquant ce qui est juste ou faux.
- Si tout est correct, la correction peut être "Parfait !" ou similaire.
- Sois tolérant sur les espaces, la ponctuation et les variations mineures de kana.
- Si l'élève n'a rien écrit (chaîne vide), note 3.`;

      type CorrectionResult = {
        wordId: number;
        rating: 1 | 2 | 3;
        correction: string;
      };

      try {
        const corrections = await callGeminiJson<CorrectionResult[]>(prompt);
        incrementGeminiUsage(database);
        res.json(corrections);
      } catch (error) {
        if (error instanceof GeminiQuotaError) {
          res.status(503).json({ error: "Quota API Gemini atteint. Réessayez plus tard." });
          return;
        }
        const message = error instanceof Error ? error.message : "Erreur inconnue";
        console.error("[kotoba/api] Keyboard correction failed:", message);
        res.status(502).json({ error: `Erreur de correction IA : ${message}` });
      }
    }),
  );

  // --- Tag audio download (TTS) ---

  app.get(
    "/api/tags/:tagId/audio",
    wrapAsync(async (req, res) => {
      const userId = getRequiredUserId(req);
      const tagId = Number(req.params.tagId);
      if (!Number.isFinite(tagId)) {
        res.status(400).json({ error: "Invalid tag id" });
        return;
      }

      const tag = database
        .prepare("SELECT id, name FROM tags WHERE id = ? AND user_id = ?")
        .get(tagId, userId) as { id: number; name: string } | undefined;
      if (!tag) {
        res.status(404).json({ error: "Tag not found" });
        return;
      }

      type WordRow = { french: string; kana: string | null };
      const wordRows = database
        .prepare(
          `
          SELECT w.french, w.kana
          FROM words w
          INNER JOIN word_tags wt ON wt.word_id = w.id
          WHERE wt.tag_id = ? AND w.user_id = ?
          ORDER BY w.id ASC
        `,
        )
        .all(tagId, userId) as WordRow[];

      if (wordRows.length === 0) {
        res.status(404).json({ error: "No words found for this tag" });
        return;
      }

      const audioChunks: Buffer[] = [];

      for (const word of wordRows) {
        const frenchText = word.french;
        const japaneseText = word.kana || "";

        if (frenchText) {
          const frenchTts = new EdgeTTS(frenchText, "fr-FR-DeniseNeural", {
            rate: "-10%",
          });
          const frenchResult = await frenchTts.synthesize();
          const frenchBuffer = Buffer.from(await frenchResult.audio.arrayBuffer());
          audioChunks.push(frenchBuffer);
        }

        if (japaneseText) {
          const japaneseTts = new EdgeTTS(japaneseText, "ja-JP-NanamiNeural", {
            rate: "-15%",
          });
          const japaneseResult = await japaneseTts.synthesize();
          const japaneseBuffer = Buffer.from(await japaneseResult.audio.arrayBuffer());
          audioChunks.push(japaneseBuffer);
        }
      }

      const fullAudio = Buffer.concat(audioChunks);
      const safeTagName = tag.name.replace(/[^a-zA-Z0-9\u00C0-\u024F\u3000-\u9FFF_-]/g, "_");
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Disposition", `attachment; filename="${safeTagName}.mp3"`);
      res.setHeader("Content-Length", fullAudio.length);
      res.send(fullAudio);
    }),
  );

  // --- Conjugation practice ---

  app.post(
    "/api/conjugation/generate",
    wrapAsync(async (req, res) => {
      const userId = getRequiredUserId(req);
      if (!isGeminiConfigured()) {
        res.status(503).json({ error: "Gemini not configured" });
        return;
      }

      const bodySchema = z.object({
        words: z
          .array(
            z.object({
              french: z.string(),
              kana: z.string().optional(),
              kanji: z.string().optional(),
            }),
          )
          .min(1)
          .max(20),
        forms: z.array(z.string()).min(1),
        count: z.number().int().min(1).max(20).default(10),
      });
      const body = bodySchema.parse(req.body);

      const quota = getGeminiQuota(database);
      if (quota.remaining <= 0) {
        res.status(429).json({ error: "Gemini quota exceeded", quota });
        return;
      }

      const wordsList = body.words
        .map((word) => `${word.kanji ?? word.kana ?? ""} (${word.french})`)
        .join(", ");

      const prompt = `Tu es un professeur de japonais. Génère ${body.count} exercices de conjugaison à partir de ces verbes : ${wordsList}.

Formes demandées : ${body.forms.join(", ")}.

Pour chaque exercice, donne :
- "verb": le verbe en forme dictionnaire (kanji ou kana)
- "form": la forme demandée (en français, ex: "forme polie", "forme -te", etc.)
- "prompt": la consigne affichée à l'élève (ex: "食べる → forme polie")
- "answer": la bonne réponse conjuguée

Retourne un tableau JSON. Exemple :
[{"verb": "食べる", "form": "forme polie", "prompt": "食べる → forme polie", "answer": "食べます"}]`;

      incrementGeminiUsage(database);
      const exercises = await callGeminiJson(prompt);

      if (!Array.isArray(exercises)) {
        res.status(500).json({ error: "Format de réponse invalide" });
        return;
      }

      res.json({ exercises, quota: getGeminiQuota(database) });
    }),
  );

  app.post(
    "/api/conjugation/evaluate",
    wrapAsync(async (req, res) => {
      const userId = getRequiredUserId(req);
      if (!isGeminiConfigured()) {
        res.status(503).json({ error: "Gemini not configured" });
        return;
      }

      const bodySchema = z.object({
        prompt: z.string(),
        expected: z.string(),
        userAnswer: z.string(),
      });
      const body = bodySchema.parse(req.body);

      const quota = getGeminiQuota(database);
      if (quota.remaining <= 0) {
        res.status(429).json({ error: "Gemini quota exceeded", quota });
        return;
      }

      const geminiPrompt = `Tu es un professeur de japonais qui corrige une réponse de conjugaison.
Consigne : ${body.prompt}
Réponse attendue : ${body.expected}
Réponse de l'élève : ${body.userAnswer}

Évalue la réponse. Retourne un objet JSON :
{ "isCorrect": true/false, "correctedAnswer": "la réponse correcte", "explanation": "explication courte" }

Règles pour le champ explanation :
- Si la réponse est correcte, une phrase brève qui valide et précise éventuellement la règle de conjugaison appliquée.
- Si la réponse est incorrecte : une phrase qui identifie l'erreur, puis une phrase qui rappelle la règle de conjugaison applicable. Une phrase d'exemple court est facultative.
- Style attendu : ton de professeur — clair, direct, posé, professionnel.
- Interdictions strictes : aucun emoji, aucun smiley, aucun symbole décoratif. Pas de "Bravo !", pas d'exclamations enthousiastes.
- Maximum 3 phrases.`;

      incrementGeminiUsage(database);
      const evaluation = await callGeminiJson(geminiPrompt);

      res.json({ evaluation, quota: getGeminiQuota(database) });
    }),
  );

  // --- Badges ---

  app.get("/api/badges", (req, res) => {
    const userId = getRequiredUserId(req);
    const allBadges = database
      .prepare(
        `SELECT bd.*, ub.earned_at FROM badge_definitions bd
       LEFT JOIN user_badges ub ON ub.badge_id = bd.id AND ub.user_id = ?
       ORDER BY ub.earned_at IS NULL, ub.earned_at DESC, bd.category, bd.id`,
      )
      .all(userId);
    res.json({ badges: allBadges });
  });

  app.get("/api/badges/recent", (req, res) => {
    const userId = getRequiredUserId(req);
    const recentBadges = database
      .prepare(
        `SELECT bd.*, ub.earned_at FROM badge_definitions bd
       INNER JOIN user_badges ub ON ub.badge_id = bd.id AND ub.user_id = ?
       WHERE ub.earned_at >= datetime('now', '-7 days')
       ORDER BY ub.earned_at DESC`,
      )
      .all(userId);
    res.json({ badges: recentBadges });
  });

  // --- Weak points ---

  app.get("/api/stats/weak-points", (req, res) => {
    const userId = getRequiredUserId(req);

    const byErrorType = database
      .prepare(
        `SELECT error_type, COUNT(*) as count FROM error_logs
       WHERE user_id = ? AND created_at >= datetime('now', '-30 days')
       GROUP BY error_type ORDER BY count DESC LIMIT 5`,
      )
      .all(userId) as Array<{ error_type: string; count: number }>;

    const byMode = database
      .prepare(
        `SELECT exercise_mode, COUNT(*) as count FROM error_logs
       WHERE user_id = ? AND created_at >= datetime('now', '-30 days')
       GROUP BY exercise_mode ORDER BY count DESC`,
      )
      .all(userId) as Array<{ exercise_mode: string; count: number }>;

    const thisWeek = (
      database
        .prepare(
          `SELECT COUNT(*) as count FROM error_logs
       WHERE user_id = ? AND created_at >= datetime('now', '-7 days')`,
        )
        .get(userId) as { count: number }
    ).count;

    const lastWeek = (
      database
        .prepare(
          `SELECT COUNT(*) as count FROM error_logs
       WHERE user_id = ? AND created_at >= datetime('now', '-14 days')
         AND created_at < datetime('now', '-7 days')`,
        )
        .get(userId) as { count: number }
    ).count;

    res.json({ byErrorType, byMode, thisWeek, lastWeek });
  });

  // --- Saved phrases ---

  app.post(
    "/api/saved-phrases",
    wrapAsync(async (req, res) => {
      const userId = getRequiredUserId(req);
      const bodySchema = z.object({
        french: z.string().min(1).max(1000),
        japanese: z.string().min(1).max(1000),
        japanese_kana: z.string().max(1000).optional(),
        explanation: z.string().max(2000).optional(),
        source: z.string().min(1).max(50),
        word_ids: z.array(z.number().int()).optional(),
      });
      const body = bodySchema.parse(req.body);

      const result = database
        .prepare(
          `INSERT INTO saved_phrases (user_id, french, japanese, japanese_kana, explanation, source, word_ids)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          userId,
          body.french,
          body.japanese,
          body.japanese_kana ?? null,
          body.explanation ?? null,
          body.source,
          body.word_ids ? JSON.stringify(body.word_ids) : null,
        );

      const newBadges = checkAndAwardBadges(database, userId);
      res.status(201).json({ id: result.lastInsertRowid, newBadges });
    }),
  );

  app.get("/api/saved-phrases", (req, res) => {
    const userId = getRequiredUserId(req);
    const source = (req.query.source as string) || null;

    let query = "SELECT * FROM saved_phrases WHERE user_id = ?";
    const params: unknown[] = [userId];
    if (source) {
      query += " AND source = ?";
      params.push(source);
    }
    query += " ORDER BY created_at DESC";

    const phrases = database.prepare(query).all(...params);
    res.json({ phrases });
  });

  app.get("/api/saved-phrases/due", (req, res) => {
    const userId = getRequiredUserId(req);
    const duePhrases = database
      .prepare(
        `SELECT * FROM saved_phrases
       WHERE user_id = ? AND (srs_next_review_at IS NULL OR srs_next_review_at <= datetime('now'))
       ORDER BY srs_next_review_at ASC NULLS FIRST LIMIT 50`,
      )
      .all(userId);
    res.json({ phrases: duePhrases, dueCount: duePhrases.length });
  });

  app.post("/api/saved-phrases/:id/review", (req, res) => {
    const userId = getRequiredUserId(req);
    const phraseId = Number(req.params.id);
    const bodySchema = z.object({
      result: z.enum(["success", "fail"]),
    });
    const body = bodySchema.parse(req.body);

    const phrase = database
      .prepare("SELECT * FROM saved_phrases WHERE id = ? AND user_id = ?")
      .get(phraseId, userId) as
      | {
          srs_step: number;
          srs_interval: number;
          srs_ease_factor: number;
          success_count: number;
          fail_count: number;
        }
      | undefined;

    if (!phrase) {
      res.status(404).json({ error: "Phrase non trouvée" });
      return;
    }

    const reviewResult = body.result === "success" ? ("success" as const) : ("fail" as const);
    const srsResult = computeSrsSchedule(
      phrase.srs_step,
      phrase.srs_interval,
      phrase.srs_ease_factor,
      reviewResult,
    );

    database
      .prepare(
        `UPDATE saved_phrases SET
        srs_step = ?, srs_interval = ?, srs_ease_factor = ?, srs_next_review_at = ?,
        success_count = success_count + ?, fail_count = fail_count + ?,
        last_reviewed_at = datetime('now')
       WHERE id = ?`,
      )
      .run(
        srsResult.srs_step,
        srsResult.srs_interval,
        srsResult.srs_ease_factor,
        srsResult.srs_next_review_at,
        reviewResult === "success" ? 1 : 0,
        reviewResult === "fail" ? 1 : 0,
        phraseId,
      );

    res.json({ updated: true });
  });

  app.delete("/api/saved-phrases/:id", (req, res) => {
    const userId = getRequiredUserId(req);
    const phraseId = Number(req.params.id);
    database
      .prepare("DELETE FROM saved_phrases WHERE id = ? AND user_id = ?")
      .run(phraseId, userId);
    res.json({ deleted: true });
  });

  // --- Grammar notes ---

  app.get(
    "/api/grammar/note",
    wrapAsync(async (req, res) => {
      const userId = getRequiredUserId(req);
      const topic = (req.query.topic as string) || "";
      if (!topic) {
        res.status(400).json({ error: "Le paramètre topic est requis" });
        return;
      }

      const existing = database
        .prepare("SELECT * FROM grammar_notes WHERE user_id = ? AND topic = ?")
        .get(userId, topic) as { id: number; content: string; view_count: number } | undefined;

      if (existing) {
        database
          .prepare("UPDATE grammar_notes SET view_count = view_count + 1 WHERE id = ?")
          .run(existing.id);
        res.json({ note: { ...existing, view_count: existing.view_count + 1 } });
        return;
      }

      if (!isGeminiConfigured()) {
        res.status(503).json({ error: "Service IA non configuré." });
        return;
      }

      const prompt = `Tu es un professeur de japonais expérimenté. Rédige une fiche de grammaire concise sur le sujet suivant : "${topic}".

La fiche doit contenir :
1. Une explication claire du point grammatical (2-3 phrases)
2. La règle principale avec la structure
3. 2-3 exemples avec traduction français-japonais
4. Une erreur fréquente à éviter

Style : clair, direct, sans emoji ni exclamation. Maximum 15 phrases.

Réponds UNIQUEMENT au format JSON : {"content": "ton explication ici"}`;

      try {
        const result = await callGeminiJson<{ content: string }>(prompt);
        incrementGeminiUsage(database);
        const content = result.content ?? "";

        database
          .prepare(
            `INSERT INTO grammar_notes (user_id, topic, content, error_type, view_count)
           VALUES (?, ?, ?, ?, 1)
           ON CONFLICT(user_id, topic) DO UPDATE SET content = ?, view_count = view_count + 1`,
          )
          .run(userId, topic, content, null, content);

        const inserted = database
          .prepare("SELECT * FROM grammar_notes WHERE user_id = ? AND topic = ?")
          .get(userId, topic);

        res.json({ note: inserted });
      } catch (error) {
        if (error instanceof GeminiQuotaError) {
          res.status(503).json({ error: "Quota API Gemini atteint." });
          return;
        }
        const message = error instanceof Error ? error.message : "Erreur inconnue";
        res.status(502).json({ error: `Erreur IA : ${message}` });
      }
    }),
  );

  app.get("/api/grammar/notes", (req, res) => {
    const userId = getRequiredUserId(req);
    const notes = database
      .prepare(
        "SELECT * FROM grammar_notes WHERE user_id = ? ORDER BY view_count DESC, created_at DESC",
      )
      .all(userId);
    res.json({ notes });
  });

  app.delete("/api/grammar/notes/:id", (req, res) => {
    const userId = getRequiredUserId(req);
    const noteId = Number(req.params.id);
    database.prepare("DELETE FROM grammar_notes WHERE id = ? AND user_id = ?").run(noteId, userId);
    res.json({ deleted: true });
  });

  // --- Daily challenge ---

  app.get(
    "/api/daily-challenge",
    wrapAsync(async (req, res) => {
      const userId = getRequiredUserId(req);
      const today = new Date().toISOString().slice(0, 10);

      const existing = database
        .prepare("SELECT * FROM daily_challenges WHERE user_id = ? AND challenge_date = ?")
        .get(userId, today) as
        | {
            id: number;
            challenge_type: string;
            challenge_data: string;
            completed: number;
            is_correct: number | null;
          }
        | undefined;

      if (existing) {
        res.json({
          challenge: {
            ...existing,
            challenge_data: JSON.parse(existing.challenge_data),
          },
        });
        return;
      }

      type WeakWord = { id: number; french: string; kana: string | null; kanji: string | null };
      const weakWords = database
        .prepare(
          `SELECT w.id, w.french, w.kana, w.kanji FROM words w
         INNER JOIN word_stats ws ON ws.word_id = w.id
         WHERE w.user_id = ? AND (ws.score <= -5 OR (ws.success_count + ws.partial_count + ws.fail_count >= 3 AND CAST(ws.fail_count AS REAL) / (ws.success_count + ws.partial_count + ws.fail_count) > 0.3))
         ORDER BY ws.score ASC LIMIT 20`,
        )
        .all(userId) as WeakWord[];

      let targetWords: WeakWord[];
      if (weakWords.length >= 1) {
        targetWords = weakWords;
      } else {
        targetWords = database
          .prepare(
            "SELECT id, french, kana, kanji FROM words WHERE user_id = ? ORDER BY RANDOM() LIMIT 20",
          )
          .all(userId) as WeakWord[];
      }

      if (targetWords.length === 0) {
        res.json({ challenge: null });
        return;
      }

      const randomWord = targetWords[Math.floor(Math.random() * targetWords.length)];
      const japanese = randomWord.kanji ?? randomWord.kana ?? "";

      const challengeTypes = ["translate_fr_jp", "translate_jp_fr"] as const;
      const challengeType = challengeTypes[Math.floor(Math.random() * challengeTypes.length)];

      const challengeData =
        challengeType === "translate_fr_jp"
          ? {
              prompt: randomWord.french,
              answer: japanese,
              hint: randomWord.kana,
              wordId: randomWord.id,
            }
          : {
              prompt: japanese,
              answer: randomWord.french,
              hint: randomWord.kana,
              wordId: randomWord.id,
            };

      const result = database
        .prepare(
          `INSERT INTO daily_challenges (user_id, challenge_date, challenge_type, challenge_data)
         VALUES (?, ?, ?, ?)`,
        )
        .run(userId, today, challengeType, JSON.stringify(challengeData));

      res.json({
        challenge: {
          id: result.lastInsertRowid,
          challenge_date: today,
          challenge_type: challengeType,
          challenge_data: challengeData,
          completed: 0,
          is_correct: null,
        },
      });
    }),
  );

  app.post(
    "/api/daily-challenge/submit",
    wrapAsync(async (req, res) => {
      const userId = getRequiredUserId(req);
      const today = new Date().toISOString().slice(0, 10);
      const bodySchema = z.object({ answer: z.string().min(1).max(500) });
      const body = bodySchema.parse(req.body);

      const challenge = database
        .prepare("SELECT * FROM daily_challenges WHERE user_id = ? AND challenge_date = ?")
        .get(userId, today) as
        | {
            id: number;
            challenge_data: string;
            completed: number;
          }
        | undefined;

      if (!challenge) {
        res.status(404).json({ error: "Pas de défi aujourd'hui" });
        return;
      }
      if (challenge.completed) {
        res.json({ alreadyCompleted: true });
        return;
      }

      const data = JSON.parse(challenge.challenge_data) as { answer: string; wordId?: number };
      const normalizedUser = body.answer.trim().normalize("NFKC").toLowerCase();
      const normalizedExpected = data.answer.trim().normalize("NFKC").toLowerCase();
      const isCorrect = normalizedUser === normalizedExpected;

      database
        .prepare("UPDATE daily_challenges SET completed = 1, is_correct = ? WHERE id = ?")
        .run(isCorrect ? 1 : 0, challenge.id);

      if (data.wordId) {
        database.prepare("INSERT OR IGNORE INTO word_stats (word_id) VALUES (?)").run(data.wordId);
        const existingStats = database
          .prepare(
            "SELECT word_id, COALESCE(success_count,0) AS success_count, COALESCE(partial_count,0) AS partial_count, COALESCE(fail_count,0) AS fail_count, COALESCE(score,0) AS score, last_reviewed_at, COALESCE(consecutive_success_count,0) AS consecutive_success_count, COALESCE(srs_interval,0) AS srs_interval, COALESCE(srs_ease_factor,2.5) AS srs_ease_factor, srs_next_review_at, COALESCE(srs_step,0) AS srs_step FROM word_stats WHERE word_id = ?",
          )
          .get(data.wordId) as WordStatsRow | undefined;
        if (existingStats) {
          const reviewResult: ReviewResult = isCorrect ? "success" : "fail";
          const updated = applyReviewToStats(existingStats, reviewResult);
          database
            .prepare(
              "UPDATE word_stats SET success_count=?, partial_count=?, fail_count=?, score=?, last_reviewed_at=?, consecutive_success_count=?, srs_interval=?, srs_ease_factor=?, srs_next_review_at=?, srs_step=? WHERE word_id=?",
            )
            .run(
              updated.success_count,
              updated.partial_count,
              updated.fail_count,
              updated.score,
              updated.last_reviewed_at,
              updated.consecutive_success_count,
              updated.srs_interval,
              updated.srs_ease_factor,
              updated.srs_next_review_at,
              updated.srs_step,
              updated.word_id,
            );
          trackDailyActivity(database, userId, 1);
        }
      }

      const newBadges = checkAndAwardBadges(database, userId);
      res.json({ isCorrect, expectedAnswer: data.answer, newBadges });
    }),
  );

  // --- Listening / Dictée ---

  app.post(
    "/api/listening/generate",
    wrapAsync(async (req, res) => {
      const userId = getRequiredUserId(req);
      if (!isGeminiConfigured()) {
        res
          .status(503)
          .json({ error: "Le service IA n'est pas configuré (clé API Gemini manquante)." });
        return;
      }

      const bodySchema = z.object({
        tagIds: z.array(z.number().int().positive()).min(1),
        difficulty: z.enum(["debutant", "intermediaire"]),
        count: z.number().int().min(3).max(8),
      });
      const body = bodySchema.parse(req.body);

      type VocabRow = { id: number; french: string; kana: string | null; kanji: string | null };
      const placeholders = body.tagIds.map(() => "?").join(",");
      const vocabularyRows = database
        .prepare(
          `SELECT DISTINCT w.id, w.french, w.kana, w.kanji FROM words w
         INNER JOIN word_tags wt ON wt.word_id = w.id
         WHERE wt.tag_id IN (${placeholders}) AND w.user_id = ?
         ORDER BY RANDOM()`,
        )
        .all(...body.tagIds, userId) as VocabRow[];

      if (vocabularyRows.length === 0) {
        res.status(400).json({ error: "Aucun mot trouvé pour les tags sélectionnés." });
        return;
      }

      const vocabularyPool = vocabularyRows.map((row) => ({
        id: row.id,
        fr: row.french,
        jp: row.kanji ?? row.kana ?? "",
        kana: row.kana ?? "",
      }));

      const difficultyLabel =
        body.difficulty === "debutant"
          ? "débutant (phrases courtes et simples, vocabulaire courant, politesse en -masu)"
          : "intermédiaire (phrases un peu plus longues, structures variées)";

      const prompt = `Tu es un professeur de japonais qui crée des phrases pour un exercice de dictée orale.

Niveau : ${difficultyLabel}
Vocabulaire disponible :
${JSON.stringify(
  vocabularyPool.slice(0, 30).map((v) => ({ fr: v.fr, jp: v.jp, kana: v.kana })),
  null,
  2,
)}

Génère exactement ${body.count} phrases courtes et naturelles en japonais, adaptées à l'écoute et la transcription.
Chaque phrase doit être simple et prononçable clairement.

Réponds UNIQUEMENT au format JSON :
[{"japanese": "日本語の文", "japanese_kana": "にほんごのぶん", "french": "La traduction en français", "used_words_fr": ["mot1"]}]`;

      try {
        const sentences =
          await callGeminiJson<
            Array<{
              japanese: string;
              japanese_kana: string;
              french: string;
              used_words_fr?: string[];
            }>
          >(prompt);
        incrementGeminiUsage(database);

        if (!Array.isArray(sentences) || sentences.length === 0) {
          res.status(502).json({ error: "L'IA n'a pas généré de phrases valides." });
          return;
        }

        const vocabByFrench = new Map<string, number>();
        for (const vocab of vocabularyPool) {
          vocabByFrench.set(vocab.fr.toLowerCase(), vocab.id);
        }

        const exercises = sentences.map((sentence) => {
          const wordIds: number[] = [];
          for (const usedFr of sentence.used_words_fr ?? []) {
            const wordId = vocabByFrench.get(usedFr.toLowerCase());
            if (wordId !== undefined && !wordIds.includes(wordId)) wordIds.push(wordId);
          }
          return { ...sentence, wordIds };
        });

        res.json({ exercises, quota: getGeminiQuota(database) });
      } catch (error) {
        if (error instanceof GeminiQuotaError) {
          res.status(503).json({ error: "Quota API Gemini atteint. Réessayez plus tard." });
          return;
        }
        const message = error instanceof Error ? error.message : "Erreur inconnue";
        console.error("[kotoba/api] Listening generation failed:", message);
        res.status(502).json({ error: `Erreur de génération IA : ${message}` });
      }
    }),
  );

  app.post(
    "/api/listening/evaluate",
    wrapAsync(async (req, res) => {
      const userId = getRequiredUserId(req);
      if (!isGeminiConfigured()) {
        res.status(503).json({ error: "Service IA non configuré." });
        return;
      }

      const bodySchema = z.object({
        userTranscript: z.string().max(1000),
        expectedJapanese: z.string().max(1000),
        frenchTranslation: z.string().max(1000),
      });
      const body = bodySchema.parse(req.body);

      const normalizedUser = body.userTranscript.trim().normalize("NFKC");
      const normalizedExpected = body.expectedJapanese.trim().normalize("NFKC");
      if (normalizedUser === normalizedExpected) {
        res.json({ isCorrect: true, feedback: null, errorType: null });
        return;
      }

      const prompt = `Tu es un professeur de japonais. Un élève a fait un exercice de dictée.

Phrase japonaise attendue : "${body.expectedJapanese}"
Traduction française : "${body.frenchTranslation}"
Ce que l'élève a écrit : "${body.userTranscript}"

Analyse et réponds UNIQUEMENT au format JSON :
{"isCorrect": false, "errorType": "kanji|kana|vocabulary|other", "feedback": "Ton conseil"}

Règles :
- Si la réponse est correcte ou quasi-identique, mets isCorrect à true.
- Sois tolérant sur les espaces et la ponctuation.
- Si l'élève a écrit en kana au lieu de kanji mais le contenu est correct, considère comme correct.
- Feedback : 1-2 phrases max, ton professoral, pas d'emoji.`;

      try {
        const evaluation = await callGeminiJson<{
          isCorrect: boolean;
          errorType: string | null;
          feedback: string | null;
        }>(prompt);
        incrementGeminiUsage(database);

        if (!evaluation.isCorrect && evaluation.errorType) {
          database
            .prepare(
              "INSERT INTO error_logs (user_id, error_type, exercise_mode) VALUES (?, ?, 'ecoute')",
            )
            .run(userId, evaluation.errorType);
        }

        res.json({
          isCorrect: evaluation.isCorrect ?? false,
          feedback: evaluation.feedback ?? null,
          errorType: evaluation.errorType ?? null,
        });
      } catch (error) {
        if (error instanceof GeminiQuotaError) {
          res.status(503).json({ error: "Quota API Gemini atteint." });
          return;
        }
        const message = error instanceof Error ? error.message : "Erreur inconnue";
        res.status(502).json({ error: `Erreur d'évaluation IA : ${message}` });
      }
    }),
  );

  // --- Reading / Lecture ---

  app.post(
    "/api/reading/generate",
    wrapAsync(async (req, res) => {
      const userId = getRequiredUserId(req);
      if (!isGeminiConfigured()) {
        res.status(503).json({ error: "Service IA non configuré." });
        return;
      }

      const bodySchema = z.object({
        tagIds: z.array(z.number().int().positive()).min(1),
        difficulty: z.enum(["debutant", "intermediaire"]),
        length: z.enum(["short", "medium", "long"]),
      });
      const body = bodySchema.parse(req.body);

      type VocabRow = { id: number; french: string; kana: string | null; kanji: string | null };
      const placeholders = body.tagIds.map(() => "?").join(",");
      const vocabularyRows = database
        .prepare(
          `SELECT DISTINCT w.id, w.french, w.kana, w.kanji FROM words w
         INNER JOIN word_tags wt ON wt.word_id = w.id
         WHERE wt.tag_id IN (${placeholders}) AND w.user_id = ?
         ORDER BY RANDOM()`,
        )
        .all(...body.tagIds, userId) as VocabRow[];

      if (vocabularyRows.length === 0) {
        res.status(400).json({ error: "Aucun mot trouvé." });
        return;
      }

      const vocabularyPool = vocabularyRows.slice(0, 30).map((row) => ({
        id: row.id,
        fr: row.french,
        jp: row.kanji ?? row.kana ?? "",
        kana: row.kana ?? "",
      }));

      const lengthLabels = { short: "3-4 phrases", medium: "5-6 phrases", long: "7-8 phrases" };
      const difficultyLabel =
        body.difficulty === "debutant"
          ? "débutant (N5, phrases simples)"
          : "intermédiaire (N4/N3, structures variées)";

      const prompt = `Tu es un professeur de japonais. Génère un texte court de lecture adapté au niveau ${difficultyLabel}, composé de ${lengthLabels[body.length]}.

Vocabulaire de l'élève à utiliser au maximum :
${JSON.stringify(
  vocabularyPool.map((v) => ({ fr: v.fr, jp: v.jp })),
  null,
  2,
)}

Le texte doit raconter une petite histoire cohérente du quotidien.

Après le texte, pose 2 questions de compréhension en français.

Réponds UNIQUEMENT au format JSON :
{
  "paragraphs": [
    {
      "japanese": "日本語の文",
      "french": "Traduction française",
      "words": [{"text": "日本語", "reading": "にほんご", "meaning": "japonais"}]
    }
  ],
  "questions": [
    {"question": "Question en français ?", "answer": "Réponse attendue"}
  ]
}`;

      try {
        const result = await callGeminiJson<{
          paragraphs: Array<{
            japanese: string;
            french: string;
            words: Array<{ text: string; reading: string; meaning: string }>;
          }>;
          questions: Array<{ question: string; answer: string }>;
        }>(prompt);
        incrementGeminiUsage(database);

        if (!result.paragraphs || !Array.isArray(result.paragraphs)) {
          res.status(502).json({ error: "L'IA n'a pas généré de texte valide." });
          return;
        }

        res.json({ ...result, quota: getGeminiQuota(database) });
      } catch (error) {
        if (error instanceof GeminiQuotaError) {
          res.status(503).json({ error: "Quota API Gemini atteint." });
          return;
        }
        const message = error instanceof Error ? error.message : "Erreur inconnue";
        res.status(502).json({ error: `Erreur de génération IA : ${message}` });
      }
    }),
  );

  app.post(
    "/api/reading/check-answer",
    wrapAsync(async (req, res) => {
      const userId = getRequiredUserId(req);
      if (!isGeminiConfigured()) {
        res.status(503).json({ error: "Service IA non configuré." });
        return;
      }

      const bodySchema = z.object({
        question: z.string().max(500),
        expectedAnswer: z.string().max(500),
        userAnswer: z.string().max(500),
      });
      const body = bodySchema.parse(req.body);

      const prompt = `Tu es un professeur. L'élève a lu un texte japonais et répond à une question de compréhension.

Question : "${body.question}"
Réponse attendue : "${body.expectedAnswer}"
Réponse de l'élève : "${body.userAnswer}"

Évalue si la réponse est correcte (même formulée différemment).
Réponds au format JSON : {"isCorrect": true/false, "feedback": "commentaire bref"}`;

      try {
        const evaluation = await callGeminiJson<{ isCorrect: boolean; feedback: string }>(prompt);
        incrementGeminiUsage(database);
        res.json(evaluation);
      } catch (error) {
        if (error instanceof GeminiQuotaError) {
          res.status(503).json({ error: "Quota API Gemini atteint." });
          return;
        }
        const message = error instanceof Error ? error.message : "Erreur inconnue";
        res.status(502).json({ error: `Erreur IA : ${message}` });
      }
    }),
  );
}

type WordExample = { jp: string; kana: string; fr: string };

function parseExamples(value: unknown): WordExample[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): WordExample | null => {
        if (typeof item !== "object" || item === null) return null;
        const record = item as Record<string, unknown>;
        const jp = typeof record.jp === "string" ? record.jp : "";
        const kana = typeof record.kana === "string" ? record.kana : "";
        const fr = typeof record.fr === "string" ? record.fr : "";
        if (!jp && !kana && !fr) return null;
        return { jp, kana, fr };
      })
      .filter((example): example is WordExample => example !== null)
      .slice(0, 3);
  } catch {
    return [];
  }
}

function serializeExamples(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const examples = value
    .map((item): WordExample | null => {
      if (typeof item !== "object" || item === null) return null;
      const record = item as Record<string, unknown>;
      const jp = typeof record.jp === "string" ? record.jp.trim() : "";
      const kana = typeof record.kana === "string" ? record.kana.trim() : "";
      const fr = typeof record.fr === "string" ? record.fr.trim() : "";
      if (!jp && !kana && !fr) return null;
      return { jp, kana, fr };
    })
    .filter((example): example is WordExample => example !== null)
    .slice(0, 3);
  if (examples.length === 0) return null;
  return JSON.stringify(examples);
}

function parseTagsConcat(value: unknown): Array<{ id: number; name: string }> {
  if (typeof value !== "string" || value.trim() === "") return [];
  const parts = value
    .split("||")
    .map((part) => part.trim())
    .filter(Boolean);
  const tags = parts
    .map((part) => {
      const [idPart, ...nameParts] = part.split(":");
      const id = Number(idPart);
      const name = nameParts.join(":").trim();
      if (!Number.isFinite(id) || !name) return null;
      return { id, name };
    })
    .filter((tag): tag is { id: number; name: string } => tag !== null);

  const uniqueById = new Map<number, { id: number; name: string }>();
  for (const tag of tags) {
    uniqueById.set(tag.id, tag);
  }
  return Array.from(uniqueById.values());
}

function parseTagNamesConcat(value: unknown): string[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  const names = value
    .split("||")
    .map((name) => name.trim())
    .filter(Boolean);
  return Array.from(new Set(names));
}

function getSessionUserId(req: Request): number | null {
  const userId = req.session.userId;
  if (!userId) return null;
  if (!Number.isFinite(userId)) return null;
  return userId;
}

function getRequiredUserId(req: Request): number {
  const userId = getSessionUserId(req);
  if (!userId || typeof userId !== "number") {
    throw new Error("Unauthorized");
  }
  return userId;
}
