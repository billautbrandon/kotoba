import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type Database from "better-sqlite3";

import { computeSrsSchedule } from "./db.js";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = path.dirname(currentFilePath);

function resolveCatalogDataDirectory(): string {
  const candidates = [
    path.join(currentDirectoryPath, "catalog-seed"),
    path.join(currentDirectoryPath, "../src/catalog-seed"),
  ];
  for (const directoryPath of candidates) {
    if (fs.existsSync(path.join(directoryPath, "openjlpt-n5-vocab.json"))) {
      return directoryPath;
    }
  }
  return candidates[0];
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
  morning: "matin",
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

function loadOptionalJsonFile<T>(fileName: string, fallback: T): T {
  const filePath = path.join(dataDirectoryPath, fileName);
  if (!fs.existsSync(filePath)) return fallback;
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
    const fallback = KANJI_CHAR_FALLBACK[character];
    const englishMeaning = kanjiRow?.meanings[0] ?? "";
    const meaning =
      fallback?.meaning ??
      KANJI_FR[englishMeaning] ??
      (translateGloss(englishMeaning, glosses) || "kanji");
    const reading = readingForKanjiCharacter(character, kanjiRow) || kana;
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

const KANJI_CHAR_FALLBACK: Record<string, { meaning: string; reading: string }> = {
  吸: { meaning: "aspirer", reading: "す" },
  油: { meaning: "huile", reading: "あぶら" },
  虹: { meaning: "arc-en-ciel", reading: "にじ" },
  彼: { meaning: "lui", reading: "かれ" },
  晩: { meaning: "soir", reading: "ばん" },
  顔: { meaning: "visage", reading: "かお" },
  心: { meaning: "cœur", reading: "こころ" },
  僕: { meaning: "moi", reading: "ぼく" },
  君: { meaning: "toi", reading: "きみ" },
  事: { meaning: "chose", reading: "こと" },
  茶: { meaning: "thé", reading: "ちゃ" },
  飯: { meaning: "repas", reading: "めし" },
  週: { meaning: "semaine", reading: "しゅう" },
};

function katakanaToHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0x60),
  );
}

const KANJI_READING_FALLBACK: Record<string, string> = {
  特: "とく",
  面: "めん",
  買: "か",
  意: "い",
  切: "き",
  歩: "ある",
  立: "た",
  通: "とお",
  返: "かえ",
  当: "あ",
  乗: "の",
  着: "き",
  消: "け",
  閉: "し",
  分: "わ",
  番: "ばん",
  作: "つく",
  開: "ひら",
  眠: "ねむ",
  理: "り",
  降: "お",
  歳: "さい",
  飲: "の",
  旅: "たび",
  止: "と",
  約: "やく",
  調: "しら",
  転: "ころ",
  腹: "はら",
  必: "ひつ",
  要: "よう",
  楽: "たの",
  得: "え",
  取: "と",
  満: "み",
  美: "うつく",
  会: "あ",
  良: "よ",
  過: "す",
  員: "いん",
  曲: "ま",
  正: "ただ",
  冷: "つめ",
  煙: "けむり",
  借: "か",
  携: "けい",
  帯: "たい",
  型: "がた",
  熱: "ねつ",
  富: "ふ",
  士: "し",
  氷: "こおり",
  湯: "ゆ",
  呂: "ろ",
  風: "かぜ",
};

const EXAMPLE_WORD_READINGS: Array<{ word: string; kana: string }> = [
  { word: "風呂", kana: "ふろ" },
  { word: "彼女", kana: "かのじょ" },
  { word: "富士山", kana: "ふじさん" },
  { word: "留学生", kana: "りゅうがくせい" },
  { word: "面白い", kana: "おもしろい" },
  { word: "約束", kana: "やくそく" },
  { word: "必要", kana: "ひつよう" },
  { word: "意見", kana: "いけん" },
  { word: "携帯", kana: "けいたい" },
  { word: "失礼", kana: "しつれい" },
  { word: "運転", kana: "うんてん" },
  { word: "注意", kana: "ちゅうい" },
  { word: "事故", kana: "じこ" },
  { word: "韓国", kana: "かんこく" },
  { word: "美人", kana: "びじん" },
  { word: "両方", kana: "りょうほう" },
  { word: "理由", kana: "りゆう" },
  { word: "普通", kana: "ふつう" },
  { word: "確認", kana: "かくにん" },
  { word: "若者", kana: "わかもの" },
  { word: "昨晩", kana: "さくばん" },
  { word: "気分", kana: "きぶん" },
  { word: "品物", kana: "しなもの" },
  { word: "本当", kana: "ほんとう" },
  { word: "何時", kana: "なんじ" },
  { word: "何歳", kana: "なんさい" },
  { word: "東京", kana: "とうきょう" },
  { word: "手伝う", kana: "てつだう" },
  { word: "頭痛", kana: "ずつう" },
  { word: "氷", kana: "こおり" },
  { word: "湯", kana: "ゆ" },
];

function readingForKanjiCharacter(character: string, kanjiRow: OpenJlptKanji | undefined): string {
  if (kanjiRow?.kunyomi[0]) {
    return kanjiRow.kunyomi[0].replace(/^-/, "").split(".")[0]?.replace(/-/g, "") ?? "";
  }
  if (kanjiRow?.onyomi[0]) {
    return katakanaToHiragana(kanjiRow.onyomi[0]);
  }
  return KANJI_CHAR_FALLBACK[character]?.reading ?? KANJI_READING_FALLBACK[character] ?? "";
}

function sentenceToKana(
  japanese: string,
  vocabReadings: Array<{ word: string; kana: string }>,
  kanjiByChar: Map<string, OpenJlptKanji>,
): string {
  if (!hasKanji(japanese)) return japanese;
  const characters = [...japanese];
  let index = 0;
  let output = "";
  while (index < characters.length) {
    const remaining = characters.slice(index).join("");
    const vocabMatch = vocabReadings.find((entry) => remaining.startsWith(entry.word));
    if (vocabMatch) {
      output += vocabMatch.kana;
      index += [...vocabMatch.word].length;
      continue;
    }
    const character = characters[index];
    if (hasKanji(character)) {
      output += readingForKanjiCharacter(character, kanjiByChar.get(character)) || character;
      index += 1;
      continue;
    }
    output += character;
    index += 1;
  }
  return output;
}

const EXAMPLE_SENTENCE_FR: Record<string, string> = {
  "would you like ice?": "Tu veux de la glace ?",
  "run hot water into the bath.": "Je verse de l'eau chaude dans le bain.",
  "i put on a hat.": "Je mets un chapeau.",
  "look over there.": "Regarde là-bas.",
  "the teacher is over there.": "Le professeur est là-bas.",
  "the toilet is over there.": "Les toilettes sont là-bas.",
  "what's that?": "C'est quoi ?",
  "how old are you?": "Quel âge as-tu ?",
  "how old is he?": "Quel âge a-t-il ?",
  "how much is it?": "Combien ça coûte ?",
  "when do we arrive?": "Quand est-ce qu'on arrive ?",
  "when is your birthday?": "C'est quand ton anniversaire ?",
  "do you have a fever?": "Tu as de la fièvre ?",
  "i'll go in.": "J'entre.",
  "who is this girl?": "Qui est cette fille ?",
  "there were only girls.": "Il n'y avait que des filles.",
};

function translateExampleEnglish(
  english: string,
  exampleSentencesFr: Record<string, string>,
): string {
  const normalizedEnglish = english.trim().toLowerCase().replace(/\s+/g, " ");
  const exactFrench =
    exampleSentencesFr[normalizedEnglish] ?? EXAMPLE_SENTENCE_FR[normalizedEnglish];
  return exactFrench?.trim() ?? "";
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
  const exampleSentencesFr = loadOptionalJsonFile<Record<string, string>>(
    "openjlpt-n5-example-fr.json",
    {},
  );
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

  const vocabReadings = [...vocab, ...extras]
    .map((entry) => ({
      word: entry.word,
      kana: firstReading(entry.reading, entry.word),
    }))
    .concat(EXAMPLE_WORD_READINGS)
    .sort((left, right) => [...right.word].length - [...left.word].length);

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
        kana: sentenceToKana(example.ja, vocabReadings, kanjiByChar),
        fr: translateExampleEnglish(example.en, exampleSentencesFr),
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
  database
    .prepare(
      `UPDATE words
       SET examples = (
         SELECT examples FROM catalog_entries WHERE catalog_entries.id = words.catalog_entry_id
       )
       WHERE catalog_entry_id IS NOT NULL`,
    )
    .run();
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
