import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  type ConjugationEvaluation,
  type ConjugationExercise,
  type GeminiQuota,
  type Tag,
  type WordWithStats,
  evaluateConjugation,
  fetchGeminiQuota,
  fetchSeriesWords,
  fetchTags,
  generateConjugationExercises,
} from "../../api";
import { QuotaBar } from "../components/QuotaBar";

type ConjugationPhase = "setup" | "generating" | "training" | "recap";

type ConjugationResult = {
  exercise: ConjugationExercise;
  userAnswer: string;
  evaluation: ConjugationEvaluation | null;
};

const ALL_FORMS = [
  "forme polie (ます)",
  "forme négative (ない)",
  "forme passée (た)",
  "forme -te (て)",
  "forme potentielle",
  "forme volitif (よう)",
  "forme conditionnelle (ば)",
  "forme impérative",
  "forme passive",
  "forme causative",
];

export function ConjugationPage() {
  const [phase, setPhase] = useState<ConjugationPhase>("setup");
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [selectedForms, setSelectedForms] = useState<Set<string>>(
    new Set(["forme polie (ます)", "forme -te (て)"]),
  );
  const [exerciseCount, setExerciseCount] = useState(10);

  const [exercises, setExercises] = useState<ConjugationExercise[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [results, setResults] = useState<ConjugationResult[]>([]);
  const [currentEvaluation, setCurrentEvaluation] = useState<ConjugationEvaluation | null>(null);
  const [hasChecked, setHasChecked] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quota, setQuota] = useState<GeminiQuota | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchTags()
      .then(setTags)
      .catch(() => {});
    fetchGeminiQuota()
      .then(setQuota)
      .catch(() => {});
  }, []);

  function toggleForm(form: string) {
    setSelectedForms((previous) => {
      const next = new Set(previous);
      if (next.has(form)) next.delete(form);
      else next.add(form);
      return next;
    });
  }

  async function handleGenerate() {
    if (!selectedTagId || selectedForms.size === 0) return;
    setPhase("generating");
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const words = await fetchSeriesWords(selectedTagId);
      const verbWords = words.map((word) => ({
        french: word.french,
        kana: word.kana ?? undefined,
        kanji: word.kanji ?? undefined,
      }));
      if (verbWords.length === 0) {
        setErrorMessage("Aucun mot dans cette série");
        setPhase("setup");
        return;
      }
      const result = await generateConjugationExercises(
        verbWords.slice(0, 20),
        Array.from(selectedForms),
        exerciseCount,
      );
      setExercises(result.exercises);
      setQuota(result.quota);
      setCurrentIndex(0);
      setResults([]);
      setCurrentEvaluation(null);
      setHasChecked(false);
      setUserAnswer("");
      setPhase("training");
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur de génération");
      setPhase("setup");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCheck() {
    if (!exercises[currentIndex] || isEvaluating) return;
    setIsEvaluating(true);
    setErrorMessage(null);
    try {
      const exercise = exercises[currentIndex];
      const result = await evaluateConjugation(exercise.prompt, exercise.answer, userAnswer);
      setCurrentEvaluation(result.evaluation);
      setQuota(result.quota);
      setHasChecked(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur d'évaluation");
    } finally {
      setIsEvaluating(false);
    }
  }

  function handleNext() {
    const exercise = exercises[currentIndex];
    setResults((previous) => [
      ...previous,
      { exercise, userAnswer, evaluation: currentEvaluation },
    ]);
    if (currentIndex < exercises.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setUserAnswer("");
      setCurrentEvaluation(null);
      setHasChecked(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setPhase("recap");
    }
  }

  const currentExercise = exercises[currentIndex] ?? null;

  // ---- SETUP ----
  if (phase === "setup" || phase === "generating") {
    return (
      <div>
        <div className="pageHeader">
          <h1 className="pageTitle">Conjugaison</h1>
          <p className="pageSubtitle">
            Pratique les formes verbales japonaises avec ton vocabulaire
          </p>
        </div>

        {quota && <QuotaBar quota={quota} />}

        <div className="trainSetup">
          <div className="field">
            <div className="field__label">Série (source de verbes)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className={`phrasesSetup__tagChip ${selectedTagId === tag.id ? "phrasesSetup__tagChip--active" : ""}`}
                  onClick={() => setSelectedTagId(tag.id)}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="field__label">Formes à pratiquer</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
              {ALL_FORMS.map((form) => (
                <button
                  key={form}
                  type="button"
                  className={`phrasesSetup__particleBtn ${selectedForms.has(form) ? "phrasesSetup__particleBtn--active" : ""}`}
                  onClick={() => toggleForm(form)}
                >
                  {form}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="field__label">Nombre d'exercices</div>
            <div className="phrasesSetup__optionRow">
              {[5, 10, 15, 20].map((count) => (
                <label
                  key={count}
                  className={`phrasesSetup__radioOption ${exerciseCount === count ? "phrasesSetup__radioOption--active" : ""}`}
                >
                  <input
                    type="radio"
                    name="exCount"
                    checked={exerciseCount === count}
                    onChange={() => setExerciseCount(count)}
                  />
                  {count}
                </label>
              ))}
            </div>
          </div>

          {errorMessage && <div className="formError">{errorMessage}</div>}

          <button
            className="button button--primary"
            type="button"
            onClick={handleGenerate}
            disabled={!selectedTagId || selectedForms.size === 0 || isGenerating}
            style={{ marginTop: "var(--space-4)" }}
          >
            {isGenerating ? "Génération…" : "Commencer"}
          </button>
        </div>
      </div>
    );
  }

  // ---- TRAINING ----
  if (phase === "training" && currentExercise) {
    return (
      <div>
        <div className="pageHeader">
          <h1 className="pageTitle">Conjugaison</h1>
          <p className="pageSubtitle">
            {currentIndex + 1} / {exercises.length}
          </p>
        </div>

        <div className="trainSession__card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: "var(--space-3)" }}>
            {currentExercise.prompt}
          </div>
        </div>

        <div style={{ maxWidth: 400, margin: "var(--space-4) auto" }}>
          <input
            ref={inputRef}
            className="input"
            value={userAnswer}
            onChange={(event) => setUserAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                if (!hasChecked) handleCheck();
                else handleNext();
              }
            }}
            placeholder="Ta conjugaison…"
            disabled={hasChecked}
          />

          {hasChecked && currentEvaluation && (
            <div style={{ marginTop: "var(--space-3)" }}>
              <div
                className={`phrasesTraining__resultBadge ${currentEvaluation.isCorrect ? "phrasesTraining__resultBadge--success" : "phrasesTraining__resultBadge--error"}`}
              >
                {currentEvaluation.isCorrect ? "✓ Correct" : "✗ Incorrect"}
              </div>
              <div className="muted" style={{ marginTop: "var(--space-2)", fontSize: 14 }}>
                Réponse attendue : <strong>{currentExercise.answer}</strong>
              </div>
              {currentEvaluation.explanation && (
                <div className="muted" style={{ marginTop: "var(--space-1)", fontSize: 13 }}>
                  {currentEvaluation.explanation}
                </div>
              )}
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: "var(--space-3)",
              marginTop: "var(--space-3)",
              justifyContent: "center",
            }}
          >
            {!hasChecked ? (
              <button
                className="button button--primary"
                type="button"
                onClick={handleCheck}
                disabled={!userAnswer.trim() || isEvaluating}
              >
                {isEvaluating ? "Vérification…" : "Vérifier"}
              </button>
            ) : (
              <button className="button button--primary" type="button" onClick={handleNext}>
                {currentIndex === exercises.length - 1 ? "Terminer" : "Suivant →"}
              </button>
            )}
          </div>
        </div>

        {errorMessage && (
          <div className="formError" style={{ textAlign: "center", marginTop: "var(--space-3)" }}>
            {errorMessage}
          </div>
        )}
      </div>
    );
  }

  // ---- RECAP ----
  const finalResults = phase === "recap" ? results : [];
  const recapStats = useMemo(() => {
    let correct = 0;
    let incorrect = 0;
    for (const result of finalResults) {
      if (result.evaluation?.isCorrect) correct++;
      else incorrect++;
    }
    return { correct, incorrect };
  }, [finalResults]);

  return (
    <div className="phrasesRecap">
      <h2 className="phrasesRecap__title">Résultats de Conjugaison</h2>

      <div className="phrasesRecap__summary">
        <span className="phrasesRecap__stat phrasesRecap__stat--success">
          ✓ {recapStats.correct} réussi(s)
        </span>
        <span className="phrasesRecap__stat phrasesRecap__stat--error">
          ✗ {recapStats.incorrect} raté(s)
        </span>
      </div>

      {finalResults.length > 0 && (
        <div className="phrasesRecap__tableWrap">
          <table className="table table--compact">
            <thead>
              <tr>
                <th>#</th>
                <th>Consigne</th>
                <th>Ta réponse</th>
                <th>Attendue</th>
                <th>Résultat</th>
              </tr>
            </thead>
            <tbody>
              {finalResults.map((result, index) => (
                <tr key={result.exercise.prompt + String(index)}>
                  <td className="muted">{index + 1}</td>
                  <td>{result.exercise.prompt}</td>
                  <td>{result.userAnswer || <span className="muted">—</span>}</td>
                  <td className="muted">{result.exercise.answer}</td>
                  <td>
                    {result.evaluation?.isCorrect ? (
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
        <button
          className="button button--primary"
          type="button"
          onClick={() => {
            setPhase("setup");
            setExercises([]);
            setResults([]);
            setCurrentIndex(0);
            setCurrentEvaluation(null);
            setHasChecked(false);
            setUserAnswer("");
            setErrorMessage(null);
          }}
        >
          Recommencer
        </button>
        <Link className="button" to="/">
          Retour
        </Link>
      </div>
    </div>
  );
}
