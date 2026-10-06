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

const WEEKDAYS = [
  { french: "dimanche", kanji: "日曜日", reading: "にちようび" },
  { french: "lundi", kanji: "月曜日", reading: "げつようび" },
  { french: "mardi", kanji: "火曜日", reading: "かようび" },
  { french: "mercredi", kanji: "水曜日", reading: "すいようび" },
  { french: "jeudi", kanji: "木曜日", reading: "もくようび" },
  { french: "vendredi", kanji: "金曜日", reading: "きんようび" },
  { french: "samedi", kanji: "土曜日", reading: "どようび" },
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

function weekdayFor(year: number, month: number, day: number): (typeof WEEKDAYS)[number] {
  return WEEKDAYS[new Date(year, month - 1, day).getDay()];
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
  const weekday = weekdayFor(year, month, day);
  const monthReadings = [...MONTH_READINGS[month - 1]];
  const readingsForDay = dayReadings(day);
  const frenchDate = `${weekday.french} ${day} ${FRENCH_MONTHS[month - 1]}`;
  const dateKanji = `${monthKanji}${dayKanji}${weekday.kanji}`;
  const dateReadings = concatReadings([monthReadings, readingsForDay, [weekday.reading]]);

  if (!includeYear) {
    return {
      prompt: frenchDate,
      hint: "Dis cette date en japonais.",
      kanji: dateKanji,
      readings: dateReadings,
    };
  }

  const spelledYear = spellJapaneseNumber(year);
  return {
    prompt: `${frenchDate} ${year}`,
    hint: "Dis cette date en japonais.",
    kanji: `${spelledYear.kanji}年${dateKanji}`,
    readings: concatReadings([
      spelledYear.readings.map((reading) => `${reading}ねん`),
      dateReadings,
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
