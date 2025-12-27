import type Database from "better-sqlite3";
import { z } from "zod";

import { type ReviewResult, type WordStatsRow, applyReviewToStats } from "./db.js";

export function registerApiRoutes(app: import("express").Express, database: Database.Database) {
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/tags", (_req, res) => {
    const rows = database.prepare("SELECT id, name, created_at FROM tags ORDER BY name ASC").all();
    res.json({ tags: rows });
  });

  app.post("/api/tags", (req, res) => {
    const bodySchema = z.object({
      name: z.string().min(1),
    });
    const body = bodySchema.parse(req.body);

    const trimmedName = body.name.trim();
    if (!trimmedName) {
      res.status(400).json({ error: "Tag name is required" });
      return;
    }

    database.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").run(trimmedName);
    const createdOrExistingTag = database
      .prepare("SELECT id, name, created_at FROM tags WHERE name = ?")
      .get(trimmedName);

    res.status(201).json({ tag: createdOrExistingTag });
  });

  app.delete("/api/tags/:id", (req, res) => {
    const tagId = Number(req.params.id);
    if (!Number.isFinite(tagId)) {
      res.status(400).json({ error: "Invalid tag id" });
      return;
    }
    database.prepare("DELETE FROM tags WHERE id = ?").run(tagId);
    res.status(204).send();
  });

  app.get("/api/words", (req, res) => {
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
    `;

    if (!includeStats && !includeTags) {
      const rows = database.prepare(`${baseSelect} ORDER BY w.id DESC`).all();
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
        LEFT JOIN tags t ON t.id = wt.tag_id
        GROUP BY w.id
        ORDER BY w.id DESC
      `,
      )
      .all() as WordJoinedRow[];

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
      "INSERT INTO words (french, romaji, kana, kanji, note) VALUES (?, ?, ?, ?, ?)",
    );
    const insertResult = insertWordStatement.run(
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
      for (const tagId of body.tagIds) {
        insertWordTagStatement.run(wordId, tagId);
      }
    }

    const createdWord = database
      .prepare("SELECT id, french, romaji, kana, kanji, note, created_at FROM words WHERE id = ?")
      .get(wordId);

    res.status(201).json({ word: createdWord });
  });

  app.put("/api/words/:id", (req, res) => {
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

    database
      .prepare(
        "UPDATE words SET french = ?, romaji = ?, kana = ?, kanji = ?, note = ? WHERE id = ?",
      )
      .run(
        body.french,
        body.romaji ?? null,
        body.kana ?? null,
        body.kanji ?? null,
        body.note ?? null,
        wordId,
      );

    const updatedWord = database
      .prepare("SELECT id, french, romaji, kana, kanji, note, created_at FROM words WHERE id = ?")
      .get(wordId);

    if (body.tagIds) {
      database.prepare("DELETE FROM word_tags WHERE word_id = ?").run(wordId);
      const insertWordTagStatement = database.prepare(
        "INSERT OR IGNORE INTO word_tags (word_id, tag_id) VALUES (?, ?)",
      );
      for (const tagId of body.tagIds) {
        insertWordTagStatement.run(wordId, tagId);
      }
    }

    res.json({ word: updatedWord });
  });

  app.delete("/api/words/:id", (req, res) => {
    const wordId = Number(req.params.id);
    if (!Number.isFinite(wordId)) {
      res.status(400).json({ error: "Invalid word id" });
      return;
    }

    database.prepare("DELETE FROM words WHERE id = ?").run(wordId);
    res.status(204).send();
  });

  app.post("/api/reviews", (req, res) => {
    const bodySchema = z.object({
      wordId: z.number().int().positive(),
      result: z.enum(["success", "partial", "fail"]),
    });
    const body = bodySchema.parse(req.body);

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

  app.get("/api/series", (_req, res) => {
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
          COUNT(DISTINCT wt.word_id) AS words_count,
          COALESCE(SUM(s.score), 0) AS total_score
        FROM tags t
        LEFT JOIN word_tags wt ON wt.tag_id = t.id
        LEFT JOIN word_stats s ON s.word_id = wt.word_id
        GROUP BY t.id
        ORDER BY t.name ASC
      `,
      )
      .all() as SeriesRow[];

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
        LEFT JOIN word_stats s ON s.word_id = w.id
        WHERE wt.tag_id = ?
        ORDER BY w.id DESC
      `,
      )
      .all(tagId);

    res.json({ words: rows });
  });

  app.get("/api/words/difficult", (req, res) => {
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
          COALESCE(s.score, 0) <= ?
          OR (
            (COALESCE(s.success_count, 0) + COALESCE(s.partial_count, 0) + COALESCE(s.fail_count, 0)) >= ?
            AND (
              (CAST(COALESCE(s.fail_count, 0) AS REAL) / NULLIF((COALESCE(s.success_count, 0) + COALESCE(s.partial_count, 0) + COALESCE(s.fail_count, 0)), 0))
            ) > ?
          )
        ORDER BY COALESCE(s.score, 0) ASC, w.id DESC
      `,
      )
      .all(scoreThreshold, minAttempts, failRateThreshold);

    res.json({ words: rows, params: { scoreThreshold, failRateThreshold, minAttempts } });
  });

  app.get("/api/export", (_req, res) => {
    const tags = database.prepare("SELECT id, name, created_at FROM tags ORDER BY name ASC").all();
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
        LEFT JOIN tags t ON t.id = wt.tag_id
        GROUP BY w.id
        ORDER BY w.id ASC
      `,
      )
      .all() as ExportWordRow[];

    const words = wordRows.map((row) => {
      const tagNames = parseTagNamesConcat(row.tag_names_concat);
      const { tag_names_concat, ...restRow } = row;
      return { ...restRow, tags: tagNames };
    });

    res.json({ version: 1, exportedAt: new Date().toISOString(), tags, words });
  });

  app.post("/api/import", (req, res) => {
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

    const createTagStatement = database.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)");
    const selectTagIdByNameStatement = database.prepare("SELECT id FROM tags WHERE name = ?");
    const insertWordStatement = database.prepare(
      "INSERT INTO words (french, romaji, kana, kanji, note) VALUES (?, ?, ?, ?, ?)",
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
          const createTagResult = createTagStatement.run(tagName);
          if (createTagResult.changes > 0) {
            importedTagsCount += 1;
          }
          const tagRow = selectTagIdByNameStatement.get(tagName) as { id: number } | undefined;
          if (tagRow) {
            insertWordTagStatement.run(insertedWordId, tagRow.id);
          }
        }
      }
    });

    transaction();

    res.status(201).json({ importedWordsCount, importedTagsCount });
  });
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
