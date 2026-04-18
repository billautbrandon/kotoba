import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  type DialogueDifficulty,
  type DialogueScenario,
  type DialogueTurn,
  type GeminiQuota,
  type PhraseEvaluation,
  type Tag,
  evaluateDialogue,
  fetchGeminiQuota,
  fetchTags,
  generateDialogue,
  submitBulkReviews,
} from "../../api";
import { AnswerDiff } from "../components/AnswerDiff";
import { QuotaBar } from "../components/QuotaBar";
import { VoiceButton } from "../components/VoiceButton";

type DialoguePhase = "setup" | "training" | "recap";

type DialogueResult = {
  turn: DialogueTurn;
  userTranscript: string;
  evaluation: PhraseEvaluation | null;
};

const DIALOGUE_SETTINGS_KEY = "kotoba.dialogueSettings.v1";

type PersistedDialogueSettings = {
  selectedTagIds: number[];
  scenario: DialogueScenario;
  difficulty: DialogueDifficulty;
  exchangeCount: number;
  customContext: string;
};

function loadDialogueSettings(): Partial<PersistedDialogueSettings> | null {
  try {
    const raw = window.localStorage.getItem(DIALOGUE_SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<PersistedDialogueSettings>;
  } catch {
    return null;
  }
}

function saveDialogueSettings(settings: PersistedDialogueSettings): void {
  try {
    window.localStorage.setItem(DIALOGUE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

const SCENARIO_OPTIONS: Array<{ value: DialogueScenario; label: string }> = [
  { value: "restaurant", label: "Restaurant" },
  { value: "voyage", label: "Voyage" },
  { value: "famille", label: "Famille" },
  { value: "travail", label: "Travail" },
  { value: "ecole", label: "École" },
  { value: "libre", label: "Libre" },
];

const DIFFICULTY_OPTIONS: Array<{ value: DialogueDifficulty; label: string }> = [
  { value: "debutant", label: "Débutant" },
  { value: "intermediaire", label: "Intermédiaire" },
];

export function DialoguePage() {
  const persisted = useMemo(() => loadDialogueSettings(), []);

  const [phase, setPhase] = useState<DialoguePhase>("setup");
  const [tags, setTags] = useState<Tag[]>([]);
  const [quota, setQuota] = useState<GeminiQuota | null>(null);

  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(persisted?.selectedTagIds ?? []);
  const [scenario, setScenario] = useState<DialogueScenario>(persisted?.scenario ?? "restaurant");
  const [difficulty, setDifficulty] = useState<DialogueDifficulty>(
    persisted?.difficulty ?? "debutant",
  );
  const [exchangeCount, setExchangeCount] = useState<number>(persisted?.exchangeCount ?? 4);
  const [customContext, setCustomContext] = useState<string>(persisted?.customContext ?? "");
  const [showContext, setShowContext] = useState(Boolean(persisted?.customContext));

  const [turns, setTurns] = useState<DialogueTurn[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userTranscript, setUserTranscript] = useState("");
  const [currentEvaluation, setCurrentEvaluation] = useState<PhraseEvaluation | null>(null);
  const [hasCheckedCurrent, setHasCheckedCurrent] = useState(false);
  const [results, setResults] = useState<DialogueResult[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isSubmittingReviews, setIsSubmittingReviews] = useState(false);
  const [reviewsSubmitted, setReviewsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    Promise.all([fetchTags(), fetchGeminiQuota()])
      .then(([loadedTags, loadedQuota]) => {
        setTags(loadedTags);
        setQuota(loadedQuota);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    saveDialogueSettings({
      selectedTagIds,
      scenario,
      difficulty,
      exchangeCount,
      customContext,
    });
  }, [selectedTagIds, scenario, difficulty, exchangeCount, customContext]);

  function refreshQuota() {
    fetchGeminiQuota()
      .then(setQuota)
      .catch(() => {});
  }

  function toggleTag(tagId: number) {
    setSelectedTagIds((previous) =>
      previous.includes(tagId) ? previous.filter((id) => id !== tagId) : [...previous, tagId],
    );
  }

  const canGenerate = selectedTagIds.length > 0;

  async function handleGenerate() {
    if (!canGenerate) return;
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const generatedTurns = await generateDialogue({
        tagIds: selectedTagIds,
        scenario,
        difficulty,
        count: exchangeCount,
        customContext: customContext.trim() || undefined,
      });
      setTurns(generatedTurns);
      setCurrentIndex(0);
      setUserTranscript("");
      setCurrentEvaluation(null);
      setHasCheckedCurrent(false);
      setResults([]);
      setReviewsSubmitted(false);
      setPhase("training");
      refreshQuota();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setIsGenerating(false);
    }
  }

  const currentTurn = turns[currentIndex] ?? null;

  async function handleCheck() {
    if (!currentTurn || !userTranscript.trim()) return;
    setIsEvaluating(true);
    setErrorMessage(null);
    try {
      const evaluation = await evaluateDialogue(
        userTranscript.trim(),
        currentTurn.expected_jp,
        currentTurn.fr,
        currentTurn.context,
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

  function advanceToNext() {
    if (!currentTurn) return;
    setResults((previous) => [
      ...previous,
      { turn: currentTurn, userTranscript, evaluation: currentEvaluation },
    ]);
    const nextIndex = currentIndex + 1;
    if (nextIndex >= turns.length) {
      setPhase("recap");
    } else {
      setCurrentIndex(nextIndex);
      setUserTranscript("");
      setCurrentEvaluation(null);
      setHasCheckedCurrent(false);
      setErrorMessage(null);
    }
  }

  function handleSkip() {
    if (!currentTurn) return;
    setResults((previous) => [
      ...previous,
      { turn: currentTurn, userTranscript: "", evaluation: null },
    ]);
    const nextIndex = currentIndex + 1;
    if (nextIndex >= turns.length) {
      setPhase("recap");
    } else {
      setCurrentIndex(nextIndex);
      setUserTranscript("");
      setCurrentEvaluation(null);
      setHasCheckedCurrent(false);
      setErrorMessage(null);
    }
  }

  function handleFinishEarly() {
    if (currentTurn && !hasCheckedCurrent) {
      setResults((previous) => [
        ...previous,
        { turn: currentTurn, userTranscript: "", evaluation: null },
      ]);
    }
    setPhase("recap");
  }

  function handleRestart() {
    setPhase("setup");
    setTurns([]);
    setCurrentIndex(0);
    setUserTranscript("");
    setCurrentEvaluation(null);
    setHasCheckedCurrent(false);
    setResults([]);
    setErrorMessage(null);
    setReviewsSubmitted(false);
  }

  const handleVoiceTranscript = useCallback((text: string) => {
    setUserTranscript((previous) => (previous ? `${previous} ${text}` : text));
  }, []);

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

  const srsReviews = useMemo(() => {
    const successWordIds: number[] = [];
    const failWordIds: number[] = [];
    for (const result of results) {
      if (!result.evaluation) continue;
      const wordIds = result.turn.wordIds ?? [];
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
    for (const wordId of srsReviews.successWordIds) {
      if (!seen.has(wordId)) {
        reviews.push({ wordId, result: "success" });
        seen.add(wordId);
      }
    }
    for (const wordId of srsReviews.failWordIds) {
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

  // Keyboard shortcuts
  const handleCheckRef = useRef(handleCheck);
  const handleNextRef = useRef(advanceToNext);
  handleCheckRef.current = handleCheck;
  handleNextRef.current = advanceToNext;

  useEffect(() => {
    if (phase !== "training") return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey && event.key === "Enter" && !hasCheckedCurrent && userTranscript.trim()) {
        event.preventDefault();
        handleCheckRef.current();
      } else if (event.ctrlKey && event.key === "ArrowRight" && hasCheckedCurrent) {
        event.preventDefault();
        handleNextRef.current();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, hasCheckedCurrent, userTranscript]);

  // ===================== SETUP =====================
  if (phase === "setup") {
    return (
      <div className="dialoguePage">
        <div className="dialoguePage__header">
          <h1 className="dialoguePage__title">Dialogue oral</h1>
          <p className="dialoguePage__subtitle">
            Entraîne ton japonais à l'oral : choisis un scénario, parle dans le micro et reçois un
            feedback pédagogique de l'IA.
          </p>
        </div>

        {quota && <QuotaBar quota={quota} />}

        <div className="pratique__setup">
          <div className="pratique__field">
            <div className="pratique__label">Tags (vocabulaire cible)</div>
            {tags.length === 0 ? (
              <div className="muted">
                Aucun tag trouvé. <Link to="/words">Ajoute des mots avec des tags</Link> pour
                commencer.
              </div>
            ) : (
              <div className="pratique__chipGrid">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    className={`pratique__chip ${selectedTagIds.includes(tag.id) ? "pratique__chip--active" : ""}`}
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pratique__row">
            <div className="pratique__field">
              <div className="pratique__label">Scénario</div>
              <div className="pratique__toggleRow pratique__toggleRow--wrap">
                {SCENARIO_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`pratique__toggle pratique__toggle--sm ${scenario === option.value ? "pratique__toggle--active" : ""}`}
                    onClick={() => setScenario(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="pratique__field">
              <div className="pratique__label">Difficulté</div>
              <div className="pratique__toggleRow">
                {DIFFICULTY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`pratique__toggle ${difficulty === option.value ? "pratique__toggle--active" : ""}`}
                    onClick={() => setDifficulty(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pratique__field">
            <div className="pratique__label">Nombre d'échanges</div>
            <div className="pratique__toggleRow">
              {[3, 4, 5, 6, 7].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={`pratique__toggle pratique__toggle--sm ${exchangeCount === count ? "pratique__toggle--active" : ""}`}
                  onClick={() => setExchangeCount(count)}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          {!showContext ? (
            <button
              type="button"
              className="pratique__contextToggle"
              onClick={() => setShowContext(true)}
            >
              + Ajouter un contexte
            </button>
          ) : (
            <div className="pratique__field">
              <div className="pratique__label">Contexte (optionnel)</div>
              <textarea
                className="pratique__textarea"
                placeholder="Ex : Je débute, privilégie des phrases courtes…"
                value={customContext}
                onChange={(event) => setCustomContext(event.target.value)}
                maxLength={500}
                rows={2}
              />
            </div>
          )}
        </div>

        {errorMessage && <div className="formError">{errorMessage}</div>}

        <div className="pratique__actions">
          <button
            className="button button--primary"
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
          >
            {isGenerating ? "Génération…" : "Démarrer le dialogue"}
          </button>
          <Link className="button" to="/">
            Retour
          </Link>
        </div>
      </div>
    );
  }

  // ===================== TRAINING =====================
  if (phase === "training" && currentTurn) {
    return (
      <div className="dialoguePage dialoguePage--training">
        <div className="phrasesTraining__progressBar">
          <div
            className="phrasesTraining__progressFill"
            style={{
              width: `${((currentIndex + (hasCheckedCurrent ? 1 : 0)) / turns.length) * 100}%`,
            }}
          />
        </div>

        {quota && <QuotaBar quota={quota} />}

        <div className="phrasesTraining__topBar">
          <span className="phrasesTraining__counter">
            Échange {currentIndex + 1} / {turns.length}
          </span>
          <button className="button" type="button" onClick={handleFinishEarly}>
            Terminer
          </button>
        </div>

        <div className="phrasesTraining__card">
          {currentTurn.context && (
            <div className="dialogueTraining__context">{currentTurn.context}</div>
          )}
          <div className="dialogueTraining__intent">
            <span className="dialogueTraining__intentLabel">Tu dois dire :</span>
            <span className="dialogueTraining__intentText">{currentTurn.fr}</span>
          </div>

          <div className="dialogueTraining__micArea">
            <VoiceButton
              onTranscript={handleVoiceTranscript}
              lang="ja-JP"
              disabled={hasCheckedCurrent}
            />
            <div className="dialogueTraining__micHint">
              Clique sur le micro, puis prononce ta phrase en japonais. Tu peux corriger la
              transcription ci-dessous avant de valider.
            </div>
          </div>

          <textarea
            ref={textareaRef}
            className="phrasesTraining__textarea dialogueTraining__textarea"
            placeholder="Ta transcription apparaîtra ici (tu peux l'éditer avant de valider)…"
            value={userTranscript}
            onChange={(event) => setUserTranscript(event.target.value)}
            disabled={hasCheckedCurrent}
            rows={2}
          />

          {!hasCheckedCurrent && (
            <div className="phrasesTraining__actionRow">
              <button
                className="button button--primary"
                type="button"
                onClick={handleCheck}
                disabled={!userTranscript.trim() || isEvaluating}
              >
                {isEvaluating ? "Vérification…" : "Valider"}
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
                {currentEvaluation.isCorrect ? "✓ Réussi" : "✗ À revoir"}
              </div>

              <div className="phrasesTraining__expectedAnswer">
                <div className="phrasesTraining__expectedLabel">Réponse attendue</div>
                <div className="phrasesTraining__expectedKanji">{currentTurn.expected_jp}</div>
                {currentTurn.expected_kana &&
                  currentTurn.expected_kana !== currentTurn.expected_jp && (
                    <div className="phrasesTraining__expectedKana">{currentTurn.expected_kana}</div>
                  )}
              </div>

              {!currentEvaluation.isCorrect && userTranscript.trim().length > 0 && (
                <AnswerDiff
                  userAnswer={userTranscript.trim()}
                  expectedAnswer={currentTurn.expected_jp}
                  granularity="character"
                />
              )}

              {currentEvaluation.feedback && (
                <div className="phrasesTraining__tip">
                  <div className="phrasesTraining__tipTitle">Conseil du Prof</div>
                  <div className="phrasesTraining__tipContent">{currentEvaluation.feedback}</div>
                </div>
              )}

              <button
                className="button button--primary"
                type="button"
                onClick={advanceToNext}
                style={{ marginTop: "var(--space-5)" }}
              >
                {currentIndex + 1 >= turns.length ? "Voir le récapitulatif" : "Échange suivant →"}
                <kbd className="kbdHint">Ctrl+→</kbd>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===================== RECAP =====================
  return (
    <div className="phrasesRecap">
      <h2 className="phrasesRecap__title">Récapitulatif du dialogue</h2>

      <div className="phrasesRecap__summary">
        <span className="phrasesRecap__stat phrasesRecap__stat--success">
          ✓ {recapStats.correct} réussi(s)
        </span>
        <span className="phrasesRecap__stat phrasesRecap__stat--error">
          ✗ {recapStats.incorrect} à revoir
        </span>
        {recapStats.skipped > 0 && (
          <span className="phrasesRecap__stat phrasesRecap__stat--skipped">
            — {recapStats.skipped} passé(s)
          </span>
        )}
      </div>

      {results.length > 0 && (
        <div className="phrasesRecap__tableWrap">
          <table className="table table--compact">
            <thead>
              <tr>
                <th>#</th>
                <th>Intention (FR)</th>
                <th>Ta transcription</th>
                <th>Attendue (JP)</th>
                <th>Résultat</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result, index) => (
                <tr key={result.turn.fr + String(index)}>
                  <td className="muted">{index + 1}</td>
                  <td>{result.turn.fr}</td>
                  <td>{result.userTranscript || <span className="muted">—</span>}</td>
                  <td className="muted">{result.turn.expected_jp}</td>
                  <td>
                    {!result.evaluation ? (
                      <span className="muted">Passé</span>
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
          {reviewsSubmitted ? "SRS enregistré ✓" : "Enregistrer dans le SRS"}
        </button>
        <button className="button" type="button" onClick={handleRestart}>
          Recommencer
        </button>
        <Link className="button" to="/">
          Retour
        </Link>
      </div>
    </div>
  );
}
