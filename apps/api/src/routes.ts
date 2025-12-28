import type Database from "better-sqlite3";
import { z } from "zod";

import type { Request } from "express";

import { type PublicUser, hashPassword, verifyPassword } from "./auth.js";
import { type ReviewResult, type WordStatsRow, applyReviewToStats } from "./db.js";
import {
  downloadKanjiSvgsFromText,
  downloadMissingKanjiSvgs,
} from "./kanji-downloader.js";

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
      .prepare("SELECT id, username, created_at FROM users WHERE id = ?")
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
          .prepare("SELECT id, username, created_at FROM users WHERE id = ?")
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
        .prepare("SELECT id, username, password_hash, created_at FROM users WHERE username = ?")
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
        "SELECT word_id, success_count, partial_count, fail_count, score, last_reviewed_at FROM word_stats WHERE word_id = ?",
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
        SET success_count = ?, partial_count = ?, fail_count = ?, score = ?, last_reviewed_at = ?
        WHERE word_id = ?
      `,
      )
      .run(
        updatedStats.success_count,
        updatedStats.partial_count,
        updatedStats.fail_count,
        updatedStats.score,
        updatedStats.last_reviewed_at,
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
      "SELECT word_id, success_count, partial_count, fail_count, score, last_reviewed_at FROM word_stats WHERE word_id = ?",
    );
    const upsertStatsStatement = database.prepare(
      "INSERT OR IGNORE INTO word_stats (word_id) VALUES (?)",
    );
    const updateStatsStatement = database.prepare(
      `
        UPDATE word_stats
        SET success_count = ?, partial_count = ?, fail_count = ?, score = ?, last_reviewed_at = ?
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
    };

    const seriesRows = database
      .prepare(
        `
        SELECT
          t.id AS tag_id,
          t.name AS tag_name,
          COUNT(DISTINCT w.id) AS words_count,
          COALESCE(SUM(s.score), 0) AS total_score
        FROM tags t
        LEFT JOIN word_tags wt ON wt.tag_id = t.id
        LEFT JOIN words w ON w.id = wt.word_id AND w.user_id = ?
        LEFT JOIN word_stats s ON s.word_id = w.id
        WHERE t.user_id = ?
        GROUP BY t.id
        ORDER BY t.name ASC
      `,
      )
      .all(userId, userId) as SeriesRow[];

    res.json({
      series: seriesRows.map((row) => ({
        tagId: row.tag_id,
        tagName: row.tag_name,
        wordsCount: row.words_count,
        totalScore: row.total_score,
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
  // The /api auth middleware above guarantees this exists for protected routes.
  // In case of misconfiguration, returning 0 scopes queries to nothing instead of crashing the server.
  return userId ?? 0;
}
