export function formatWordJp(word: {
  kanji: string | null;
  kana: string | null;
  romaji: string | null;
}): string {
  return word.kanji ?? word.kana ?? word.romaji ?? "—";
}
