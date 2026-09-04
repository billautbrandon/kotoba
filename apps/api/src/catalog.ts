import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type Database from "better-sqlite3";

import { computeSrsSchedule } from "./db.js";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = path.dirname(currentFilePath);

function resolveCatalogDataDirectory(): string {
  const besideSource = path.join(currentDirectoryPath, "data");
  if (fs.existsSync(path.join(besideSource, "openjlpt-n5-vocab.json"))) return besideSource;
  return path.join(currentDirectoryPath, "../src/data");
}

const dataDirectoryPath = resolveCatalogDataDirectory();

export type CatalogKanjiPart = {
  char: string;
  meaning: string;
  reading: string;
};

export type CatalogExample = {
  jp: string;
  kana: string;
  fr: string;
};

export type CatalogEntryRow = {
  id: number;
  jlpt_level: string;
  kanji: string | null;
  kana: string;
  romaji: string | null;
  french: string;
  sense_context: string | null;
  mnemonic: string | null;
  kanji_breakdown: string | null;
  examples: string | null;
  confusion_group: string | null;
  search_text: string;
  sort_order: number;
};

export type CatalogUserState = "idle" | "queued" | "learning" | "known";

export type CatalogListItem = {
  id: number;
  jlpt_level: string;
  kanji: string | null;
  kana: string;
  romaji: string | null;
  french: string;
  sense_context: string | null;
  mnemonic: string | null;
  kanji_breakdown: CatalogKanjiPart[];
  examples: CatalogExample[];
  confusion_group: string | null;
  sort_order: number;
  state: CatalogUserState;
  word_id: number | null;
};

type OpenJlptVocab = {
  word: string;
  reading: string;
  meanings: string[];
  level: string;
  examples?: Array<{ ja: string; en: string }>;
};

type OpenJlptKanji = {
  character: string;
  meanings: string[];
  kunyomi: string[];
  onyomi: string[];
};

const CONFUSION_GROUPS: Record<string, string> = {
  着る: "wear",
  はく: "wear",
  履く: "wear",
  脱ぐ: "wear",
  かぶる: "wear",
  被る: "wear",
  父: "family",
  お父さん: "family",
  母: "family",
  お母さん: "family",
  兄: "family",
  お兄さん: "family",
  姉: "family",
  お姉さん: "family",
  弟: "family",
  妹: "family",
  今日: "time-relative",
  明日: "time-relative",
  昨日: "time-relative",
  あさって: "time-relative",
  おととい: "time-relative",
  これ: "demonstrative",
  それ: "demonstrative",
  あれ: "demonstrative",
  この: "demonstrative",
  その: "demonstrative",
  あの: "demonstrative",
  ここ: "place-deictic",
  そこ: "place-deictic",
  あそこ: "place-deictic",
  行く: "motion",
  来る: "motion",
  帰る: "motion",
  出る: "motion",
  入る: "motion",
  ある: "existence",
  いる: "existence",
};

const SENSE_OVERRIDES: Record<string, string> = {
  着る: "vêtements / haut du corps",
  はく: "jambes / pieds",
  履く: "jambes / pieds",
  脱ぐ: "enlever un vêtement",
  かぶる: "la tête",
  被る: "la tête",
  ある: "objets inanimés",
  いる: "personnes et animaux",
};

const KANJI_FR: Record<string, string> = {
  day: "jour",
  sun: "soleil",
  Japan: "Japon",
  one: "un",
  country: "pays",
  person: "personne",
  year: "année",
  large: "grand",
  big: "grand",
  ten: "dix",
  two: "deux",
  book: "livre",
  present: "présent",
  main: "principal",
  origin: "origine",
  in: "dans",
  inside: "intérieur",
  middle: "milieu",
  long: "long",
  leader: "chef",
  exit: "sortie",
  leave: "quitter",
  three: "trois",
  time: "temps",
  hour: "heure",
  going: "aller",
  see: "voir",
  month: "mois",
  moon: "lune",
  behind: "derrière",
  later: "plus tard",
  "in front": "devant",
  before: "avant",
  life: "vie",
  five: "cinq",
  interval: "intervalle",
  space: "espace",
  above: "au-dessus",
  up: "haut",
  east: "est",
  four: "quatre",
  now: "maintenant",
  gold: "or",
  nine: "neuf",
  enter: "entrer",
  study: "étude",
  learning: "apprentissage",
  tall: "haut",
  high: "haut",
  expensive: "cher",
  circle: "cercle",
  yen: "yen",
  child: "enfant",
  outside: "extérieur",
  eight: "huit",
  six: "six",
  below: "dessous",
  down: "bas",
  come: "venir",
  spirit: "esprit",
  mind: "esprit",
  little: "petit",
  small: "petit",
  seven: "sept",
  mountain: "montagne",
  tale: "histoire",
  talk: "parler",
  woman: "femme",
  north: "nord",
  noon: "midi",
  hundred: "cent",
  write: "écrire",
  name: "nom",
  stream: "cours d’eau",
  river: "rivière",
  thousand: "mille",
  water: "eau",
  half: "moitié",
  male: "homme",
  west: "ouest",
  electricity: "électricité",
  exam: "examen",
  school: "école",
  word: "mot",
  speech: "parole",
  language: "langue",
  soil: "sol",
  earth: "terre",
  tree: "arbre",
  wood: "bois",
  hear: "entendre",
  ask: "demander",
  eat: "manger",
  food: "nourriture",
  car: "voiture",
  what: "quoi",
  south: "sud",
  "ten thousand": "dix mille",
  every: "chaque",
  white: "blanc",
  heavens: "cieux",
  sky: "ciel",
  mother: "mère",
  fire: "feu",
  right: "droite",
  read: "lire",
  friend: "ami",
  left: "gauche",
  rest: "repos",
  father: "père",
  rain: "pluie",
};

const HIRAGANA_ROMAJI: Array<[string, string]> = [
  ["きゃ", "kya"],
  ["きゅ", "kyu"],
  ["きょ", "kyo"],
  ["しゃ", "sha"],
  ["しゅ", "shu"],
  ["しょ", "sho"],
  ["ちゃ", "cha"],
  ["ちゅ", "chu"],
  ["ちょ", "cho"],
  ["にゃ", "nya"],
  ["にゅ", "nyu"],
  ["にょ", "nyo"],
  ["ひゃ", "hya"],
  ["ひゅ", "hyu"],
  ["ひょ", "hyo"],
  ["みゃ", "mya"],
  ["みゅ", "myu"],
  ["みょ", "myo"],
  ["りゃ", "rya"],
  ["りゅ", "ryu"],
  ["りょ", "ryo"],
  ["ぎゃ", "gya"],
  ["ぎゅ", "gyu"],
  ["ぎょ", "gyo"],
  ["じゃ", "ja"],
  ["じゅ", "ju"],
  ["じょ", "jo"],
  ["びゃ", "bya"],
  ["びゅ", "byu"],
  ["びょ", "byo"],
  ["ぴゃ", "pya"],
  ["ぴゅ", "pyu"],
  ["ぴょ", "pyo"],
  ["あ", "a"],
  ["い", "i"],
  ["う", "u"],
  ["え", "e"],
  ["お", "o"],
  ["か", "ka"],
  ["き", "ki"],
  ["く", "ku"],
  ["け", "ke"],
  ["こ", "ko"],
  ["さ", "sa"],
  ["し", "shi"],
  ["す", "su"],
  ["せ", "se"],
  ["そ", "so"],
  ["た", "ta"],
  ["ち", "chi"],
  ["つ", "tsu"],
  ["て", "te"],
  ["と", "to"],
  ["な", "na"],
  ["に", "ni"],
  ["ぬ", "nu"],
  ["ね", "ne"],
  ["の", "no"],
  ["は", "ha"],
  ["ひ", "hi"],
  ["ふ", "fu"],
  ["へ", "he"],
  ["ほ", "ho"],
  ["ま", "ma"],
  ["み", "mi"],
  ["む", "mu"],
  ["め", "me"],
  ["も", "mo"],
  ["や", "ya"],
  ["ゆ", "yu"],
  ["よ", "yo"],
  ["ら", "ra"],
  ["り", "ri"],
  ["る", "ru"],
  ["れ", "re"],
  ["ろ", "ro"],
  ["わ", "wa"],
  ["を", "o"],
  ["ん", "n"],
  ["が", "ga"],
  ["ぎ", "gi"],
  ["ぐ", "gu"],
  ["げ", "ge"],
  ["ご", "go"],
  ["ざ", "za"],
  ["じ", "ji"],
  ["ず", "zu"],
  ["ぜ", "ze"],
  ["ぞ", "zo"],
  ["だ", "da"],
  ["ぢ", "ji"],
  ["づ", "zu"],
  ["で", "de"],
  ["ど", "do"],
  ["ば", "ba"],
  ["び", "bi"],
  ["ぶ", "bu"],
  ["べ", "be"],
  ["ぼ", "bo"],
  ["ぱ", "pa"],
  ["ぴ", "pi"],
  ["ぷ", "pu"],
  ["ぺ", "pe"],
  ["ぽ", "po"],
  ["ぁ", "a"],
  ["ぃ", "i"],
  ["ぅ", "u"],
  ["ぇ", "e"],
  ["ぉ", "o"],
  ["っ", ""],
  ["ー", ""],
];

function kanaToRomaji(kana: string): string {
  let remaining = kana.replace(/[ァ-ヶ]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0x60),
  );
  let romaji = "";
  while (remaining.length > 0) {
    if (remaining[0] === "っ" && remaining.length > 1) {
      const nextChunk = HIRAGANA_ROMAJI.find((pair) => remaining.startsWith(pair[0], 1));
      const nextSound = nextChunk?.[1] ?? "";
      romaji += nextSound.charAt(0) || "t";
      remaining = remaining.slice(1);
      continue;
    }
    const match = HIRAGANA_ROMAJI.find((pair) => remaining.startsWith(pair[0]));
    if (match) {
      romaji += match[1];
      remaining = remaining.slice(match[0].length);
    } else {
      romaji += remaining[0];
      remaining = remaining.slice(1);
    }
  }
  return romaji;
}

function hasKanji(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function loadJsonFile<T>(fileName: string): T {
  const filePath = path.join(dataDirectoryPath, fileName);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function translateGloss(english: string, glosses: Record<string, string>): string {
  return glosses[english] ?? english;
}

function firstReading(reading: string, word: string): string {
  const cleaned = reading.split("/")[0]?.trim() ?? "";
  if (cleaned) return cleaned;
  return word;
}

function buildKanjiBreakdown(
  word: string,
  kana: string,
  kanjiByChar: Map<string, OpenJlptKanji>,
  glosses: Record<string, string>,
): CatalogKanjiPart[] {
  const parts: CatalogKanjiPart[] = [];
  for (const character of word) {
    if (!hasKanji(character)) continue;
    const kanjiRow = kanjiByChar.get(character);
    const englishMeaning = kanjiRow?.meanings[0] ?? "";
    const meaning =
      KANJI_FR[englishMeaning] ?? (translateGloss(englishMeaning, glosses) || "kanji");
    const reading = kanjiRow?.kunyomi[0]?.replace(/[.-]/g, "") || kana;
    parts.push({ char: character, meaning, reading });
  }
  return parts;
}

function buildMnemonic(
  word: string,
  french: string,
  senseContext: string | null,
  breakdown: CatalogKanjiPart[],
): string {
  if (breakdown.length > 0) {
    const parts = breakdown.map((part) => `${part.char} (${part.meaning})`).join(" + ");
    const extra = senseContext ? ` — ${senseContext}` : "";
    return `${parts} → ${french}${extra}.`;
  }
  return `On retient ${word} : ${french}${senseContext ? ` (${senseContext})` : ""}.`;
}

function exampleKanaHint(japanese: string, wordKana: string): string {
  if (!hasKanji(japanese)) return japanese;
  return wordKana;
}

export function seedCatalog(database: Database.Database): void {
  const vocabPath = path.join(dataDirectoryPath, "openjlpt-n5-vocab.json");
  if (!fs.existsSync(vocabPath)) {
    console.warn(`[kotoba/api] catalog data missing in ${dataDirectoryPath}, skipping seed`);
    return;
  }

  const vocab = loadJsonFile<OpenJlptVocab[]>("openjlpt-n5-vocab.json");
  const kanjiList = loadJsonFile<OpenJlptKanji[]>("openjlpt-n5-kanji.json");
  const glosses = loadJsonFile<Record<string, string>>("french-glosses.json");
  const kanjiByChar = new Map(kanjiList.map((row) => [row.character, row]));

  const extras: OpenJlptVocab[] = [];
  if (!vocab.some((entry) => entry.word === "かぶる")) {
    extras.push({
      word: "かぶる",
      reading: "かぶる",
      meanings: ["to wear"],
      level: "N5",
      examples: [{ ja: "帽子をかぶる。", en: "I put on a hat." }],
    });
  }

  const insert = database.prepare(
    `INSERT INTO catalog_entries (
       jlpt_level, kanji, kana, romaji, french, sense_context, mnemonic,
       kanji_breakdown, examples, confusion_group, search_text, sort_order
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(jlpt_level, kana, french) DO UPDATE SET
       kanji = excluded.kanji,
       romaji = excluded.romaji,
       sense_context = excluded.sense_context,
       mnemonic = excluded.mnemonic,
       kanji_breakdown = excluded.kanji_breakdown,
       examples = excluded.examples,
       confusion_group = excluded.confusion_group,
       search_text = excluded.search_text,
       sort_order = excluded.sort_order`,
  );

  const transaction = database.transaction(() => {
    let sortOrder = 1;
    for (const entry of [...vocab, ...extras]) {
      const kana = firstReading(entry.reading, entry.word);
      const kanji = hasKanji(entry.word) ? entry.word : null;
      const french = entry.meanings
        .map((meaning) => translateGloss(meaning, glosses))
        .filter((value, index, list) => list.indexOf(value) === index)
        .join(" ; ");
      const senseContext =
        SENSE_OVERRIDES[entry.word] ?? (entry.meanings.length > 1 ? french : null);
      const confusionGroup = CONFUSION_GROUPS[entry.word] ?? null;
      const breakdown = buildKanjiBreakdown(entry.word, kana, kanjiByChar, glosses);
      const mnemonic = buildMnemonic(
        entry.word,
        french.split(" ; ")[0] ?? french,
        senseContext,
        breakdown,
      );
      const examples: CatalogExample[] = (entry.examples ?? []).slice(0, 2).map((example) => ({
        jp: example.ja,
        kana: exampleKanaHint(example.ja, kana),
        fr:
          translateGloss(example.en, glosses) === example.en
            ? example.en
            : translateGloss(example.en, glosses),
      }));
      if (entry.word === "かぶる" && examples.length === 0) {
        examples.push({
          jp: "帽子をかぶる。",
          kana: "ぼうしをかぶる。",
          fr: "Je mets un chapeau.",
        });
      }
      if (entry.word === "かぶる") {
        examples[0] = { jp: "帽子をかぶる。", kana: "ぼうしをかぶる", fr: "Porter (sur la tête)." };
      }
      const romaji = kanaToRomaji(kana);
      const searchText = [
        french,
        kana,
        kanji ?? "",
        romaji,
        senseContext ?? "",
        confusionGroup ?? "",
      ]
        .join(" ")
        .toLowerCase();
      insert.run(
        "N5",
        kanji,
        kana,
        romaji,
        french,
        senseContext,
        mnemonic,
        JSON.stringify(breakdown),
        JSON.stringify(examples),
        confusionGroup,
        searchText,
        sortOrder,
      );
      sortOrder += 1;
    }
  });
  transaction();
}

function parseJsonArray<T>(value: string | null, fallback: T[]): T[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

export function parseCatalogBreakdown(value: string | null): CatalogKanjiPart[] {
  return parseJsonArray<CatalogKanjiPart>(value, []);
}

export function parseCatalogExamples(value: string | null): CatalogExample[] {
  return parseJsonArray<CatalogExample>(value, []);
}

function catalogStateFromStats(row: {
  word_id: number | null;
  intro_stage: number | null;
  queued_at: string | null;
  srs_next_review_at: string | null;
}): CatalogUserState {
  if (!row.word_id) return "idle";
  if ((row.intro_stage ?? 0) >= 5 && row.srs_next_review_at) return "known";
  if (row.queued_at && (row.intro_stage ?? 0) === 0 && !row.srs_next_review_at) return "queued";
  return "learning";
}

function mapCatalogListItem(
  row: CatalogEntryRow & {
    word_id: number | null;
    intro_stage: number | null;
    queued_at: string | null;
    srs_next_review_at: string | null;
  },
): CatalogListItem {
  return {
    id: row.id,
    jlpt_level: row.jlpt_level,
    kanji: row.kanji,
    kana: row.kana,
    romaji: row.romaji,
    french: row.french,
    sense_context: row.sense_context,
    mnemonic: row.mnemonic,
    kanji_breakdown: parseCatalogBreakdown(row.kanji_breakdown),
    examples: parseCatalogExamples(row.examples),
    confusion_group: row.confusion_group,
    sort_order: row.sort_order,
    state: catalogStateFromStats(row),
    word_id: row.word_id,
  };
}

const CATALOG_SELECT = `
  SELECT
    c.id, c.jlpt_level, c.kanji, c.kana, c.romaji, c.french, c.sense_context,
    c.mnemonic, c.kanji_breakdown, c.examples, c.confusion_group, c.search_text, c.sort_order,
    w.id AS word_id,
    COALESCE(s.intro_stage, 0) AS intro_stage,
    s.queued_at AS queued_at,
    s.srs_next_review_at AS srs_next_review_at
  FROM catalog_entries c
  LEFT JOIN words w ON w.catalog_entry_id = c.id AND w.user_id = ?
  LEFT JOIN word_stats s ON s.word_id = w.id
`;

export function searchCatalog(
  database: Database.Database,
  userId: number,
  query: string,
  level = "N5",
): CatalogListItem[] {
  const trimmed = query.trim().toLowerCase();
  const rows = (
    trimmed
      ? database
          .prepare(
            `${CATALOG_SELECT} WHERE c.jlpt_level = ? AND c.search_text LIKE ? ORDER BY c.kana, c.sort_order LIMIT 80`,
          )
          .all(userId, level, `%${trimmed}%`)
      : database
          .prepare(`${CATALOG_SELECT} WHERE c.jlpt_level = ? ORDER BY c.kana, c.sort_order`)
          .all(userId, level)
  ) as Array<
    CatalogEntryRow & {
      word_id: number | null;
      intro_stage: number | null;
      queued_at: string | null;
      srs_next_review_at: string | null;
    }
  >;
  return rows.map(mapCatalogListItem);
}

function ensureJlptTag(database: Database.Database, userId: number, level: string): number {
  const tagName = `JLPT ${level}`;
  const existing = database
    .prepare("SELECT id FROM tags WHERE user_id = ? AND name = ?")
    .get(userId, tagName) as { id: number } | undefined;
  if (existing) return existing.id;
  const inserted = database
    .prepare("INSERT INTO tags (user_id, name) VALUES (?, ?)")
    .run(userId, tagName);
  return Number(inserted.lastInsertRowid);
}

export function copyCatalogEntryToUser(
  database: Database.Database,
  userId: number,
  catalogId: number,
  mode: "queue" | "known" | "curriculum",
): { wordId: number; created: boolean } {
  const entry = database.prepare("SELECT * FROM catalog_entries WHERE id = ?").get(catalogId) as
    | CatalogEntryRow
    | undefined;
  if (!entry) throw new Error("Entrée catalogue introuvable");

  const existing = database
    .prepare("SELECT id FROM words WHERE user_id = ? AND catalog_entry_id = ?")
    .get(userId, catalogId) as { id: number } | undefined;

  let wordId: number;
  let created = false;
  if (existing) {
    wordId = existing.id;
  } else {
    const inserted = database
      .prepare(
        `INSERT INTO words (user_id, french, romaji, kana, kanji, note, examples, catalog_entry_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        entry.french,
        entry.romaji,
        entry.kana,
        entry.kanji,
        entry.mnemonic,
        entry.examples,
        entry.id,
      );
    wordId = Number(inserted.lastInsertRowid);
    created = true;
    const tagId = ensureJlptTag(database, userId, entry.jlpt_level);
    database
      .prepare("INSERT OR IGNORE INTO word_tags (word_id, tag_id) VALUES (?, ?)")
      .run(wordId, tagId);
  }

  database.prepare("INSERT OR IGNORE INTO word_stats (word_id) VALUES (?)").run(wordId);

  if (mode === "queue") {
    const stats = database
      .prepare(
        "SELECT COALESCE(intro_stage, 0) AS intro_stage, srs_next_review_at FROM word_stats WHERE word_id = ?",
      )
      .get(wordId) as { intro_stage: number; srs_next_review_at: string | null };
    if (stats.intro_stage === 0 && !stats.srs_next_review_at) {
      database
        .prepare("UPDATE word_stats SET queued_at = COALESCE(queued_at, ?) WHERE word_id = ?")
        .run(new Date().toISOString(), wordId);
    }
  } else if (mode === "known") {
    const schedule = computeSrsSchedule(2, 7, 2.5, "success");
    database
      .prepare(
        `UPDATE word_stats
         SET intro_stage = 5, queued_at = NULL,
             srs_step = ?, srs_interval = ?, srs_ease_factor = ?, srs_next_review_at = ?,
             consecutive_success_count = 3,
             success_count = CASE WHEN success_count < 3 THEN 3 ELSE success_count END
         WHERE word_id = ?`,
      )
      .run(
        schedule.srs_step,
        schedule.srs_interval,
        schedule.srs_ease_factor,
        schedule.srs_next_review_at,
        wordId,
      );
  }

  return { wordId, created };
}

export function unqueueCatalogEntry(
  database: Database.Database,
  userId: number,
  catalogId: number,
): void {
  const word = database
    .prepare("SELECT id FROM words WHERE user_id = ? AND catalog_entry_id = ?")
    .get(userId, catalogId) as { id: number } | undefined;
  if (!word) return;
  const stats = database
    .prepare(
      "SELECT COALESCE(intro_stage, 0) AS intro_stage, srs_next_review_at FROM word_stats WHERE word_id = ?",
    )
    .get(word.id) as { intro_stage: number; srs_next_review_at: string | null } | undefined;
  if (!stats || stats.intro_stage > 0 || stats.srs_next_review_at) {
    database.prepare("UPDATE word_stats SET queued_at = NULL WHERE word_id = ?").run(word.id);
    return;
  }
  database.prepare("DELETE FROM words WHERE id = ? AND user_id = ?").run(word.id, userId);
}

export function getJlptTagId(
  database: Database.Database,
  userId: number,
  level = "N5",
): number | null {
  const row = database
    .prepare("SELECT id FROM tags WHERE user_id = ? AND name = ?")
    .get(userId, `JLPT ${level}`) as { id: number } | undefined;
  return row?.id ?? null;
}

export function queueCatalogEntriesBatch(
  database: Database.Database,
  userId: number,
  catalogIds: number[],
  action: "queue" | "unqueue",
): { queuedCount: number; jlptTagId: number | null } {
  const uniqueCatalogIds = [
    ...new Set(catalogIds.filter((catalogId) => Number.isInteger(catalogId) && catalogId > 0)),
  ];
  const applyBatch = database.transaction(() => {
    for (const catalogId of uniqueCatalogIds) {
      if (action === "queue") {
        copyCatalogEntryToUser(database, userId, catalogId, "queue");
      } else {
        unqueueCatalogEntry(database, userId, catalogId);
      }
    }
  });
  applyBatch();
  return {
    queuedCount: getQueuedCount(database, userId),
    jlptTagId: getJlptTagId(database, userId),
  };
}

export function getQueuedCount(database: Database.Database, userId: number): number {
  const row = database
    .prepare(
      `SELECT COUNT(*) AS count
       FROM words w
       INNER JOIN word_stats s ON s.word_id = w.id
       WHERE w.user_id = ?
         AND s.queued_at IS NOT NULL
         AND COALESCE(s.intro_stage, 0) = 0
         AND s.srs_next_review_at IS NULL`,
    )
    .get(userId) as { count: number };
  return row.count;
}

export function userHasCatalogProgress(database: Database.Database, userId: number): boolean {
  const userRow = database
    .prepare("SELECT placement_completed_at FROM users WHERE id = ?")
    .get(userId) as { placement_completed_at: string | null } | undefined;
  if (userRow?.placement_completed_at) return true;
  const copied = database
    .prepare("SELECT 1 FROM words WHERE user_id = ? AND catalog_entry_id IS NOT NULL LIMIT 1")
    .get(userId);
  return Boolean(copied);
}

export function introduceCurriculumWords(
  database: Database.Database,
  userId: number,
  limit: number,
): number[] {
  if (limit <= 0) return [];
  const rows = database
    .prepare(
      `SELECT c.id
       FROM catalog_entries c
       LEFT JOIN words w ON w.catalog_entry_id = c.id AND w.user_id = ?
       WHERE c.jlpt_level = 'N5' AND w.id IS NULL
       ORDER BY c.sort_order
       LIMIT ?`,
    )
    .all(userId, limit) as Array<{ id: number }>;
  const wordIds: number[] = [];
  for (const row of rows) {
    const copied = copyCatalogEntryToUser(database, userId, row.id, "curriculum");
    wordIds.push(copied.wordId);
  }
  return wordIds;
}

export function pickPlacementQuestions(
  database: Database.Database,
  count = 10,
): Array<{
  catalogId: number;
  kanji: string | null;
  kana: string;
  french: string;
  choices: string[];
}> {
  const pool = database
    .prepare(
      `SELECT id, kanji, kana, french FROM catalog_entries
       WHERE jlpt_level = 'N5' AND length(french) BETWEEN 2 AND 40
       ORDER BY RANDOM() LIMIT 80`,
    )
    .all() as Array<{ id: number; kanji: string | null; kana: string; french: string }>;
  const questions = pool.slice(0, count);
  const allMeanings = pool.map((row) => row.french);
  return questions.map((question) => {
    const distractors = allMeanings
      .filter((meaning) => meaning !== question.french)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const choices = [...distractors, question.french].sort(() => Math.random() - 0.5);
    return {
      catalogId: question.id,
      kanji: question.kanji,
      kana: question.kana,
      french: question.french,
      choices,
    };
  });
}

export function findCatalogIdBySurface(
  database: Database.Database,
  text: string,
  reading?: string,
): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const byKanji = database
    .prepare("SELECT id FROM catalog_entries WHERE kanji = ? OR kana = ? LIMIT 1")
    .get(trimmed, trimmed) as { id: number } | undefined;
  if (byKanji) return byKanji.id;
  if (reading) {
    const byReading = database
      .prepare("SELECT id FROM catalog_entries WHERE kana = ? LIMIT 1")
      .get(reading.trim()) as { id: number } | undefined;
    if (byReading) return byReading.id;
  }
  return null;
}

export function loadConfusionSiblings(
  database: Database.Database,
  userId: number,
  confusionGroup: string | null,
  excludeWordId: number,
): Array<{
  kanji: string | null;
  kana: string | null;
  french: string;
  sense_context: string | null;
}> {
  if (!confusionGroup) return [];
  return database
    .prepare(
      `SELECT w.kanji, w.kana, w.french, c.sense_context
       FROM words w
       INNER JOIN catalog_entries c ON c.id = w.catalog_entry_id
       WHERE w.user_id = ? AND c.confusion_group = ? AND w.id != ?
       LIMIT 6`,
    )
    .all(userId, confusionGroup, excludeWordId) as Array<{
    kanji: string | null;
    kana: string | null;
    french: string;
    sense_context: string | null;
  }>;
}

export function pickMcChoices(
  database: Database.Database,
  catalogId: number | null,
  correctFrench: string,
  confusionGroup: string | null,
): string[] {
  const distractors: string[] = [];
  if (confusionGroup) {
    const groupRows = database
      .prepare(
        `SELECT french FROM catalog_entries
         WHERE confusion_group = ? AND id != ? AND french != ?
         LIMIT 6`,
      )
      .all(confusionGroup, catalogId ?? 0, correctFrench) as Array<{ french: string }>;
    for (const row of groupRows) distractors.push(row.french);
  }
  if (distractors.length < 3) {
    const extra = database
      .prepare(
        `SELECT french FROM catalog_entries
         WHERE french != ? AND jlpt_level = 'N5'
         ORDER BY RANDOM() LIMIT ?`,
      )
      .all(correctFrench, 3 - distractors.length) as Array<{ french: string }>;
    for (const row of extra) distractors.push(row.french);
  }
  const unique = [...new Set(distractors)].slice(0, 3);
  return [...unique, correctFrench].sort(() => Math.random() - 0.5);
}

export function kanaHintFromReading(kana: string | null): string | null {
  if (!kana || kana.length < 2) return null;
  const first = kana[0];
  const rest = "◯".repeat(Math.min(4, kana.length - 1));
  return `${first}${rest}`;
}
