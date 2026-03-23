import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  type GeminiQuota,
  type GeneratedPhrase,
  type PhraseConstraints,
  type PhraseEvaluation,
  type Tag,
  evaluatePhrase,
  fetchGeminiQuota,
  fetchTags,
  generatePhrases,
  submitBulkReviews,
} from "../../api";
import { QuotaBar } from "../components/QuotaBar";

type PhrasesPhase = "setup" | "training" | "recap";

const AVAILABLE_PARTICLES = ["は", "が", "を", "に", "で", "へ", "と", "も", "から", "まで"];

const TENSE_OPTIONS: Array<{ value: PhraseConstraints["tense"]; label: string }> = [
  { value: "present", label: "Présent" },
  { value: "past", label: "Passé" },
  { value: "te-form", label: "Forme en -te" },
];

const POLARITY_OPTIONS: Array<{ value: PhraseConstraints["polarity"]; label: string }> = [
  { value: "affirmative", label: "Affirmatif" },
  { value: "negative", label: "Négatif" },
];

const POLITENESS_OPTIONS: Array<{ value: PhraseConstraints["politeness"]; label: string }> = [
  { value: "casual", label: "Courant" },
  { value: "polite", label: "Poli (Desu/Masu)" },
];

type PhraseResult = {
  phrase: GeneratedPhrase;
  userAnswer: string;
  evaluation: PhraseEvaluation | null;
};

export function PhrasesPage() {
  const [phase, setPhase] = useState<PhrasesPhase>("setup");

  const [tags, setTags] = useState<Tag[] | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [selectedParticles, setSelectedParticles] = useState<string[]>(["は", "が"]);
  const [tense, setTense] = useState<PhraseConstraints["tense"]>("present");
  const [polarity, setPolarity] = useState<PhraseConstraints["polarity"]>("affirmative");
  const [politeness, setPoliteness] = useState<PhraseConstraints["politeness"]>("casual");
  const [phraseCount, setPhraseCount] = useState<number>(3);
  const [customContext, setCustomContext] = useState<string>("");

  const [phrases, setPhrases] = useState<GeneratedPhrase[]>([]);
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [results, setResults] = useState<PhraseResult[]>([]);
  const [currentEvaluation, setCurrentEvaluation] = useState<PhraseEvaluation | null>(null);
  const [hasCheckedCurrent, setHasCheckedCurrent] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isSubmittingReviews, setIsSubmittingReviews] = useState(false);
  const [reviewsSubmitted, setReviewsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quota, setQuota] = useState<GeminiQuota | null>(null);

  function refreshQuota() {
    fetchGeminiQuota()
      .then((loadedQuota) => setQuota(loadedQuota))
      .catch(() => setQuota(null));
  }

  useEffect(() => {
    let isMounted = true;
    async function loadInitialData() {
      try {
        const [loadedTags, loadedQuota] = await Promise.all([fetchTags(), fetchGeminiQuota()]);
        if (isMounted) {
          setTags(loadedTags);
          setQuota(loadedQuota);
        }
      } catch {
        if (isMounted) setTags([]);
      }
    }
    loadInitialData();
    return () => {
      isMounted = false;
    };
  }, []);

  function toggleTag(tagId: number) {
    setSelectedTagIds((previous) =>
      previous.includes(tagId) ? previous.filter((id) => id !== tagId) : [...previous, tagId],
    );
  }

  function toggleParticle(particle: string) {
    setSelectedParticles((previous) =>
      previous.includes(particle)
        ? previous.filter((p) => p !== particle)
        : [...previous, particle],
    );
  }

  const canGenerate = selectedTagIds.length > 0 && selectedParticles.length > 0;

  async function handleGenerate() {
    if (!canGenerate) return;
    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const generatedPhrases = await generatePhrases({
        tagIds: selectedTagIds,
        particles: selectedParticles,
        tense,
        polarity,
        politeness,
        count: phraseCount,
        customContext: customContext.trim() || undefined,
      });
      setPhrases(generatedPhrases);
      setCurrentPhraseIndex(0);
      setUserAnswer("");
      setResults([]);
      setCurrentEvaluation(null);
      setHasCheckedCurrent(false);
      setReviewsSubmitted(false);
      setPhase("training");
      refreshQuota();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setIsGenerating(false);
    }
  }

  const currentPhrase = phrases[currentPhraseIndex] ?? null;

  async function handleCheck() {
    if (!currentPhrase || !userAnswer.trim()) return;
    setIsEvaluating(true);
    setErrorMessage(null);

    try {
      const evaluation = await evaluatePhrase(
        userAnswer.trim(),
        currentPhrase.jp_kanji || currentPhrase.jp_kana,
        currentPhrase.fr,
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

  function handleNextPhrase() {
    if (!currentPhrase) return;
    setResults((previous) => [
      ...previous,
      {
        phrase: currentPhrase,
        userAnswer,
        evaluation: currentEvaluation,
      },
    ]);

    const nextIndex = currentPhraseIndex + 1;
    if (nextIndex >= phrases.length) {
      setPhase("recap");
    } else {
      setCurrentPhraseIndex(nextIndex);
      setUserAnswer("");
      setCurrentEvaluation(null);
      setHasCheckedCurrent(false);
      setErrorMessage(null);
    }
  }

  function handleSkipPhrase() {
    if (!currentPhrase) return;
    setResults((previous) => [
      ...previous,
      {
        phrase: currentPhrase,
        userAnswer: "",
        evaluation: null,
      },
    ]);

    const nextIndex = currentPhraseIndex + 1;
    if (nextIndex >= phrases.length) {
      setPhase("recap");
    } else {
      setCurrentPhraseIndex(nextIndex);
      setUserAnswer("");
      setCurrentEvaluation(null);
      setHasCheckedCurrent(false);
      setErrorMessage(null);
    }
  }

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

  const allWordIdsForSrs = useMemo(() => {
    const successWordIds: number[] = [];
    const failWordIds: number[] = [];
    for (const result of results) {
      if (!result.evaluation) continue;
      const wordIds = result.phrase.wordIds ?? [];
      if (result.evaluation.isCorrect) {
        for (const wordId of wordIds) successWordIds.push(wordId);
      } else {
        for (const wordId of wordIds) failWordIds.push(wordId);
      }
    }
    return { successWordIds, failWordIds };
  }, [results]);

  async function handleSubmitReviews() {
    const reviews: Array<{ wordId: number; result: "success" | "fail" }> = [];
    const seen = new Set<number>();

    for (const wordId of allWordIdsForSrs.successWordIds) {
      if (!seen.has(wordId)) {
        reviews.push({ wordId, result: "success" });
        seen.add(wordId);
      }
    }
    for (const wordId of allWordIdsForSrs.failWordIds) {
      if (!seen.has(wordId)) {
        reviews.push({ wordId, result: "fail" });
        seen.add(wordId);
      }
    }

    if (reviews.length === 0) {
      setReviewsSubmitted(true);
      return;
    }

    setIsSubmittingReviews(true);
    try {
      await submitBulkReviews(reviews);
      setReviewsSubmitted(true);
    } catch {
      setErrorMessage("Erreur lors de l'enregistrement SRS.");
    } finally {
      setIsSubmittingReviews(false);
    }
  }

  function handleRestart() {
    setPhase("setup");
    setPhrases([]);
    setCurrentPhraseIndex(0);
    setUserAnswer("");
    setResults([]);
    setCurrentEvaluation(null);
    setHasCheckedCurrent(false);
    setErrorMessage(null);
    setReviewsSubmitted(false);
  }

  // --- SETUP PHASE ---
  if (phase === "setup") {
    return (
      <div className="phrasesSetup">
        <div className="phrasesSetup__header">
          <h1 className="phrasesSetup__title">Production de phrases</h1>
          <p className="phrasesSetup__subtitle">
            Sélectionne des tags et configure les contraintes grammaticales pour générer des phrases
            d'entraînement.
          </p>
        </div>

        {quota && <QuotaBar quota={quota} />}

        {/* Tag selection */}
        <div className="phrasesSetup__section">
          <h2 className="phrasesSetup__sectionTitle">Tags (vocabulaire)</h2>
          {tags === null ? (
            <div className="muted">Chargement des tags...</div>
          ) : tags.length === 0 ? (
            <div className="muted">
              Aucun tag trouvé. <Link to="/words">Ajoute des mots avec des tags</Link> pour
              commencer.
            </div>
          ) : (
            <div className="phrasesSetup__tagGrid">
              {tags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.id);
                const checkboxId = `phrases-tag-${tag.id}`;
                return (
                  <label
                    key={tag.id}
                    htmlFor={checkboxId}
                    className={`phrasesSetup__tagChip ${isSelected ? "phrasesSetup__tagChip--active" : ""}`}
                  >
                    <input
                      id={checkboxId}
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleTag(tag.id)}
                      style={{ cursor: "pointer" }}
                    />
                    {tag.name}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Particles */}
        <div className="phrasesSetup__section">
          <h2 className="phrasesSetup__sectionTitle">Particules</h2>
          <div className="phrasesSetup__particleGrid">
            {AVAILABLE_PARTICLES.map((particle) => {
              const isSelected = selectedParticles.includes(particle);
              return (
                <button
                  key={particle}
                  type="button"
                  className={`phrasesSetup__particleBtn ${isSelected ? "phrasesSetup__particleBtn--active" : ""}`}
                  onClick={() => toggleParticle(particle)}
                >
                  {particle}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tense */}
        <div className="phrasesSetup__section">
          <h2 className="phrasesSetup__sectionTitle">Temps</h2>
          <div className="phrasesSetup__optionRow">
            {TENSE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`phrasesSetup__radioOption ${tense === option.value ? "phrasesSetup__radioOption--active" : ""}`}
              >
                <input
                  type="radio"
                  name="tense"
                  checked={tense === option.value}
                  onChange={() => setTense(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        {/* Polarity */}
        <div className="phrasesSetup__section">
          <h2 className="phrasesSetup__sectionTitle">Polarité</h2>
          <div className="phrasesSetup__optionRow">
            {POLARITY_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`phrasesSetup__radioOption ${polarity === option.value ? "phrasesSetup__radioOption--active" : ""}`}
              >
                <input
                  type="radio"
                  name="polarity"
                  checked={polarity === option.value}
                  onChange={() => setPolarity(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        {/* Politeness */}
        <div className="phrasesSetup__section">
          <h2 className="phrasesSetup__sectionTitle">Politesse</h2>
          <div className="phrasesSetup__optionRow">
            {POLITENESS_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`phrasesSetup__radioOption ${politeness === option.value ? "phrasesSetup__radioOption--active" : ""}`}
              >
                <input
                  type="radio"
                  name="politeness"
                  checked={politeness === option.value}
                  onChange={() => setPoliteness(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        {/* Count */}
        <div className="phrasesSetup__section">
          <h2 className="phrasesSetup__sectionTitle">Nombre de phrases</h2>
          <div className="phrasesSetup__optionRow">
            {[1, 3, 5, 8, 10].map((count) => (
              <button
                key={count}
                type="button"
                className={`button ${phraseCount === count ? "button--primary" : ""}`}
                onClick={() => setPhraseCount(count)}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        {/* Custom context */}
        <div className="phrasesSetup__section">
          <h2 className="phrasesSetup__sectionTitle">Contexte personnalisé (optionnel)</h2>
          <textarea
            placeholder="Ex : Je prépare le JLPT N5, utilise des phrases simples du quotidien…"
            value={customContext}
            onChange={(event) => setCustomContext(event.target.value)}
            maxLength={500}
            rows={3}
            style={{
              width: "100%",
              padding: "10px 14px",
              fontSize: "15px",
              border: "2px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
          <div className="muted" style={{ fontSize: "13px", marginTop: "var(--space-2)" }}>
            {customContext.length}/500
          </div>
        </div>

        {errorMessage && <div className="formError">{errorMessage}</div>}

        <div className="phrasesSetup__actions">
          <button
            className="button button--primary"
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
          >
            {isGenerating ? "Génération en cours..." : "Générer les phrases"}
          </button>
          <Link className="button" to="/">
            Retour
          </Link>
        </div>
      </div>
    );
  }

  // --- TRAINING PHASE ---
  if (phase === "training" && currentPhrase) {
    return (
      <div className="phrasesTraining">
        <div className="phrasesTraining__progressBar">
          <div
            className="phrasesTraining__progressFill"
            style={{
              width: `${((currentPhraseIndex + (hasCheckedCurrent ? 1 : 0)) / phrases.length) * 100}%`,
            }}
          />
        </div>

        {quota && <QuotaBar quota={quota} />}

        <div className="phrasesTraining__topBar">
          <span className="phrasesTraining__counter">
            Phrase {currentPhraseIndex + 1} / {phrases.length}
          </span>
          <button
            className="button"
            type="button"
            onClick={() => {
              if (currentPhrase && !hasCheckedCurrent) {
                setResults((previous) => [
                  ...previous,
                  { phrase: currentPhrase, userAnswer: "", evaluation: null },
                ]);
              }
              setPhase("recap");
            }}
          >
            Terminer
          </button>
        </div>

        <div className="phrasesTraining__card">
          <div className="phrasesTraining__prompt">{currentPhrase.fr}</div>

          <div className="phrasesTraining__inputArea">
            <textarea
              className="phrasesTraining__textarea"
              placeholder="Écris ta réponse en japonais..."
              value={userAnswer}
              onChange={(event) => setUserAnswer(event.target.value)}
              disabled={hasCheckedCurrent}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !hasCheckedCurrent) {
                  event.preventDefault();
                  handleCheck();
                }
              }}
              rows={2}
            />
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
              </button>
              <button className="button" type="button" onClick={handleSkipPhrase}>
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
                <div className="phrasesTraining__expectedKanji">{currentPhrase.jp_kanji}</div>
                <div className="phrasesTraining__expectedKana">{currentPhrase.jp_kana}</div>
              </div>

              {currentEvaluation.feedback && (
                <div className="phrasesTraining__tip">
                  <div className="phrasesTraining__tipTitle">Conseil du Prof</div>
                  <div className="phrasesTraining__tipContent">{currentEvaluation.feedback}</div>
                </div>
              )}

              {currentPhrase.explanation && (
                <div className="phrasesTraining__explanation">{currentPhrase.explanation}</div>
              )}

              <button
                className="button button--primary"
                type="button"
                onClick={handleNextPhrase}
                style={{ marginTop: "var(--space-5)" }}
              >
                {currentPhraseIndex + 1 >= phrases.length
                  ? "Voir le récapitulatif"
                  : "Phrase suivante →"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- RECAP PHASE ---
  return (
    <div className="phrasesRecap">
      <h2 className="phrasesRecap__title">Récapitulatif</h2>

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
                <th>Phrase FR</th>
                <th>Ta réponse</th>
                <th>Réponse attendue</th>
                <th>Résultat</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result, index) => (
                <tr key={result.phrase.fr + String(index)}>
                  <td className="muted">{index + 1}</td>
                  <td>{result.phrase.fr}</td>
                  <td>{result.userAnswer || <span className="muted">—</span>}</td>
                  <td className="muted">{result.phrase.jp_kanji}</td>
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
        <button
          className="button button--primary"
          type="button"
          onClick={handleSubmitReviews}
          disabled={isSubmittingReviews || reviewsSubmitted}
        >
          {reviewsSubmitted ? "SRS enregistré" : "Enregistrer dans le SRS"}
        </button>
        <button className="button" type="button" onClick={handleRestart}>
          Recommencer
        </button>
        <Link className="button" to="/">
          Retour aux séries
        </Link>
      </div>
    </div>
  );
}
