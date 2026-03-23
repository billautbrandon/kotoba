import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import type Database from "better-sqlite3";
import { MsEdgeTTS, OUTPUT_FORMAT } from "edge-tts-node";
import multer from "multer";
import { z } from "zod";

import type { Request } from "express";

import { type PublicUser, hashPassword, verifyPassword } from "./auth.js";
import {
  type ReviewResult,
  type WordStatsRow,
  applyReviewToStats,
  getGeminiQuota,
  incrementGeminiUsage,
} from "./db.js";
import { GeminiApiError, GeminiQuotaError, callGeminiJson, isGeminiConfigured } from "./gemini.js";
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

      const avatarsDir = path.join(process.cwd(), "data", "avatars");
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
        w.created_at
      FROM words w
      WHERE w.user_id = ?
    `;

    if (!includeStats && !includeTags) {
      const rows = database.prepare(`${baseSelect} ORDER BY w.id DESC`).all(userId);
      res.json({ words: rows });
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
      created_at: string;
      success_count: number;
      partial_count: number;
      fail_count: number;
      score: number;
      last_reviewed_at: string | null;
      tags_concat: string | null;
    };

    type WordWithStatsColumns = Omit<WordJoinedRow, "tags_concat">;
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
      if (!includeTags) {
        return restRow;
      }
      return { ...restRow, tags: parsedTags };
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
      tagIds: z.array(z.number().int().positive()).optional(),
    });
    const body = bodySchema.parse(req.body);

    const insertWordStatement = database.prepare(
      "INSERT INTO words (user_id, french, romaji, kana, kanji, note) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const insertResult = insertWordStatement.run(
      userId,
      body.french,
      body.romaji ?? null,
      body.kana ?? null,
      body.kanji ?? null,
      body.note ?? null,
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

    const createdWord = database
      .prepare(
        "SELECT id, french, romaji, kana, kanji, note, created_at FROM words WHERE id = ? AND user_id = ?",
      )
      .get(wordId, userId);

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
      tagIds: z.array(z.number().int().positive()).optional(),
    });
    const body = bodySchema.parse(req.body);

    // Récupérer l'ancien kanji pour comparer
    const oldWord = database
      .prepare("SELECT kanji FROM words WHERE id = ? AND user_id = ?")
      .get(wordId, userId) as { kanji: string | null } | undefined;

    const updateResult = database
      .prepare(
        "UPDATE words SET french = ?, romaji = ?, kana = ?, kanji = ?, note = ? WHERE id = ? AND user_id = ?",
      )
      .run(
        body.french,
        body.romaji ?? null,
        body.kana ?? null,
        body.kanji ?? null,
        body.note ?? null,
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

    const updatedWord = database
      .prepare(
        "SELECT id, french, romaji, kana, kanji, note, created_at FROM words WHERE id = ? AND user_id = ?",
      )
      .get(wordId, userId);

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
        "SELECT word_id, success_count, partial_count, fail_count, score, last_reviewed_at, COALESCE(consecutive_success_count, 0) AS consecutive_success_count FROM word_stats WHERE word_id = ?",
      )
      .get(body.wordId) as WordStatsRow | undefined;

    if (!existingStats) {
      res.status(404).json({ error: "Stats not found" });
      return;
    }

    const updatedStats = applyReviewToStats(existingStats, body.result as ReviewResult);
    database
      .prepare(
        `
        UPDATE word_stats
        SET success_count = ?, partial_count = ?, fail_count = ?, score = ?, last_reviewed_at = ?, consecutive_success_count = ?
        WHERE word_id = ?
      `,
      )
      .run(
        updatedStats.success_count,
        updatedStats.partial_count,
        updatedStats.fail_count,
        updatedStats.score,
        updatedStats.last_reviewed_at,
        updatedStats.consecutive_success_count,
        updatedStats.word_id,
      );

    res.json({ stats: updatedStats });
  });

  app.post("/api/reviews/bulk", (req, res) => {
    const userId = getRequiredUserId(req);
    const bodySchema = z.object({
      reviews: z.array(
        z.object({
          wordId: z.number().int().positive(),
          result: z.enum(["success", "partial", "fail"]),
        }),
      ),
    });
    const body = bodySchema.parse(req.body);

    const wordBelongsToUserStatement = database.prepare(
      "SELECT 1 FROM words WHERE id = ? AND user_id = ?",
    );
    const selectStatsStatement = database.prepare(
      "SELECT word_id, success_count, partial_count, fail_count, score, last_reviewed_at, COALESCE(consecutive_success_count, 0) AS consecutive_success_count FROM word_stats WHERE word_id = ?",
    );
    const upsertStatsStatement = database.prepare(
      "INSERT OR IGNORE INTO word_stats (word_id) VALUES (?)",
    );
    const updateStatsStatement = database.prepare(
      `
        UPDATE word_stats
        SET success_count = ?, partial_count = ?, fail_count = ?, score = ?, last_reviewed_at = ?, consecutive_success_count = ?
        WHERE word_id = ?
      `,
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
          updatedStats.word_id,
        );
        appliedCount += 1;
      }
    });

    transaction();

    res.status(201).json({ appliedCount });
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
      .all(tagId, userId, userId);

    res.json({ words: rows });
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
      .all(userId, scoreThreshold, minAttempts, failRateThreshold);

    res.json({ words: rows, params: { scoreThreshold, failRateThreshold, minAttempts } });
  });

  const srsWordSelect = `
    SELECT
      w.id,
      w.french,
      w.romaji,
      w.kana,
      w.kanji,
      w.note,
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

    res.json({
      hard: hardRowsFiltered,
      medium: mediumRows,
      easy: easyRows,
      mastered: masteredRows,
    });
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
      return { ...restRow, tags: tagNames };
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
      "INSERT INTO words (user_id, french, romaji, kana, kanji, note) VALUES (?, ?, ?, ?, ?, ?)",
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

      const prompt = `Tu es un professeur de japonais. En utilisant UNIQUEMENT le vocabulaire fourni ci-dessous (et des verbes de base courants si nécessaire comme ある、いる、する、行く、食べる、見る、飲む), génère exactement ${body.count} phrases uniques.

Vocabulaire disponible (utilise au maximum ces mots) :
${JSON.stringify(
  vocabularyPool.map((v) => ({ fr: v.fr, jp: v.jp, kana: v.kana })),
  null,
  2,
)}

Contraintes strictes :
- Particules à utiliser : ${body.particles.join(", ")}
- Temps : ${tenseLabels[body.tense] ?? body.tense}
- Polarité : ${polarityLabels[body.polarity] ?? body.polarity}
- Style de politesse : ${politenessLabels[body.politeness] ?? body.politeness}
- Utilise un japonais naturel, pas de phrases de manuels scolaires rigides.
- Chaque phrase doit utiliser au moins un mot du vocabulaire fourni.
- Chaque phrase doit utiliser au moins une des particules demandées.
- L'élève apprend les kanji, donc écrire en kana est acceptable.
${body.customContext ? `\nContexte additionnel de l'élève : ${body.customContext}\n` : ""}
Réponds UNIQUEMENT au format JSON, un tableau d'objets avec cette structure exacte :
[{"fr": "La phrase en français", "jp_kanji": "La phrase en japonais avec kanji", "jp_kana": "La phrase en japonais tout en hiragana/katakana", "explanation": "Brève explication grammaticale de la phrase", "used_words_fr": ["mot1_fr", "mot2_fr"]}]

Le champ used_words_fr doit contenir les mots français du vocabulaire fourni qui ont été utilisés dans chaque phrase.`;

      type GeminiPhrase = {
        fr: string;
        jp_kanji: string;
        jp_kana: string;
        explanation: string;
        used_words_fr?: string[];
      };

      let generatedPhrases: GeminiPhrase[];
      try {
        generatedPhrases = await callGeminiJson<GeminiPhrase[]>(prompt);
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
      getRequiredUserId(req);

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
      });
      const body = bodySchema.parse(req.body);

      const normalizedUser = body.userAnswer.trim().normalize("NFKC");
      const normalizedExpected = body.expectedAnswer.trim().normalize("NFKC");

      if (normalizedUser === normalizedExpected) {
        res.json({ isCorrect: true, feedback: null, errorType: null });
        return;
      }

      const prompt = `Tu es un professeur de japonais bienveillant. Un élève devait traduire cette phrase française en japonais :

Phrase française : "${body.frenchSentence}"
Réponse attendue : "${body.expectedAnswer}"
Réponse de l'élève : "${body.userAnswer}"

Analyse la réponse de l'élève et réponds UNIQUEMENT au format JSON avec cette structure exacte :
{"isCorrect": false, "errorType": "particle|conjugation|kanji|other", "feedback": "Ton conseil pédagogique ici"}

Règles :
- Si la réponse est correcte ou acceptable (même si formulée différemment), mets isCorrect à true et errorType à null.
- L'élève apprend les kanji. Si la réponse est écrite en kana au lieu des kanji mais est autrement correcte, considère-la comme correcte.
- errorType doit être "particle" si l'erreur porte sur une particule, "conjugation" si c'est une erreur de conjugaison/temps, "kanji" si c'est uniquement un problème de kanji, "other" sinon.
- Le feedback doit être en français, court (2-3 phrases max), pédagogique et encourageant. Explique la nuance ou l'erreur précise.`;

      type EvalResult = {
        isCorrect: boolean;
        errorType: "particle" | "conjugation" | "kanji" | "other" | null;
        feedback: string | null;
      };

      try {
        const evaluation = await callGeminiJson<EvalResult>(prompt);
        incrementGeminiUsage(database);
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

      const frenchTts = new MsEdgeTTS({});
      await frenchTts.setMetadata(
        "fr-FR-DeniseNeural",
        OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
      );

      const japaneseTts = new MsEdgeTTS({});
      await japaneseTts.setMetadata(
        "ja-JP-NanamiNeural",
        OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
      );

      const audioChunks: Buffer[] = [];
      const silenceMs = 800;
      const silenceBytes = Math.floor((48000 / 8) * (silenceMs / 1000));
      const silenceBuffer = Buffer.alloc(silenceBytes, 0);

      for (const word of wordRows) {
        const frenchText = word.french;
        const japaneseText = word.kana || "";

        if (frenchText) {
          const frenchAudio = await streamToBuffer(frenchTts.toStream(frenchText, { rate: 0.9 }));
          audioChunks.push(frenchAudio);
          audioChunks.push(silenceBuffer);
        }

        if (japaneseText) {
          const japaneseAudio = await streamToBuffer(
            japaneseTts.toStream(japaneseText, { rate: 0.85 }),
          );
          audioChunks.push(japaneseAudio);
          audioChunks.push(silenceBuffer);
        }
      }

      frenchTts.close();
      japaneseTts.close();

      const fullAudio = Buffer.concat(audioChunks);
      const safeTagName = tag.name.replace(/[^a-zA-Z0-9\u00C0-\u024F\u3000-\u9FFF_-]/g, "_");
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Disposition", `attachment; filename="${safeTagName}.mp3"`);
      res.setHeader("Content-Length", fullAudio.length);
      res.send(fullAudio);
    }),
  );
}

async function streamToBuffer(readable: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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
