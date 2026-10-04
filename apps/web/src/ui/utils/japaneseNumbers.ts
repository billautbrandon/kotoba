import { kanaToRomaji } from "./kanaToRomaji";

export const JAPANESE_NUMBER_MAX = 99_999_999;

export type SpelledNumber = {
  kanji: string;
  readings: string[];
};

const DIGIT_KANJI = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;

function uniqueReadings(readings: string[]): string[] {
  return [...new Set(readings)];
}

function concatReadings(groups: string[][]): string[] {
  const present = groups.filter((group) => group.length > 0);
  if (present.length === 0) return [];

  let combined = present[0];
  for (const nextGroup of present.slice(1)) {
    const next: string[] = [];
    for (const left of combined) {
      for (const right of nextGroup) {
        next.push(`${left}${right}`);
      }
    }
    combined = next;
  }
  return uniqueReadings(combined);
}

function onesReadings(digit: number): string[] {
  switch (digit) {
    case 1:
      return ["いち"];
    case 2:
      return ["に"];
    case 3:
      return ["さん"];
    case 4:
      return ["よん", "し"];
    case 5:
      return ["ご"];
    case 6:
      return ["ろく"];
    case 7:
      return ["なな", "しち"];
    case 8:
      return ["はち"];
    case 9:
      return ["きゅう", "く"];
    default:
      return [];
  }
}

function tensReadings(digit: number): string[] {
  switch (digit) {
    case 1:
      return ["じゅう"];
    case 2:
      return ["にじゅう"];
    case 3:
      return ["さんじゅう"];
    case 4:
      return ["よんじゅう", "しじゅう"];
    case 5:
      return ["ごじゅう"];
    case 6:
      return ["ろくじゅう"];
    case 7:
      return ["ななじゅう", "しちじゅう"];
    case 8:
      return ["はちじゅう"];
    case 9:
      return ["きゅうじゅう", "くじゅう"];
    default:
      return [];
  }
}

function hundredsReadings(digit: number): string[] {
  switch (digit) {
    case 1:
      return ["ひゃく"];
    case 2:
      return ["にひゃく"];
    case 3:
      return ["さんびゃく"];
    case 4:
      return ["よんひゃく", "しひゃく"];
    case 5:
      return ["ごひゃく"];
    case 6:
      return ["ろっぴゃく"];
    case 7:
      return ["ななひゃく", "しちひゃく"];
    case 8:
      return ["はっぴゃく"];
    case 9:
      return ["きゅうひゃく", "くひゃく"];
    default:
      return [];
  }
}

function thousandsReadings(digit: number): string[] {
  switch (digit) {
    case 1:
      return ["せん", "いっせん"];
    case 2:
      return ["にせん"];
    case 3:
      return ["さんぜん"];
    case 4:
      return ["よんせん", "しせん"];
    case 5:
      return ["ごせん"];
    case 6:
      return ["ろくせん"];
    case 7:
      return ["ななせん", "しちせん"];
    case 8:
      return ["はっせん"];
    case 9:
      return ["きゅうせん", "くせん"];
    default:
      return [];
  }
}

function kanjiBelowMan(value: number): string {
  const thousands = Math.floor(value / 1000);
  const hundreds = Math.floor((value % 1000) / 100);
  const tens = Math.floor((value % 100) / 10);
  const ones = value % 10;
  let kanji = "";

  if (thousands === 1) kanji += "千";
  else if (thousands > 1) kanji += `${DIGIT_KANJI[thousands]}千`;

  if (hundreds === 1) kanji += "百";
  else if (hundreds > 1) kanji += `${DIGIT_KANJI[hundreds]}百`;

  if (tens === 1) kanji += "十";
  else if (tens > 1) kanji += `${DIGIT_KANJI[tens]}十`;

  if (ones > 0) kanji += DIGIT_KANJI[ones];
  return kanji;
}

function spellBelowMan(value: number): SpelledNumber {
  const thousands = Math.floor(value / 1000);
  const hundreds = Math.floor((value % 1000) / 100);
  const tens = Math.floor((value % 100) / 10);
  const ones = value % 10;

  return {
    kanji: kanjiBelowMan(value),
    readings: concatReadings([
      thousandsReadings(thousands),
      hundredsReadings(hundreds),
      tensReadings(tens),
      onesReadings(ones),
    ]),
  };
}

export function spellJapaneseNumber(value: number): SpelledNumber {
  if (!Number.isInteger(value) || value < 0 || value > JAPANESE_NUMBER_MAX) {
    throw new Error("Nombre hors limites");
  }
  if (value === 0) {
    return { kanji: "零", readings: ["れい", "ぜろ"] };
  }

  const man = Math.floor(value / 10_000);
  const rest = value % 10_000;
  const manPart = man > 0 ? spellBelowMan(man) : null;
  const restPart = rest > 0 ? spellBelowMan(rest) : null;
  const readings = concatReadings([
    manPart ? manPart.readings.map((reading) => `${reading}まん`) : [],
    restPart ? restPart.readings : [],
  ]);
  const kanji = `${manPart ? `${manPart.kanji}万` : ""}${restPart ? restPart.kanji : ""}`;
  return { kanji, readings };
}

export type NumberLevel = "debutant" | "intermediaire" | "avance";

export const NUMBER_LEVELS: Record<NumberLevel, { min: number; max: number }> = {
  debutant: { min: 0, max: 99 },
  intermediaire: { min: 100, max: 9_999 },
  avance: { min: 10_000, max: JAPANESE_NUMBER_MAX },
};

export type JapanesePrompt = {
  prompt: string;
  hint: string;
  kanji: string;
  readings: string[];
};

export function drawJapaneseNumber(level: NumberLevel = "debutant"): JapanesePrompt {
  const range = NUMBER_LEVELS[level];
  const span = range.max - range.min + 1;
  const value = range.min + Math.floor(Math.random() * span);
  const spelled = spellJapaneseNumber(value);
  return {
    prompt: value.toLocaleString("fr-FR"),
    hint: "Dis ce nombre en japonais.",
    kanji: spelled.kanji,
    readings: spelled.readings,
  };
}

function stripAnswerDecorations(value: string): string {
  return value.replace(/[\s\u3000.,。、・!！?？'"「」『』()（）\-ー]/g, "");
}

function toHiragana(value: string): string {
  return value.replace(/[\u30a1-\u30f6]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0x60),
  );
}

function normalizeRomaji(value: string): string {
  const withoutMarks = value
    .toLowerCase()
    .replace(/[āâ]/g, "aa")
    .replace(/[īî]/g, "ii")
    .replace(/[ūû]/g, "uu")
    .replace(/[ēê]/g, "ee")
    .replace(/[ōô]/g, "ou");

  return withoutMarks
    .replace(/[^a-z']/g, "")
    .replace(/sya/g, "sha")
    .replace(/syu/g, "shu")
    .replace(/syo/g, "sho")
    .replace(/tya/g, "cha")
    .replace(/tyu/g, "chu")
    .replace(/tyo/g, "cho")
    .replace(/jya/g, "ja")
    .replace(/jyu/g, "ju")
    .replace(/jyo/g, "jo")
    .replace(/zya/g, "ja")
    .replace(/zyu/g, "ju")
    .replace(/zyo/g, "jo")
    .replace(/si/g, "shi")
    .replace(/ti/g, "chi")
    .replace(/tu/g, "tsu")
    .replace(/hu/g, "fu")
    .replace(/zi/g, "ji")
    .replace(/m([bmp])/g, "n$1")
    .replace(/'/g, "")
    .replace(/uu/g, "u")
    .replace(/ou/g, "o")
    .replace(/oo/g, "o");
}

export function readingRomaji(reading: string): string {
  return kanaToRomaji(reading, null, { particles: false }).replace(/\s+/g, "");
}

export function matchesJapaneseAnswer(answer: string, kanji: string, readings: string[]): boolean {
  const compact = stripAnswerDecorations(answer.trim());
  if (!compact) return false;

  const acceptedKanji = new Set([stripAnswerDecorations(kanji)]);
  if (kanji === "零") acceptedKanji.add("〇");
  if (acceptedKanji.has(compact)) return true;

  const hiragana = toHiragana(compact);
  if (readings.includes(hiragana)) return true;

  const userRomaji = normalizeRomaji(compact);
  if (!userRomaji) return false;
  return readings.some(
    (reading) => normalizeRomaji(kanaToRomaji(reading, null, { particles: false })) === userRomaji,
  );
}
