import { type JapanesePrompt, spellJapaneseNumber } from "./japaneseNumbers";

const FRENCH_MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

const MONTH_READINGS = [
  ["いちがつ"],
  ["にがつ"],
  ["さんがつ"],
  ["しがつ", "よんがつ"],
  ["ごがつ"],
  ["ろくがつ"],
  ["しちがつ", "なながつ"],
  ["はちがつ"],
  ["くがつ", "きゅうがつ"],
  ["じゅうがつ"],
  ["じゅういちがつ"],
  ["じゅうにがつ"],
] as const;

const IRREGULAR_DAYS: Record<number, string[]> = {
  1: ["ついたち"],
  2: ["ふつか"],
  3: ["みっか"],
  4: ["よっか"],
  5: ["いつか"],
  6: ["むいか"],
  7: ["なのか"],
  8: ["ようか"],
  9: ["ここのか"],
  10: ["とおか"],
  14: ["じゅうよっか", "じゅうよんにち", "じゅうしにち"],
  20: ["はつか", "にじゅうにち"],
  24: ["にじゅうよっか", "にじゅうよんにち", "にじゅうしにち"],
};

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

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function dayReadings(day: number): string[] {
  const irregular = IRREGULAR_DAYS[day];
  if (irregular) return [...irregular];
  return spellJapaneseNumber(day).readings.map((reading) => `${reading}にち`);
}

function randomYear(): number {
  const currentYear = new Date().getFullYear();
  const start = currentYear - 40;
  return start + Math.floor(Math.random() * 51);
}

export function buildJapaneseDate(
  year: number,
  month: number,
  day: number,
  includeYear: boolean,
): JapanesePrompt {
  const monthKanji = `${spellJapaneseNumber(month).kanji}月`;
  const dayKanji = `${spellJapaneseNumber(day).kanji}日`;
  const monthReadings = [...MONTH_READINGS[month - 1]];
  const readingsForDay = dayReadings(day);
  const frenchDay = `${day} ${FRENCH_MONTHS[month - 1]}`;

  if (!includeYear) {
    return {
      prompt: frenchDay,
      hint: "Dis cette date en japonais.",
      kanji: `${monthKanji}${dayKanji}`,
      readings: concatReadings([monthReadings, readingsForDay]),
    };
  }

  const spelledYear = spellJapaneseNumber(year);
  return {
    prompt: `${frenchDay} ${year}`,
    hint: "Dis cette date en japonais.",
    kanji: `${spelledYear.kanji}年${monthKanji}${dayKanji}`,
    readings: concatReadings([
      spelledYear.readings.map((reading) => `${reading}ねん`),
      monthReadings,
      readingsForDay,
    ]),
  };
}

export function drawJapaneseDate(): JapanesePrompt {
  const includeYear = Math.random() < 0.5;
  const year = includeYear ? randomYear() : 2024;
  const month = 1 + Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * daysInMonth(year, month));
  return buildJapaneseDate(year, month, day, includeYear);
}
