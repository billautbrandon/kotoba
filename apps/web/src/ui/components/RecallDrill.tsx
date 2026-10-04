import { useEffect, useRef, useState } from "react";
import { drawJapaneseDate } from "../utils/japaneseDates";
import {
  type JapanesePrompt,
  type NumberLevel,
  drawJapaneseNumber,
  matchesJapaneseAnswer,
  readingRomaji,
} from "../utils/japaneseNumbers";
import { VoiceButton } from "./VoiceButton";

const CARD_COUNT = 10;
const NUMBER_LEVEL_KEY = "kotoba.numberLevel";

const NUMBER_LEVEL_OPTIONS: Array<{ value: NumberLevel; title: string; text: string }> = [
  { value: "debutant", title: "Débutant", text: "De 0 à 99." },
  { value: "intermediaire", title: "Intermédiaire", text: "De 100 à 9 999." },
  { value: "avance", title: "Avancé", text: "De 10 000 à 99 999 999." },
];

function loadNumberLevel(): NumberLevel {
  const stored = window.localStorage.getItem(NUMBER_LEVEL_KEY);
  if (stored === "debutant" || stored === "intermediaire" || stored === "avance") return stored;
  return "debutant";
}

type RecallDrillProps = {
  mode: "nombres" | "dates";
};

type CheckedAnswer = {
  correct: boolean;
  kana: string;
  kanji: string;
  romaji: string;
};

function drawCard(mode: RecallDrillProps["mode"], level: NumberLevel): JapanesePrompt {
  return mode === "nombres" ? drawJapaneseNumber(level) : drawJapaneseDate();
}

function drawDeck(mode: RecallDrillProps["mode"], level: NumberLevel): JapanesePrompt[] {
  return Array.from({ length: CARD_COUNT }, () => drawCard(mode, level));
}

export function RecallDrill({ mode }: RecallDrillProps) {
  const [level, setLevel] = useState<NumberLevel>(loadNumberLevel);
  const [cards, setCards] = useState(() => drawDeck(mode, loadNumberLevel()));
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [checked, setChecked] = useState<CheckedAnswer | null>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const card = cards[index];
  const checkedRef = useRef(checked);
  const finishedRef = useRef(finished);
  const checkAnswerRef = useRef<() => void>(() => {});
  const goNextRef = useRef<() => void>(() => {});
  const restartRef = useRef<() => void>(() => {});
  checkedRef.current = checked;
  finishedRef.current = finished;

  function focusAnswer() {
    window.setTimeout(() => answerRef.current?.focus(), 0);
  }

  function resetSession(nextLevel: NumberLevel) {
    setCards(drawDeck(mode, nextLevel));
    setIndex(0);
    setDraft("");
    setScore(0);
    setFinished(false);
    setChecked(null);
    focusAnswer();
  }

  function restart() {
    resetSession(level);
  }

  function selectLevel(nextLevel: NumberLevel) {
    if (nextLevel === level) return;
    window.localStorage.setItem(NUMBER_LEVEL_KEY, nextLevel);
    setLevel(nextLevel);
    resetSession(nextLevel);
  }

  function checkAnswer() {
    if (!card || checked || !draft.trim()) return;
    const correct = matchesJapaneseAnswer(draft, card.kanji, card.readings);
    const kana = card.readings[0] ?? "";
    setChecked({
      correct,
      kana,
      kanji: card.kanji,
      romaji: readingRomaji(kana),
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
    focusAnswer();
  }

  checkAnswerRef.current = checkAnswer;
  goNextRef.current = goNext;
  restartRef.current = restart;

  useEffect(() => {
    answerRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.isComposing) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const isEnter = event.key === "Enter";
      const isRight = event.key === "ArrowRight";
      if (!isEnter && !isRight) return;
      const target = event.target;
      if (target instanceof Element && target.closest(".recallDrill__levels")) return;

      if (finishedRef.current) {
        if (!isEnter) return;
        event.preventDefault();
        restartRef.current();
        return;
      }
      if (checkedRef.current) {
        event.preventDefault();
        goNextRef.current();
        return;
      }
      if (!isEnter) return;
      event.preventDefault();
      checkAnswerRef.current();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  const levelPicker =
    mode === "nombres" ? (
      <fieldset className="recallDrill__levels">
        <legend className="recallDrill__legend">Niveau</legend>
        <div className="pratiqueChoiceGrid pratiqueChoiceGrid--three">
          {NUMBER_LEVEL_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`pratiqueChoice${level === option.value ? " pratiqueChoice--active" : ""}`}
              onClick={() => selectLevel(option.value)}
            >
              <span className="pratiqueChoice__title">{option.title}</span>
              <span className="pratiqueChoice__text">{option.text}</span>
            </button>
          ))}
        </div>
      </fieldset>
    ) : null;

  if (finished) {
    return (
      <section className="recallDrill">
        {levelPicker}
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
              <kbd className="kbdHint">Entrée</kbd>
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!card) return null;

  return (
    <section className="recallDrill">
      {levelPicker}
      <div className="recallDrill__card">
        <p className="recallDrill__kicker">
          {index + 1} / {cards.length}
        </p>
        <p className="recallDrill__prompt">{card.prompt}</p>
        <p className="recallDrill__hint">{card.hint}</p>

        <div className="phrasesTraining__inputRow">
          <textarea
            ref={answerRef}
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
                <p className="recallDrill__romaji">{checked.romaji}</p>
                <p>{checked.kanji}</p>
              </div>
            )}
            <div className="recallDrill__actions">
              <button className="button button--primary" type="button" onClick={goNext}>
                Suivant
                <kbd className="kbdHint">Entrée</kbd>
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
