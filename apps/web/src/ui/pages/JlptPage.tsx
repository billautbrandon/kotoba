import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  type GeminiQuota,
  type JlptConstraints,
  type JlptExercise,
  type PhraseEvaluation,
  evaluateJlptAnswer,
  fetchGeminiQuota,
  generateJlptExercises,
} from "../../api";
import { QuotaBar } from "../components/QuotaBar";
import { VoiceButton } from "../components/VoiceButton";

type JlptPhase = "setup" | "training" | "recap";

type JlptResult = {
  exercise: JlptExercise;
  userAnswer: string;
  evaluation: PhraseEvaluation | null;
};

export function JlptPage() {
  const [phase, setPhase] = useState<JlptPhase>("setup");

  const [exerciseType, setExerciseType] = useState<JlptConstraints["exerciseType"]>("phrases");
  const [direction, setDirection] = useState<JlptConstraints["direction"]>("fr-to-jp");
  const [withKanji, setWithKanji] = useState(true);
  const [exerciseCount, setExerciseCount] = useState(5);
  const [paragraphLength, setParagraphLength] = useState<"short" | "medium" | "long">("medium");

  const [exercises, setExercises] = useState<JlptExercise[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [results, setResults] = useState<JlptResult[]>([]);
  const [currentEvaluation, setCurrentEvaluation] = useState<PhraseEvaluation | null>(null);
  const [hasCheckedCurrent, setHasCheckedCurrent] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quota, setQuota] = useState<GeminiQuota | null>(null);

  function refreshQuota() {
    fetchGeminiQuota()
      .then((loadedQuota) => setQuota(loadedQuota))
      .catch(() => setQuota(null));
  }

  useEffect(() => {
    let isMounted = true;
    fetchGeminiQuota()
      .then((loadedQuota) => {
        if (isMounted) setQuota(loadedQuota);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleGenerate() {
    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const generated = await generateJlptExercises({
        exerciseType,
        direction,
        withKanji,
        count: exerciseType === "paragraph" ? 1 : exerciseCount,
        paragraphLength: exerciseType === "paragraph" ? paragraphLength : undefined,
      });
      setExercises(generated);
      setCurrentIndex(0);
      setUserAnswer("");
      setResults([]);
      setCurrentEvaluation(null);
      setHasCheckedCurrent(false);
      setPhase("training");
      refreshQuota();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setIsGenerating(false);
    }
  }

  const currentExercise = exercises[currentIndex] ?? null;

  async function handleCheck() {
    if (!currentExercise || !userAnswer.trim()) return;
    setIsEvaluating(true);
    setErrorMessage(null);

    try {
      const evaluation = await evaluateJlptAnswer(
        userAnswer.trim(),
        currentExercise.answer,
        currentExercise.prompt,
        direction,
      );
      setCurrentEvaluation(evaluation);
      setHasCheckedCurrent(true);
      refreshQuota();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur lors de la vérification");
    } finally {
      setIsEvaluating(false);
    }
  }

  function handleNext() {
    if (!currentExercise) return;
    setResults((previous) => [
      ...previous,
      { exercise: currentExercise, userAnswer, evaluation: currentEvaluation },
    ]);

    const nextIndex = currentIndex + 1;
    if (nextIndex >= exercises.length) {
      setPhase("recap");
    } else {
      setCurrentIndex(nextIndex);
      setUserAnswer("");
      setCurrentEvaluation(null);
      setHasCheckedCurrent(false);
      setErrorMessage(null);
    }
  }

  function handleSkip() {
    if (!currentExercise) return;
    setResults((previous) => [
      ...previous,
      { exercise: currentExercise, userAnswer: "", evaluation: null },
    ]);

    const nextIndex = currentIndex + 1;
    if (nextIndex >= exercises.length) {
      setPhase("recap");
    } else {
      setCurrentIndex(nextIndex);
      setUserAnswer("");
      setCurrentEvaluation(null);
      setHasCheckedCurrent(false);
      setErrorMessage(null);
    }
  }

  function handleRestart() {
    setPhase("setup");
    setExercises([]);
    setCurrentIndex(0);
    setUserAnswer("");
    setResults([]);
    setCurrentEvaluation(null);
    setHasCheckedCurrent(false);
    setErrorMessage(null);
  }

  const handleVoiceTranscript = useCallback((text: string) => {
    setUserAnswer((previous) => (previous ? `${previous} ${text}` : text));
  }, []);

  const handleCheckRef = useRef(handleCheck);
  const handleNextRef = useRef(handleNext);
  const handleRestartRef = useRef(handleRestart);
  handleCheckRef.current = handleCheck;
  handleNextRef.current = handleNext;
  handleRestartRef.current = handleRestart;

  useEffect(() => {
    if (phase !== "training") return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey && event.key === "Enter" && !hasCheckedCurrent && userAnswer.trim()) {
        event.preventDefault();
        handleCheckRef.current();
      } else if (event.ctrlKey && event.key === "ArrowRight" && hasCheckedCurrent) {
        event.preventDefault();
        handleNextRef.current();
      } else if (event.key === "Escape") {
        event.preventDefault();
        handleRestartRef.current();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, hasCheckedCurrent, userAnswer]);

  const recapStats = useMemo(() => {
    let correct = 0;
    let incorrect = 0;
    let skipped = 0;
    for (const result of results) {
      if (!result.evaluation) skipped += 1;
      else if (result.evaluation.isCorrect) correct += 1;
      else incorrect += 1;
    }
    return { correct, incorrect, skipped };
  }, [results]);

  // --- SETUP ---
  if (phase === "setup") {
    return (
      <div className="phrasesSetup">
        <div className="phrasesSetup__header">
          <h1 className="phrasesSetup__title">JLPT N5</h1>
          <p className="phrasesSetup__subtitle">
            Entraîne-toi avec du vocabulaire et des phrases de niveau JLPT N5 générés par l'IA.
          </p>
        </div>

        {quota && <QuotaBar quota={quota} />}

        {/* Exercise type */}
        <div className="phrasesSetup__section">
          <h2 className="phrasesSetup__sectionTitle">Type d'exercice</h2>
          <div className="phrasesSetup__optionRow">
            {(["words", "phrases", "paragraph"] as const).map((type) => {
              const typeLabels = { words: "Mots", phrases: "Phrases", paragraph: "Paragraphe" };
              return (
                <label
                  key={type}
                  className={`phrasesSetup__radioOption ${exerciseType === type ? "phrasesSetup__radioOption--active" : ""}`}
                >
                  <input
                    type="radio"
                    name="exerciseType"
                    checked={exerciseType === type}
                    onChange={() => setExerciseType(type)}
                  />
                  {typeLabels[type]}
                </label>
              );
            })}
          </div>
        </div>

        {/* Direction */}
        <div className="phrasesSetup__section">
          <h2 className="phrasesSetup__sectionTitle">Direction</h2>
          <div className="phrasesSetup__optionRow">
            <label
              className={`phrasesSetup__radioOption ${direction === "fr-to-jp" ? "phrasesSetup__radioOption--active" : ""}`}
            >
              <input
                type="radio"
                name="direction"
                checked={direction === "fr-to-jp"}
                onChange={() => setDirection("fr-to-jp")}
              />
              Français → Japonais
            </label>
            <label
              className={`phrasesSetup__radioOption ${direction === "jp-to-fr" ? "phrasesSetup__radioOption--active" : ""}`}
            >
              <input
                type="radio"
                name="direction"
                checked={direction === "jp-to-fr"}
                onChange={() => setDirection("jp-to-fr")}
              />
              Japonais → Français
            </label>
          </div>
        </div>

        {/* Kanji */}
        <div className="phrasesSetup__section">
          <h2 className="phrasesSetup__sectionTitle">Kanji</h2>
          <div className="phrasesSetup__optionRow">
            <label
              className={`phrasesSetup__radioOption ${withKanji ? "phrasesSetup__radioOption--active" : ""}`}
            >
              <input
                type="radio"
                name="withKanji"
                checked={withKanji}
                onChange={() => setWithKanji(true)}
              />
              Avec kanji
            </label>
            <label
              className={`phrasesSetup__radioOption ${!withKanji ? "phrasesSetup__radioOption--active" : ""}`}
            >
              <input
                type="radio"
                name="withKanji"
                checked={!withKanji}
                onChange={() => setWithKanji(false)}
              />
              Sans kanji (espaces après particules)
            </label>
          </div>
        </div>

        {/* Count (not for paragraph) */}
        {exerciseType !== "paragraph" && (
          <div className="phrasesSetup__section">
            <h2 className="phrasesSetup__sectionTitle">
              Nombre {exerciseType === "words" ? "de mots" : "de phrases"}
            </h2>
            <div className="phrasesSetup__optionRow">
              {[3, 5, 8, 10, 15].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={`button ${exerciseCount === count ? "button--primary" : ""}`}
                  onClick={() => setExerciseCount(count)}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Paragraph length */}
        {exerciseType === "paragraph" && (
          <div className="phrasesSetup__section">
            <h2 className="phrasesSetup__sectionTitle">Longueur du paragraphe</h2>
            <div className="phrasesSetup__optionRow">
              {(["short", "medium", "long"] as const).map((length) => {
                const lengthLabels = {
                  short: "Court (2-3 phrases)",
                  medium: "Moyen (4-5 phrases)",
                  long: "Long (6-8 phrases)",
                };
                return (
                  <label
                    key={length}
                    className={`phrasesSetup__radioOption ${paragraphLength === length ? "phrasesSetup__radioOption--active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="paragraphLength"
                      checked={paragraphLength === length}
                      onChange={() => setParagraphLength(length)}
                    />
                    {lengthLabels[length]}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {errorMessage && <div className="formError">{errorMessage}</div>}

        <div className="phrasesSetup__actions">
          <button
            className="button button--primary"
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? "Génération en cours..." : "Générer les exercices"}
          </button>
          <Link className="button" to="/">
            Retour
          </Link>
        </div>
      </div>
    );
  }

  // --- TRAINING ---
  if (phase === "training" && currentExercise) {
    return (
      <div className="phrasesTraining">
        <div className="phrasesTraining__progressBar">
          <div
            className="phrasesTraining__progressFill"
            style={{
              width: `${((currentIndex + (hasCheckedCurrent ? 1 : 0)) / exercises.length) * 100}%`,
            }}
          />
        </div>

        {quota && <QuotaBar quota={quota} />}

        <div className="phrasesTraining__topBar">
          <span className="phrasesTraining__counter">
            {currentIndex + 1} / {exercises.length}
          </span>
          <button
            className="button"
            type="button"
            onClick={() => {
              if (currentExercise && !hasCheckedCurrent) {
                setResults((previous) => [
                  ...previous,
                  { exercise: currentExercise, userAnswer: "", evaluation: null },
                ]);
              }
              setPhase("recap");
            }}
          >
            Terminer
          </button>
        </div>

        <div className="phrasesTraining__card">
          <div className="phrasesTraining__prompt">{currentExercise.prompt}</div>

          <div className="phrasesTraining__inputArea">
            <div className="phrasesTraining__inputRow">
              <textarea
                className="phrasesTraining__textarea"
                placeholder={
                  direction === "fr-to-jp"
                    ? "Écris ta réponse en japonais..."
                    : "Écris ta réponse en français..."
                }
                value={userAnswer}
                onChange={(event) => setUserAnswer(event.target.value)}
                disabled={hasCheckedCurrent}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !hasCheckedCurrent) {
                    event.preventDefault();
                    handleCheck();
                  }
                }}
                rows={exerciseType === "paragraph" ? 5 : 2}
              />
              <VoiceButton
                onTranscript={handleVoiceTranscript}
                lang={direction === "fr-to-jp" ? "ja-JP" : "fr-FR"}
                disabled={hasCheckedCurrent}
              />
            </div>
          </div>

          {!hasCheckedCurrent && (
            <div className="phrasesTraining__actionRow">
              <button
                className="button button--primary"
                type="button"
                onClick={handleCheck}
                disabled={!userAnswer.trim() || isEvaluating}
              >
                {isEvaluating ? "Vérification..." : "Vérifier"}
                <kbd className="kbdHint">Ctrl+↵</kbd>
              </button>
              <button className="button" type="button" onClick={handleSkip}>
                Passer
              </button>
            </div>
          )}

          {errorMessage && !hasCheckedCurrent && (
            <div className="formError" style={{ marginTop: "var(--space-4)" }}>
              {errorMessage}
            </div>
          )}

          {hasCheckedCurrent && currentEvaluation && (
            <div className="phrasesTraining__feedback">
              <div
                className={`phrasesTraining__resultBadge ${currentEvaluation.isCorrect ? "phrasesTraining__resultBadge--success" : "phrasesTraining__resultBadge--error"}`}
              >
                {currentEvaluation.isCorrect ? "✓ Réussi" : "✗ Incorrect"}
              </div>

              <div className="phrasesTraining__expectedAnswer">
                <div className="phrasesTraining__expectedLabel">Réponse attendue</div>
                <div className="phrasesTraining__expectedKanji">{currentExercise.answer}</div>
                {currentExercise.answerAlt && (
                  <div className="phrasesTraining__expectedKana">{currentExercise.answerAlt}</div>
                )}
              </div>

              {currentEvaluation.feedback && (
                <div className="phrasesTraining__tip">
                  <div className="phrasesTraining__tipTitle">Conseil du Prof</div>
                  <div className="phrasesTraining__tipContent">{currentEvaluation.feedback}</div>
                </div>
              )}

              {currentExercise.explanation && (
                <div className="phrasesTraining__explanation">{currentExercise.explanation}</div>
              )}

              <button
                className="button button--primary"
                type="button"
                onClick={handleNext}
                style={{ marginTop: "var(--space-5)" }}
              >
                {currentIndex + 1 >= exercises.length ? "Voir le récapitulatif" : "Suivant →"}
                <kbd className="kbdHint">Ctrl+→</kbd>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- RECAP ---
  return (
    <div className="phrasesRecap">
      <h2 className="phrasesRecap__title">Récapitulatif JLPT N5</h2>

      <div className="phrasesRecap__summary">
        <span className="phrasesRecap__stat phrasesRecap__stat--success">
          ✓ {recapStats.correct} réussie(s)
        </span>
        <span className="phrasesRecap__stat phrasesRecap__stat--error">
          ✗ {recapStats.incorrect} incorrecte(s)
        </span>
        {recapStats.skipped > 0 && (
          <span className="phrasesRecap__stat phrasesRecap__stat--skipped">
            — {recapStats.skipped} passée(s)
          </span>
        )}
      </div>

      {results.length > 0 && (
        <div className="phrasesRecap__tableWrap">
          <table className="table table--compact">
            <thead>
              <tr>
                <th>#</th>
                <th>Question</th>
                <th>Ta réponse</th>
                <th>Réponse attendue</th>
                <th>Résultat</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result, index) => (
                <tr key={result.exercise.prompt + String(index)}>
                  <td className="muted">{index + 1}</td>
                  <td>{result.exercise.prompt}</td>
                  <td>{result.userAnswer || <span className="muted">—</span>}</td>
                  <td className="muted">{result.exercise.answer}</td>
                  <td>
                    {!result.evaluation ? (
                      <span className="muted">Passée</span>
                    ) : result.evaluation.isCorrect ? (
                      <span style={{ color: "var(--color-success)" }}>✓</span>
                    ) : (
                      <span style={{ color: "var(--color-danger)" }}>✗</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {errorMessage && <div className="formError">{errorMessage}</div>}

      <div className="phrasesRecap__actions">
        <button className="button button--primary" type="button" onClick={handleRestart}>
          Recommencer
        </button>
        <Link className="button" to="/">
          Retour
        </Link>
      </div>
    </div>
  );
}
