import { useState } from "react";
import { drawJapaneseDate } from "../utils/japaneseDates";
import {
  type JapanesePrompt,
  drawJapaneseNumber,
  matchesJapaneseAnswer,
} from "../utils/japaneseNumbers";
import { VoiceButton } from "./VoiceButton";

const CARD_COUNT = 10;

type RecallDrillProps = {
  mode: "nombres" | "dates";
};

type CheckedAnswer = {
  correct: boolean;
  kana: string;
  kanji: string;
};

function drawCard(mode: RecallDrillProps["mode"]): JapanesePrompt {
  return mode === "nombres" ? drawJapaneseNumber() : drawJapaneseDate();
}

function drawDeck(mode: RecallDrillProps["mode"]): JapanesePrompt[] {
  return Array.from({ length: CARD_COUNT }, () => drawCard(mode));
}

export function RecallDrill({ mode }: RecallDrillProps) {
  const [cards, setCards] = useState(() => drawDeck(mode));
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [checked, setChecked] = useState<CheckedAnswer | null>(null);
  const card = cards[index];

  function restart() {
    setCards(drawDeck(mode));
    setIndex(0);
    setDraft("");
    setScore(0);
    setFinished(false);
    setChecked(null);
  }

  function checkAnswer() {
    if (!card || checked || !draft.trim()) return;
    const correct = matchesJapaneseAnswer(draft, card.kanji, card.readings);
    setChecked({
      correct,
      kana: card.readings[0] ?? "",
      kanji: card.kanji,
    });
    if (correct) setScore((value) => value + 1);
  }

  function goNext() {
    if (index + 1 >= cards.length) {
      setFinished(true);
      return;
    }
    setIndex((value) => value + 1);
    setDraft("");
    setChecked(null);
  }

  if (finished) {
    return (
      <section className="recallDrill">
        <div className="recallDrill__card">
          <p className="recallDrill__kicker">Résultat</p>
          <p className="recallDrill__score">
            {score} / {cards.length}
          </p>
          <p className="recallDrill__hint">
            {score === cards.length ? "Tout est juste." : "Relance une série de 10 quand tu veux."}
          </p>
          <div className="recallDrill__actions">
            <button className="button button--primary" type="button" onClick={restart}>
              Recommencer
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!card) return null;

  return (
    <section className="recallDrill">
      <div className="recallDrill__card">
        <p className="recallDrill__kicker">
          {index + 1} / {cards.length}
        </p>
        <p className="recallDrill__prompt">{card.prompt}</p>
        <p className="recallDrill__hint">{card.hint}</p>

        <div className="phrasesTraining__inputRow">
          <textarea
            className="phrasesTraining__textarea recallDrill__input"
            placeholder="Kana, kanji ou romaji"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={checked !== null}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            lang="ja"
            rows={2}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && checked === null) {
                event.preventDefault();
                checkAnswer();
              }
            }}
          />
          <VoiceButton
            onTranscript={(transcript) => setDraft(transcript.trim())}
            lang="ja-JP"
            disabled={checked !== null}
          />
        </div>

        {checked ? (
          <div className="recallDrill__feedback">
            <p
              className={`recallDrill__verdict ${checked.correct ? "recallDrill__verdict--ok" : "recallDrill__verdict--miss"}`}
            >
              {checked.correct ? "Juste" : "À revoir"}
            </p>
            {checked.correct ? null : (
              <div className="recallDrill__expected">
                <p>{checked.kana}</p>
                <p>{checked.kanji}</p>
              </div>
            )}
            <div className="recallDrill__actions">
              <button className="button button--primary" type="button" onClick={goNext}>
                Suivant
              </button>
            </div>
          </div>
        ) : (
          <div className="recallDrill__actions">
            <button
              className="button button--primary"
              type="button"
              onClick={checkAnswer}
              disabled={!draft.trim()}
            >
              Vérifier
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
