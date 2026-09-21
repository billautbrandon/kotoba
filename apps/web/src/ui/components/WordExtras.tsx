import { type ReactNode, useState } from "react";
import type { CatalogKanjiPart, WordExample } from "../../api";
import { hasJapaneseScript, kanaToRomaji } from "../utils/kanaToRomaji";
import { AudioButton } from "./AudioButton";

function hasKanjiCharacter(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function countKanjiCharacters(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
}

function expandExampleKana(
  exampleJapanese: string,
  storedKana: string,
  headwordKanji: string | null | undefined,
  headwordKana: string | null | undefined,
): string {
  const trimmedStored = storedKana.trim();
  const headwordReading = headwordKana?.trim() ?? "";
  const headwordReplaced =
    headwordKanji && headwordReading && exampleJapanese.includes(headwordKanji)
      ? exampleJapanese.split(headwordKanji).join(headwordReading)
      : "";

  const candidates = [trimmedStored, headwordReplaced, exampleJapanese].filter(
    (candidate) => candidate.length > 0,
  );
  candidates.sort((left, right) => {
    const kanjiDelta = countKanjiCharacters(left) - countKanjiCharacters(right);
    if (kanjiDelta !== 0) return kanjiDelta;
    return right.length - left.length;
  });
  return candidates[0] ?? "";
}

function romajiFromKana(kana: string): string | null {
  if (!kana.trim()) return null;
  const kanaOnly = kana.replace(/[\u4e00-\u9fff]/g, "");
  const source = hasJapaneseScript(kanaOnly) ? kanaOnly : kana;
  if (!hasJapaneseScript(source)) return null;
  const converted = kanaToRomaji(source, kana);
  const cleaned = converted
    .replace(/[\u4e00-\u9fff\u3040-\u30ff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || !/[a-zA-Z]/.test(cleaned)) return null;
  return cleaned;
}

function exampleRomajiLine(
  example: WordExample,
  exampleJapanese: string,
  storedKana: string,
  kanaLine: string,
): string | null {
  const storedRomaji = example.romaji?.trim();
  if (storedRomaji) return storedRomaji;
  return romajiFromKana(kanaLine) ?? romajiFromKana(storedKana) ?? romajiFromKana(exampleJapanese);
}

function ExampleJapanese({
  exampleJapanese,
  headwordKanji,
}: {
  exampleJapanese: string;
  headwordKanji?: string | null;
}) {
  if (headwordKanji && exampleJapanese.includes(headwordKanji)) {
    const highlightedPieces: ReactNode[] = [];
    let remainingJapanese = exampleJapanese;
    let hitCount = 0;
    while (remainingJapanese.includes(headwordKanji)) {
      const hitIndex = remainingJapanese.indexOf(headwordKanji);
      const beforeHit = remainingJapanese.slice(0, hitIndex);
      if (beforeHit) highlightedPieces.push(beforeHit);
      highlightedPieces.push(
        <span key={`hit-${headwordKanji}-${hitCount}`} className="lyricExample__hit">
          {headwordKanji}
        </span>,
      );
      remainingJapanese = remainingJapanese.slice(hitIndex + headwordKanji.length);
      hitCount += 1;
    }
    if (remainingJapanese) highlightedPieces.push(remainingJapanese);
    return highlightedPieces;
  }
  return exampleJapanese;
}

function exampleReadingLine(
  example: WordExample,
  exampleJapanese: string,
  storedKana: string,
  kanaLine: string,
): string | null {
  const romajiLine = exampleRomajiLine(example, exampleJapanese, storedKana, kanaLine);
  if (romajiLine) return romajiLine;
  const kanaIsReadable = Boolean(
    kanaLine && hasJapaneseScript(kanaLine) && !hasKanjiCharacter(kanaLine),
  );
  if (kanaIsReadable && kanaLine !== exampleJapanese) return kanaLine;
  return null;
}

function LyricExample({
  example,
  headwordKanji,
  headwordKana,
}: {
  example: WordExample;
  headwordKanji?: string | null;
  headwordKana?: string | null;
}) {
  const kanaLine = expandExampleKana(example.jp, example.kana ?? "", headwordKanji, headwordKana);
  const readingLine = exampleReadingLine(example, example.jp, example.kana ?? "", kanaLine);

  return (
    <article className="lyricExample">
      {readingLine ? <p className="lyricExample__reading">{readingLine}</p> : null}
      <div className="lyricExample__jpRow">
        <p className="lyricExample__jp">
          <ExampleJapanese exampleJapanese={example.jp} headwordKanji={headwordKanji} />
        </p>
        <AudioButton text={example.jp} size="small" />
      </div>
      {example.fr ? <p className="lyricExample__fr">{example.fr}</p> : null}
    </article>
  );
}

export function WordExtras({
  jlptLevel,
  senseContext,
  mnemonic,
  breakdown,
  examples,
  headwordKanji,
  headwordKana,
  compact = false,
  flashcard = false,
  onKanjiStroke,
}: {
  jlptLevel?: string | null;
  senseContext?: string | null;
  mnemonic?: string | null;
  breakdown?: CatalogKanjiPart[] | null;
  examples?: WordExample[] | null;
  headwordKanji?: string | null;
  headwordKana?: string | null;
  compact?: boolean;
  flashcard?: boolean;
  onKanjiStroke?: (kanjiChar: string) => void;
}) {
  const visibleExamples = (compact || flashcard) && examples ? examples.slice(0, 2) : examples;
  const hasBreakdown = Boolean(breakdown && breakdown.length > 0);
  const hasExamples = Boolean(visibleExamples && visibleExamples.length > 0);
  const [showFlashKanji, setShowFlashKanji] = useState(false);

  if (!jlptLevel && !senseContext && !mnemonic && !hasBreakdown && !hasExamples) return null;

  if (flashcard) {
    const kanjiCount = breakdown?.length ?? 0;
    const kanjiToggleLabel = showFlashKanji
      ? "Masquer les kanji"
      : kanjiCount > 1
        ? `Voir les ${kanjiCount} kanji`
        : "Voir le kanji";

    return (
      <div className="flashExtras">
        {hasExamples ? (
          <div className="flashExampleList">
            {visibleExamples?.map((example) => (
              <LyricExample
                key={example.jp}
                example={example}
                headwordKanji={headwordKanji}
                headwordKana={headwordKana}
              />
            ))}
          </div>
        ) : null}
        {hasBreakdown ? (
          <div className="flashKanjiSection">
            <button
              type="button"
              className="flashKanjiToggle"
              onClick={() => setShowFlashKanji((open) => !open)}
              aria-expanded={showFlashKanji}
            >
              {kanjiToggleLabel}
            </button>
            {showFlashKanji ? (
              <div className="flashKanjiWrap">
                <ul className="flashKanji">
                  {breakdown?.map((part) => (
                    <li key={`${part.char}-${part.reading}`} className="flashKanji__tile">
                      <span className="flashKanji__char">{part.char}</span>
                      <em className="flashKanji__meaning">{part.meaning}</em>
                      {onKanjiStroke ? (
                        <button
                          type="button"
                          className="flashKanji__stroke"
                          onClick={() => onKanjiStroke(part.char)}
                          aria-label={`Sens de trace de ${part.char}`}
                        >
                          ✎
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  const kanjiSection = hasBreakdown ? (
    <section className="wordExtras__card wordExtras__card--kanji">
      <h3 className="wordExtras__label">Kanji</h3>
      <ul className="wordExtras__breakdown">
        {breakdown?.map((part) => {
          const readingRomaji = romajiFromKana(part.reading);
          return (
            <li key={`${part.char}-${part.reading}`} className="wordExtras__kanjiItem">
              <span className="wordExtras__char">{part.char}</span>
              <span className="wordExtras__kanjiMeta">
                <span className="wordExtras__kanjiReading">
                  {part.reading}
                  {readingRomaji ? (
                    <span className="wordExtras__kanjiRomaji">{readingRomaji}</span>
                  ) : null}
                </span>
                <span className="wordExtras__kanjiMeaning">{part.meaning}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  ) : null;

  const examplesSection = hasExamples ? (
    <section className="wordExtras__card wordExtras__card--examples">
      <h3 className="wordExtras__label">
        {visibleExamples && visibleExamples.length > 1 ? "Phrases d’exemple" : "Phrase d’exemple"}
      </h3>
      <div className="wordExtras__exampleList">
        {visibleExamples?.map((example) => (
          <LyricExample
            key={example.jp}
            example={example}
            headwordKanji={headwordKanji}
            headwordKana={headwordKana}
          />
        ))}
      </div>
    </section>
  ) : null;

  const mnemonicSection = mnemonic ? (
    <section className="wordExtras__card wordExtras__card--mnemonic">
      <h3 className="wordExtras__label">Pourquoi ça veut dire ça</h3>
      <p className="wordExtras__text">{mnemonic}</p>
    </section>
  ) : null;

  return (
    <div className={`wordExtras${compact ? " wordExtras--compact" : ""}`}>
      {senseContext && !compact ? <p className="wordExtras__sense">{senseContext}</p> : null}
      {mnemonicSection}
      {compact && (kanjiSection || examplesSection) ? (
        <div className="wordExtras__split">
          {kanjiSection}
          {examplesSection}
        </div>
      ) : (
        <>
          {kanjiSection}
          {examplesSection}
        </>
      )}
    </div>
  );
}
