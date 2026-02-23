import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  type WordWithStats,
  computeFailRate,
  fetchSeriesWords,
  fetchSrsWords,
  submitBulkReviews,
} from "../../api";
import { extractKanji } from "../../utils/kanji";
import { AudioButton } from "../components/AudioButton";
import { KanjiStrokeViewer } from "../components/KanjiStrokeViewer";

type TrainMode = "tag" | "srs";
type SrsCategory = "hard" | "medium" | "easy";
type SessionMode = "manual" | "timer";
type SessionRating = "success" | "partial" | "fail";
type PromptMode = "french" | "romaji" | "kana" | "kanji";

const srsCategoryLabels: Record<SrsCategory, string> = {
  hard: "Difficile",
  medium: "Moyen",
  easy: "Facile",
};

export function TrainPage(props: { mode: TrainMode }) {
  const routeParams = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tagId = props.mode === "tag" ? Number(routeParams.tagId) : null;
  const srsCategory = (routeParams.category as SrsCategory | undefined) ?? "hard";
  const tagName = searchParams.get("name") ?? null;
  const sessionMode = (searchParams.get("mode") as SessionMode | null) ?? "manual";
  const timerSeconds = Number(searchParams.get("seconds") ?? 5);
  const basePromptMode = (searchParams.get("prompt") as PromptMode | null) ?? "french";
  const shuffleMode = searchParams.get("shuffle") === "1";
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const [words, setWords] = useState<WordWithStats[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showKanjiViewer, setShowKanjiViewer] = useState(false);
  const [selectedKanjiForViewer, setSelectedKanjiForViewer] = useState<string | null>(null);

  const [isSessionFinished, setIsSessionFinished] = useState<boolean>(false);
  const [ratingsByWordId, setRatingsByWordId] = useState<Record<number, SessionRating | null>>({});
  const [isRatingsSubmitted, setIsRatingsSubmitted] = useState<boolean>(false);
  const timerHandleRef = useRef<number | null>(null);
  const [sessionStartedAtMs, setSessionStartedAtMs] = useState<number | null>(null);
  const [wordStartedAtMs, setWordStartedAtMs] = useState<number | null>(null);
  const [clockNowMs, setClockNowMs] = useState<number>(() => Date.now());

  const modeLabel = useMemo(() => {
    if (props.mode === "srs") return `SRS — ${srsCategoryLabels[srsCategory]}`;
    if (tagName) return `Série (${tagName})`;
    if (tagId) return `Série (tag ${tagId})`;
    return "Série";
  }, [props.mode, srsCategory, tagId, tagName]);

  useEffect(() => {
    let isCancelled = false;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      setIsRevealed(false);
      setCurrentIndex(0);
      setIsSessionFinished(false);
      setRatingsByWordId({});
      setIsRatingsSubmitted(false);
      const nowMs = Date.now();
      setSessionStartedAtMs(nowMs);
      setWordStartedAtMs(nowMs);

      try {
        let loadedWords: WordWithStats[];

        if (props.mode === "srs") {
          const srsData = await fetchSrsWords();
          loadedWords = srsData[srsCategory] ?? [];
        } else {
          if (!tagId || !Number.isFinite(tagId)) {
            throw new Error("Tag invalide");
          }
          loadedWords = await fetchSeriesWords(tagId);
        }

        const shuffledWords = shuffleWords(loadedWords);
        if (!isCancelled) {
          setWords(shuffledWords);
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
          setWords([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      isCancelled = true;
    };
  }, [props.mode, tagId, srsCategory]);

  const currentWord = useMemo(() => {
    if (!words || words.length === 0) return null;
    return words[currentIndex] ?? null;
  }, [words, currentIndex]);

  const currentWordId = currentWord ? currentWord.id : null;

  // Extraire les kanji du mot actuel
  const currentWordKanji = useMemo(() => {
    if (!currentWord?.kanji) return [];
    return extractKanji(currentWord.kanji);
  }, [currentWord]);

  // Ouvrir le visualiseur de kanji
  const handleShowKanjiStroke = () => {
    if (currentWordKanji.length > 0) {
      setSelectedKanjiForViewer(currentWordKanji[0]);
      setShowKanjiViewer(true);
    }
  };

  useEffect(() => {
    if (!words || words.length === 0) return;
    if (isSessionFinished) return;
    setIsRevealed(false);
    const nowMs = Date.now();
    setSessionStartedAtMs(nowMs);
    setWordStartedAtMs(nowMs);
  }, [isSessionFinished, words]);

  const advanceToNextWord = useCallback(() => {
    setCurrentIndex((previousIndex) => {
      if (!words || words.length === 0) return previousIndex;
      const nextIndex = previousIndex + 1;
      if (nextIndex >= words.length) {
        setIsSessionFinished(true);
        return previousIndex;
      }
      setWordStartedAtMs(Date.now());
      setIsRevealed(false);
      return nextIndex;
    });
  }, [words]);

  function restartSession() {
    if (!words) return;
    const nowMs = Date.now();
    setWords(shuffleWords(words));
    setCurrentIndex(0);
    setIsRevealed(false);
    setIsSessionFinished(false);
    setRatingsByWordId({});
    setIsRatingsSubmitted(false);
    setSessionStartedAtMs(nowMs);
    setWordStartedAtMs(nowMs);
  }

  useEffect(() => {
    if (timerHandleRef.current) {
      window.clearTimeout(timerHandleRef.current);
      timerHandleRef.current = null;
    }

    if (!words || words.length === 0) return;
    if (isSessionFinished) return;
    if (sessionMode !== "timer") return;
    if (!Number.isFinite(timerSeconds) || timerSeconds <= 0) return;
    if (!wordStartedAtMs) return;
    if (!currentWordId) return;

    const elapsedInWordMs = Date.now() - wordStartedAtMs;
    const remainingMs = Math.max(0, timerSeconds * 1000 - elapsedInWordMs);
    timerHandleRef.current = window.setTimeout(() => {
      advanceToNextWord();
    }, remainingMs);

    return () => {
      if (timerHandleRef.current) {
        window.clearTimeout(timerHandleRef.current);
        timerHandleRef.current = null;
      }
    };
  }, [
    advanceToNextWord,
    currentWordId,
    isSessionFinished,
    sessionMode,
    timerSeconds,
    wordStartedAtMs,
    words,
  ]);

  useEffect(() => {
    if (isSessionFinished) return;
    const intervalId = window.setInterval(() => setClockNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [isSessionFinished]);

  const elapsedTimeMs = useMemo(() => {
    if (!sessionStartedAtMs) return 0;
    return Math.max(0, clockNowMs - sessionStartedAtMs);
  }, [sessionStartedAtMs, clockNowMs]);

  const handleRatingKey = useCallback(
    (rating: SessionRating) => {
      if (currentWordId) {
        setRating(currentWordId, rating);
        advanceToNextWord();
      }
    },
    [advanceToNextWord, currentWordId],
  );

  useEffect(() => {
    if (!words || words.length === 0) return;
    if (isSessionFinished) return;

    function onKeyDown(event: KeyboardEvent) {
      const activeElement = document.activeElement;
      const activeTagName = activeElement ? activeElement.tagName.toLowerCase() : "";
      const isTypingContext = activeTagName === "input" || activeTagName === "textarea";
      if (isTypingContext) return;

      if (isRevealed && currentWordId) {
        const is1 = event.key === "1" || event.code === "Digit1" || event.code === "Numpad1";
        const is2 = event.key === "2" || event.code === "Digit2" || event.code === "Numpad2";
        const is3 = event.key === "3" || event.code === "Digit3" || event.code === "Numpad3";
        if (is1) {
          event.preventDefault();
          handleRatingKey("success");
          return;
        }
        if (is2) {
          event.preventDefault();
          handleRatingKey("partial");
          return;
        }
        if (is3) {
          event.preventDefault();
          handleRatingKey("fail");
          return;
        }
      }

      if (sessionMode === "manual") {
        if (event.key === "ArrowRight" || event.key === "Enter") {
          event.preventDefault();
          advanceToNextWord();
        }

        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setCurrentIndex((previousIndex) => Math.max(0, previousIndex - 1));
          setIsRevealed(false);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [advanceToNextWord, currentWordId, handleRatingKey, isRevealed, isSessionFinished, sessionMode, words]);

  const allSessionWordIds = useMemo(() => {
    return (words ?? []).map((word) => word.id);
  }, [words]);

  const isAllRated = useMemo(() => {
    if (!words || words.length === 0) return false;
    return allSessionWordIds.every((wordId) => {
      const rating = ratingsByWordId[wordId];
      return rating === "success" || rating === "partial" || rating === "fail";
    });
  }, [allSessionWordIds, ratingsByWordId, words]);

  const recapCounts = useMemo(() => {
    let successCount = 0;
    let partialCount = 0;
    let failCount = 0;
    for (const wordId of allSessionWordIds) {
      const rating = ratingsByWordId[wordId];
      if (rating === "success") successCount += 1;
      else if (rating === "partial") partialCount += 1;
      else if (rating === "fail") failCount += 1;
    }
    return { successCount, partialCount, failCount };
  }, [allSessionWordIds, ratingsByWordId]);

  const sessionScoreDelta = useMemo(() => {
    let delta = 0;
    for (const wordId of allSessionWordIds) {
      const rating = ratingsByWordId[wordId];
      if (!rating) continue;
      delta += computeSessionScoreDelta(rating);
    }
    return delta;
  }, [allSessionWordIds, ratingsByWordId]);

  const timerUi = useMemo(() => {
    if (!words || words.length === 0) return null;
    if (sessionMode !== "timer") return null;
    if (!sessionStartedAtMs || !wordStartedAtMs) return null;

    const totalMs = words.length * timerSeconds * 1000;
    const elapsedSessionMs = Math.min(totalMs, Math.max(0, clockNowMs - sessionStartedAtMs));
    const elapsedWordMs = Math.min(timerSeconds * 1000, Math.max(0, clockNowMs - wordStartedAtMs));
    const remainingWordMs = Math.max(0, timerSeconds * 1000 - elapsedWordMs);
    const progressPercent = totalMs > 0 ? Math.round((elapsedSessionMs / totalMs) * 100) : 0;

    return {
      totalMs,
      elapsedSessionMs,
      remainingWordMs,
      progressPercent,
    };
  }, [clockNowMs, sessionMode, sessionStartedAtMs, timerSeconds, wordStartedAtMs, words]);

  function getRandomPromptMode(seed: number): PromptMode {
    const modes: PromptMode[] = ["french", "romaji", "kana", "kanji"];
    return modes[seed % modes.length];
  }

  const actualPromptMode = useMemo(() => {
    if (shuffleMode && words && words.length > 0 && currentIndex < words.length) {
      return getRandomPromptMode(currentIndex);
    }
    return basePromptMode;
  }, [shuffleMode, basePromptMode, currentIndex, words]);

  const promptLabel = useMemo(() => {
    if (actualPromptMode === "french") return "FR";
    if (actualPromptMode === "romaji") return "Rōmaji";
    if (actualPromptMode === "kana") return "Kana";
    return "Kanji";
  }, [actualPromptMode]);

  const promptText = useMemo(() => {
    if (!currentWord) return "";
    const value =
      actualPromptMode === "french"
        ? currentWord.french
        : actualPromptMode === "romaji"
          ? currentWord.romaji
          : actualPromptMode === "kana"
            ? currentWord.kana
            : currentWord.kanji;
    return value ?? currentWord.french;
  }, [currentWord, actualPromptMode]);

  const revealFields = useMemo(() => {
    if (!currentWord) return [];
    const allFields: Array<{ key: PromptMode; label: string; value: string | null }> = [
      { key: "french", label: "FR", value: currentWord.french },
      { key: "kanji", label: "KANJI", value: currentWord.kanji },
      { key: "kana", label: "KANA", value: currentWord.kana },
      { key: "romaji", label: "RŌMAJI", value: currentWord.romaji },
    ];
    return allFields.filter((field) => field.key !== actualPromptMode);
  }, [currentWord, actualPromptMode]);

  function setRating(wordId: number, rating: SessionRating) {
    setRatingsByWordId((previousValue) => ({ ...previousValue, [wordId]: rating }));
  }

  async function submitRatings() {
    if (!words) return;

    const reviews = words
      .map((word) => {
        const rating = ratingsByWordId[word.id];
        if (!rating) return null;
        return {
          wordId: word.id,
          result: rating as SessionRating,
        };
      })
      .filter((review): review is { wordId: number; result: SessionRating } => review !== null);

    if (reviews.length === 0) return;

    setIsSubmitting(true);
    try {
      await submitBulkReviews(reviews);
      setIsRatingsSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  function goToPreviousWord() {
    setCurrentIndex((previousIndex) => Math.max(0, previousIndex - 1));
    setIsRevealed(false);
  }

  function handleCancelSession() {
    if (showCancelConfirm) {
      navigate(props.mode === "srs" ? "/srs" : "/");
    } else {
      setShowCancelConfirm(true);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: "var(--space-6)" }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{modeLabel}</div>
        <div className="muted" style={{ marginTop: 4 }}>
          Passe les mots, puis note toute la série à la fin.
        </div>
      </div>

      {isLoading ? (
        <div style={{ marginTop: 16 }} className="muted">
          Chargement…
        </div>
      ) : null}

      {errorMessage ? (
        <div style={{ marginTop: 16 }}>
          <div className="muted">Erreur: {errorMessage}</div>
        </div>
      ) : null}

      {!isLoading && words && words.length === 0 ? (
        <div style={{ marginTop: 16 }}>
          <div className="muted">Aucun mot à entraîner. Ajoute des mots dans l’onglet “Mots”.</div>
        </div>
      ) : null}

      {currentWord && !isSessionFinished ? (
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              marginBottom: "var(--space-6)",
              padding: "var(--space-5)",
              background: "var(--color-panel-subtle)",
              border: "2px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "var(--space-4)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-6)" }}>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--color-primary)" }}>
                Mot {words ? currentIndex + 1 : 0} / {words?.length ?? 0}
              </div>
              <div className="muted" style={{ fontSize: "16px" }}>
                Temps: <strong>{formatMs(elapsedTimeMs)}</strong>
              </div>
            </div>
            <button
              className="button"
              type="button"
              onClick={handleCancelSession}
              disabled={isSubmitting}
              style={{
                background: showCancelConfirm ? "var(--color-danger)" : "#fff",
                color: showCancelConfirm ? "#ffffff" : "var(--color-text-soft)",
                borderColor: showCancelConfirm ? "var(--color-danger)" : "var(--color-border)",
              }}
            >
              {showCancelConfirm ? "Confirmer l'annulation" : "Annuler la série"}
            </button>
          </div>

          {showCancelConfirm && (
            <div
              style={{
                marginBottom: "var(--space-6)",
                padding: "var(--space-5)",
                background: "rgba(199, 62, 29, 0.1)",
                border: "2px solid var(--color-primary)",
                borderRadius: "var(--radius-lg)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "var(--space-4)",
              }}
            >
              <div style={{ fontSize: "16px", fontWeight: 600 }}>
                Êtes-vous sûr de vouloir annuler cette série ? Vos progrès ne seront pas
                enregistrés.
              </div>
              <button
                className="button"
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                style={{ flexShrink: 0 }}
              >
                Non, continuer
              </button>
            </div>
          )}

          <div
            className="wordCard"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "500px",
              padding: "var(--space-12)",
              maxWidth: "900px",
              margin: "0 auto",
            }}
          >
            {timerUi ? (
              <div style={{ marginBottom: 12 }}>
                <div className="trainTimerRow">
                  <div className="muted" style={{ fontSize: 12 }}>
                    Mot: <strong>{formatMs(timerUi.remainingWordMs)}</strong> restant
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Total: <strong>{formatMs(timerUi.elapsedSessionMs)}</strong> /{" "}
                    <strong>{formatMs(timerUi.totalMs)}</strong> ({timerUi.progressPercent}%)
                  </div>
                </div>
                <div className="trainProgress">
                  <div
                    className="trainProgress__bar"
                    style={{ width: `${timerUi.progressPercent}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div
              className="wordCard__main"
              style={{
                fontSize: "64px",
                textAlign: "center",
                marginBottom: "var(--space-10)",
                fontWeight: 800,
                letterSpacing: "0.5px",
                lineHeight: 1.2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "12px",
              }}
            >
              {promptText}
              {actualPromptMode === "kana" && <AudioButton text={promptText} size="large" />}
            </div>

            {!isRevealed ? (
              <div className="row" style={{ gap: "var(--space-4)", marginTop: "var(--space-6)" }}>
                <button
                  className="button"
                  type="button"
                  onClick={goToPreviousWord}
                  disabled={currentIndex === 0 || isSubmitting}
                  style={{ padding: "var(--space-4) var(--space-6)", fontSize: "16px" }}
                >
                  ← Précédent
                </button>
                <button
                  className="button button--primary revealButton"
                  type="button"
                  onClick={() => setIsRevealed(true)}
                  style={{ padding: "var(--space-4) var(--space-8)", fontSize: "16px" }}
                >
                  Afficher la réponse
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={() => advanceToNextWord()}
                  disabled={isSubmitting}
                  style={{ padding: "var(--space-4) var(--space-6)", fontSize: "16px" }}
                >
                  Suivant →
                </button>
              </div>
            ) : (
              <>
                <div
                  className="wordCard__answer"
                  style={{
                    width: "100%",
                    maxWidth: "700px",
                    textAlign: "center",
                    marginBottom: "var(--space-8)",
                  }}
                >
                  <div
                    className="wordAnswerGrid"
                    style={{
                      gridTemplateColumns: "120px 1fr",
                      gap: "var(--space-5) var(--space-6)",
                      marginBottom: "var(--space-6)",
                    }}
                  >
                    {revealFields.map((field) => (
                      <React.Fragment key={field.key}>
                        <div
                          className="wordAnswerGrid__label"
                          style={{
                            fontSize: "14px",
                            textAlign: "right",
                            paddingTop: "var(--space-2)",
                          }}
                        >
                          {field.label}
                        </div>
                        <div
                          className="wordAnswerGrid__value"
                          style={{
                            fontSize: "28px",
                            fontWeight: 700,
                            textAlign: "left",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          {field.value ?? "—"}
                          {field.key === "kana" && <AudioButton text={field.value ?? ""} size="medium" />}
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  {currentWord.note ? (
                    <div
                      style={{
                        marginTop: "var(--space-8)",
                        padding: "var(--space-5)",
                        background: "var(--color-panel-subtle)",
                        borderRadius: "var(--radius-lg)",
                        fontSize: "16px",
                        lineHeight: 1.6,
                      }}
                      className="muted"
                    >
                      {currentWord.note}
                    </div>
                  ) : null}
                  {currentWordKanji.length > 0 && (
                    <div style={{ marginTop: "var(--space-6)" }}>
                      <button
                        className="button"
                        type="button"
                        onClick={handleShowKanjiStroke}
                        style={{
                          padding: "var(--space-3) var(--space-5)",
                          fontSize: "14px",
                        }}
                      >
                        Voir le sens de tracé ({currentWordKanji.length} kanji)
                      </button>
                    </div>
                  )}
                </div>
                <div className="row" style={{ gap: "var(--space-4)", flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    className="button"
                    type="button"
                    onClick={goToPreviousWord}
                    disabled={currentIndex === 0 || isSubmitting}
                    style={{ padding: "var(--space-4) var(--space-6)", fontSize: "16px" }}
                  >
                    ← Précédent
                  </button>
                  <div
                    className="ratingGroup"
                    style={{
                      display: "flex",
                      gap: "var(--space-3)",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      className={`button ratingButton ${ratingsByWordId[currentWordId ?? 0] === "success" ? "button--success" : ""}`}
                      type="button"
                      onClick={() => handleRatingKey("success")}
                      disabled={isSubmitting}
                      aria-label="Réussi (1)"
                      title="Réussi — touche 1"
                      style={{
                        padding: "var(--space-5) var(--space-8)",
                        fontSize: "18px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "var(--space-1)",
                        minWidth: 100,
                      }}
                    >
                      <span style={{ fontSize: "28px" }}>✅</span>
                      <span style={{ fontSize: "13px", fontWeight: 600 }}>Réussi (1)</span>
                    </button>
                    <button
                      className={`button ratingButton ${ratingsByWordId[currentWordId ?? 0] === "partial" ? "button--warning" : ""}`}
                      type="button"
                      onClick={() => handleRatingKey("partial")}
                      disabled={isSubmitting}
                      aria-label="Partiel (2)"
                      title="Partiel — touche 2"
                      style={{
                        padding: "var(--space-5) var(--space-8)",
                        fontSize: "18px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "var(--space-1)",
                        minWidth: 100,
                      }}
                    >
                      <span style={{ fontSize: "28px" }}>⚠️</span>
                      <span style={{ fontSize: "13px", fontWeight: 600 }}>Partiel (2)</span>
                    </button>
                    <button
                      className={`button ratingButton ${ratingsByWordId[currentWordId ?? 0] === "fail" ? "button--danger" : ""}`}
                      type="button"
                      onClick={() => handleRatingKey("fail")}
                      disabled={isSubmitting}
                      aria-label="Raté (3)"
                      title="Raté — touche 3"
                      style={{
                        padding: "var(--space-5) var(--space-8)",
                        fontSize: "18px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "var(--space-1)",
                        minWidth: 100,
                      }}
                    >
                      <span style={{ fontSize: "28px" }}>❌</span>
                      <span style={{ fontSize: "13px", fontWeight: 600 }}>Raté (3)</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div
            className="muted"
            style={{
              marginTop: "var(--space-4)",
              fontSize: 13,
              padding: "var(--space-3)",
              background: "var(--color-panel-subtle)",
              borderRadius: "var(--radius-md)",
            }}
          >
            Mode <strong>{sessionMode === "manual" ? (shuffleMode ? "manuel (aléatoire)" : "manuel") : `timer ${timerSeconds}s`}</strong> —
            Question: <strong>{promptLabel}</strong>
            {sessionMode === "manual" ? (
              <>
                {" "}
                — Clique ou <strong>1</strong> ✅ <strong>2</strong> ⚠️ <strong>3</strong> ❌ pour
                noter, <strong>→</strong>/<strong>Entrée</strong> avancer, <strong>←</strong> revenir
              </>
            ) : (
              isRevealed && (
                <>
                  {" "}
                  — Touches <strong>1</strong> <strong>2</strong> <strong>3</strong> pour noter
                </>
              )
            )}
          </div>
        </div>
      ) : null}

      {isSessionFinished && words && words.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <div className="wordCard">
            <div style={{ fontWeight: 800, fontSize: 18 }}>Fin de série — récap & notation</div>
            <div className="muted" style={{ marginTop: 6 }}>
              {recapCounts.successCount + recapCounts.partialCount + recapCounts.failCount} mot(s)
              noté(s) sur {words.length}. ✅ {recapCounts.successCount} / ⚠️{" "}
              {recapCounts.partialCount} / ❌ {recapCounts.failCount}
            </div>

            <div style={{ marginTop: 16 }}>
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th>Français</th>
                    <th>JP</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {words.map((word) => (
                    <tr key={word.id}>
                      <td>{word.french}</td>
                      <td className="muted">{word.kanji ?? word.kana ?? word.romaji ?? "—"}</td>
                      <td className="ratingCell">
                        <div className="ratingGroup">
                          <button
                            className={`button ratingButton ${ratingsByWordId[word.id] === "success" ? "button--success" : ""}`}
                            type="button"
                            onClick={() => setRating(word.id, "success")}
                            aria-label="Réussi"
                          >
                            ✅
                          </button>
                          <button
                            className={`button ratingButton ${ratingsByWordId[word.id] === "partial" ? "button--warning" : ""}`}
                            type="button"
                            onClick={() => setRating(word.id, "partial")}
                            aria-label="Partiellement"
                          >
                            ⚠️
                          </button>
                          <button
                            className={`button ratingButton ${ratingsByWordId[word.id] === "fail" ? "button--danger" : ""}`}
                            type="button"
                            onClick={() => setRating(word.id, "fail")}
                            aria-label="Raté"
                          >
                            ❌
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 12, fontSize: 28, fontWeight: 800 }}>
              Score session: {sessionScoreDelta >= 0 ? `+${sessionScoreDelta}` : sessionScoreDelta}
            </div>

            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="button button--primary"
                type="button"
                onClick={() => submitRatings()}
                disabled={isSubmitting || isRatingsSubmitted}
              >
                {isRatingsSubmitted ? "Série enregistrée" : "Enregistrer la série"}
              </button>
              <button
                className="button"
                type="button"
                onClick={() => restartSession()}
                disabled={isSubmitting}
              >
                Recommencer
              </button>
              <Link className="button" to={props.mode === "srs" ? "/srs" : "/"}>
                {props.mode === "srs" ? "Retour au SRS" : "Retour aux séries"}
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal pour le visualiseur de kanji */}
      {showKanjiViewer && selectedKanjiForViewer && (
        <KanjiViewerModal
          kanjiList={currentWordKanji}
          selectedKanji={selectedKanjiForViewer}
          onSelectKanji={setSelectedKanjiForViewer}
          onClose={() => {
            setShowKanjiViewer(false);
            setSelectedKanjiForViewer(null);
          }}
        />
      )}
    </div>
  );
}

function shuffleWords(words: WordWithStats[]): WordWithStats[] {
  const shuffledWords = [...words];
  for (let index = shuffledWords.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const tempWord = shuffledWords[index];
    shuffledWords[index] = shuffledWords[swapIndex];
    shuffledWords[swapIndex] = tempWord;
  }
  return shuffledWords;
}

function computeSessionScoreDelta(rating: SessionRating): number {
  if (rating === "success") return 5;
  if (rating === "partial") return 3;
  return 1;
}

function formatMs(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Modal pour afficher le visualiseur de kanji
 */
function KanjiViewerModal({
  kanjiList,
  selectedKanji,
  onSelectKanji,
  onClose,
}: {
  kanjiList: string[];
  selectedKanji: string;
  onSelectKanji: (kanji: string) => void;
  onClose: () => void;
}) {
  const [showNumbers, setShowNumbers] = useState(false);
  const [animate, setAnimate] = useState(false);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        padding: "var(--space-6)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--color-panel)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-8)",
          maxWidth: "600px",
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          border: "2px solid var(--color-border)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "var(--space-6)",
          }}
        >
          <h2 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>Sens de tracé</h2>
          <button
            className="button"
            type="button"
            onClick={onClose}
            style={{
              padding: "var(--space-2) var(--space-4)",
              fontSize: "18px",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {kanjiList.length > 1 && (
          <div style={{ marginBottom: "var(--space-6)" }}>
            <div className="field__label" style={{ marginBottom: "var(--space-3)" }}>
              Choisir un kanji
            </div>
            <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
              {kanjiList.map((kanji) => (
                <button
                  key={kanji}
                  type="button"
                  className={`button ${selectedKanji === kanji ? "button--primary" : ""}`}
                  onClick={() => {
                    onSelectKanji(kanji);
                    setShowNumbers(false);
                    setAnimate(false);
                  }}
                  style={{
                    fontSize: "24px",
                    padding: "var(--space-3) var(--space-5)",
                    minWidth: "60px",
                  }}
                >
                  {kanji}
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          style={{
            marginBottom: "var(--space-6)",
            display: "flex",
            gap: "var(--space-4)",
            flexWrap: "wrap",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={showNumbers}
              onChange={(e) => setShowNumbers(e.target.checked)}
            />
            <span>Afficher les numéros</span>
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={animate}
              onChange={(e) => setAnimate(e.target.checked)}
            />
            <span>Animer le tracé</span>
          </label>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--space-4)",
            padding: "var(--space-6)",
            background: "var(--color-panel-subtle)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <div style={{ fontSize: "18px", fontWeight: 700 }}>{selectedKanji}</div>
          <KanjiStrokeViewer
            kanji={selectedKanji}
            showNumbers={showNumbers}
            animate={animate}
            size={300}
          />
        </div>
      </div>
    </div>
  );
}
