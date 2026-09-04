import type React from "react";

function hasKanjiChar(char: string): boolean {
  return /[\u4e00-\u9fff]/.test(char);
}

function matchingKanaAffixLength(
  kanjiChars: string[],
  kanaChars: string[],
  fromStart: boolean,
): number {
  const maxLength = Math.min(kanjiChars.length, kanaChars.length);
  let affixLength = 0;
  while (affixLength < maxLength) {
    const kanjiIndex = fromStart ? affixLength : kanjiChars.length - 1 - affixLength;
    const kanaIndex = fromStart ? affixLength : kanaChars.length - 1 - affixLength;
    if (kanjiChars[kanjiIndex] !== kanaChars[kanaIndex] || hasKanjiChar(kanjiChars[kanjiIndex])) {
      break;
    }
    affixLength += 1;
  }
  return affixLength;
}

export function FuriganaText({
  kanji,
  kana,
}: {
  kanji: string | null | undefined;
  kana: string | null | undefined;
}): React.ReactNode {
  if (!kanji) return kana || "—";
  if (!kana || kanji === kana) return kanji;

  const kanjiChars = [...kanji];
  const kanaChars = [...kana];
  const prefixLength = matchingKanaAffixLength(kanjiChars, kanaChars, true);
  const suffixLength = matchingKanaAffixLength(
    kanjiChars.slice(prefixLength),
    kanaChars.slice(prefixLength),
    false,
  );
  const prefix = kanjiChars.slice(0, prefixLength).join("");
  const kanjiStem = kanjiChars.slice(prefixLength, kanjiChars.length - suffixLength).join("");
  const kanaStem = kanaChars.slice(prefixLength, kanaChars.length - suffixLength).join("");
  const suffix = kanjiChars.slice(kanjiChars.length - suffixLength).join("");

  if (!kanjiStem) return kanji;

  return (
    <>
      {prefix}
      <ruby>
        {kanjiStem}
        <rp>(</rp>
        <rt>{kanaStem}</rt>
        <rp>)</rp>
      </ruby>
      {suffix}
    </>
  );
}
