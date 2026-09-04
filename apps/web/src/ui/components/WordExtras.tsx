import type { CatalogKanjiPart, WordExample } from "../../api";
import { AudioButton } from "./AudioButton";

export function WordExtras({
  jlptLevel,
  senseContext,
  mnemonic,
  breakdown,
  examples,
}: {
  jlptLevel?: string | null;
  senseContext?: string | null;
  mnemonic?: string | null;
  breakdown?: CatalogKanjiPart[] | null;
  examples?: WordExample[] | null;
}) {
  const hasBreakdown = Boolean(breakdown && breakdown.length > 0);
  const hasExamples = Boolean(examples && examples.length > 0);
  if (!jlptLevel && !senseContext && !mnemonic && !hasBreakdown && !hasExamples) return null;

  return (
    <div className="wordExtras">
      {senseContext ? <p className="wordExtras__sense">{senseContext}</p> : null}
      {mnemonic ? (
        <div className="wordExtras__block">
          <div className="wordExtras__label">Pourquoi ça veut dire ça</div>
          <p className="wordExtras__text">{mnemonic}</p>
        </div>
      ) : null}
      {hasBreakdown ? (
        <div className="wordExtras__block">
          <div className="wordExtras__label">Kanji</div>
          <ul className="wordExtras__breakdown">
            {breakdown?.map((part) => (
              <li key={`${part.char}-${part.reading}`}>
                <span className="wordExtras__char">{part.char}</span>
                <span className="wordExtras__charMeta">
                  {part.reading} — {part.meaning}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {hasExamples ? (
        <div className="wordExtras__block">
          <div className="wordExtras__label">Phrase d’exemple</div>
          {examples?.map((example) => (
            <div key={example.jp} className="wordExtras__example">
              <div className="wordExtras__exampleJp">
                {example.jp}
                <AudioButton text={example.jp} size="small" />
              </div>
              {example.kana ? <div className="wordExtras__exampleKana">{example.kana}</div> : null}
              <div className="wordExtras__exampleFr">{example.fr}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
