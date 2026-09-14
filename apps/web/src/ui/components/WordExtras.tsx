import { type ReactNode, useState } from "react";
import type { CatalogKanjiPart, WordExample } from "../../api";
import { hasJapaneseScript, kanaToRomaji } from "../utils/kanaToRomaji";
import { AudioButton } from "./AudioButton";
import { FuriganaText } from "./FuriganaText";

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
  kanaLine,
  headwordKanji,
}: {
  exampleJapanese: string;
  kanaLine: string;
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
        <span key={`hit-${headwordKanji}-${hitCount}`} className="flashExample__hit">
          {headwordKanji}
        </span>,
      );
      remainingJapanese = remainingJapanese.slice(hitIndex + headwordKanji.length);
      hitCount += 1;
    }
    if (remainingJapanese) highlightedPieces.push(remainingJapanese);
    return highlightedPieces;
  }
  const kanaIsReadable = Boolean(
    kanaLine && hasJapaneseScript(kanaLine) && !hasKanjiCharacter(kanaLine),
  );
  if (kanaIsReadable) return <FuriganaText kanji={exampleJapanese} kana={kanaLine} />;
  return exampleJapanese;
}

function ExampleCard({
  example,
  headwordKanji,
  headwordKana,
  compact,
}: {
  example: WordExample;
  headwordKanji?: string | null;
  headwordKana?: string | null;
  compact?: boolean;
}) {
  const kanaLine = expandExampleKana(example.jp, example.kana ?? "", headwordKanji, headwordKana);
  const kanaIsReadable = Boolean(
    kanaLine && hasJapaneseScript(kanaLine) && !hasKanjiCharacter(kanaLine),
  );
  const showKana = Boolean(kanaIsReadable && kanaLine !== example.jp);
  const romajiLine = exampleRomajiLine(example, example.jp, example.kana ?? "", kanaLine);

  return (
    <article className="wordExtras__example">
      <div className="wordExtras__exampleJp">
        {showKana ? <FuriganaText kanji={example.jp} kana={kanaLine} /> : example.jp}
        <AudioButton text={example.jp} size="small" />
      </div>
      {compact ? (
        <>
          {romajiLine ? <p className="wordExtras__exampleRomaji">{romajiLine}</p> : null}
          {example.fr ? <p className="wordExtras__exampleFr">{example.fr}</p> : null}
        </>
      ) : (
        <>
          {showKana ? (
            <div className="wordExtras__scriptRow">
              <span className="wordExtras__scriptLabel">Kana</span>
              <span className="wordExtras__scriptValue wordExtras__scriptValue--kana">
                {kanaLine}
              </span>
            </div>
          ) : null}
          {romajiLine ? (
            <div className="wordExtras__scriptRow">
              <span className="wordExtras__scriptLabel">Rōmaji</span>
              <span className="wordExtras__scriptValue wordExtras__scriptValue--romaji">
                {romajiLine}
              </span>
            </div>
          ) : null}
          {example.fr ? (
            <div className="wordExtras__scriptRow">
              <span className="wordExtras__scriptLabel">Français</span>
              <span className="wordExtras__scriptValue wordExtras__scriptValue--fr">
                {example.fr}
              </span>
            </div>
          ) : null}
        </>
      )}
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
            {visibleExamples?.map((example) => {
              const kanaLine = expandExampleKana(
                example.jp,
                example.kana ?? "",
                headwordKanji,
                headwordKana,
              );
              const romajiLine = exampleRomajiLine(
                example,
                example.jp,
                example.kana ?? "",
                kanaLine,
              );
              return (
                <article key={example.jp} className="flashExample">
                  <div className="flashExample__top">
                    <p className="flashExample__jp">
                      <ExampleJapanese
                        exampleJapanese={example.jp}
                        kanaLine={kanaLine}
                        headwordKanji={headwordKanji}
                      />
                    </p>
                    <AudioButton text={example.jp} size="small" />
                  </div>
                  {romajiLine ? <p className="flashExample__romaji">{romajiLine}</p> : null}
                  {example.fr ? <p className="flashExample__fr">{example.fr}</p> : null}
                </article>
              );
            })}
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
          <ExampleCard
            key={example.jp}
            example={example}
            headwordKanji={headwordKanji}
            headwordKana={headwordKana}
            compact={compact}
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
